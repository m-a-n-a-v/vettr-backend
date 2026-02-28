import { Hono } from 'hono';
import { cronAuthMiddleware } from '../middleware/cron-auth.js';
import { refreshMarketDataChunk, refreshScoresChunk, refreshRedFlagsChunk, cleanupOrphanData } from '../services/cron.service.js';
import { success } from '../utils/response.js';
import * as cache from '../services/cache.service.js';
import { db } from '../config/database.js';
import { stocks, cronJobRuns, vetrScoreSnapshots } from '../db/schema/index.js';
import { count, desc, sql } from 'drizzle-orm';
import { InternalError } from '../utils/errors.js';
import { getSnapshotCount, cleanupOldSnapshots } from '../services/snapshot.service.js';

const cronRoutes = new Hono();

// Apply cron auth middleware to all cron routes
cronRoutes.use('*', cronAuthMiddleware);

/**
 * GET /cron/market-data
 * Fetches fresh prices, financials, and volume from Yahoo Finance.
 * Updates stocks + financial_data tables.
 * Runs at :00 every 2 hours. 1000 tickers per chunk.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/market-data', async (c) => {
  const result = await refreshMarketDataChunk();
  return c.json(success(result));
});

/**
 * GET /cron/scores
 * Refreshes VETR scores for a chunk of stocks (default 1000).
 * Runs at :20 every 2 hours (after market data is updated).
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/scores', async (c) => {
  const result = await refreshScoresChunk();
  return c.json(success(result));
});

/**
 * GET /cron/red-flags
 * Refreshes red flags for a chunk of stocks (default 1000).
 * Runs at :40 every 2 hours (after scores are updated).
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/red-flags', async (c) => {
  const result = await refreshRedFlagsChunk();
  return c.json(success(result));
});

/**
 * GET /cron/status
 * Returns current cron job progress for all 3 jobs.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/status', async (c) => {
  const marketDataOffset = (await cache.get<number>('cron:market-data:offset')) || 0;
  const scoresOffset = (await cache.get<number>('cron:scores:offset')) || 0;
  const redFlagsOffset = (await cache.get<number>('cron:red-flags:offset')) || 0;

  if (!db) {
    throw new InternalError('Database not available');
  }

  const [{ value: totalStocks }] = await db
    .select({ value: count() })
    .from(stocks);

  const pct = (offset: number) => totalStocks > 0
    ? Math.round((offset / totalStocks) * 100)
    : 0;

  return c.json(success({
    market_data_offset: marketDataOffset,
    scores_offset: scoresOffset,
    red_flags_offset: redFlagsOffset,
    total_stocks: totalStocks,
    market_data_progress_pct: pct(marketDataOffset),
    scores_progress_pct: pct(scoresOffset),
    red_flags_progress_pct: pct(redFlagsOffset),
  }));
});

/**
 * GET /cron/reset
 * Resets all Redis cursor keys to 0, forcing a full re-run from the beginning.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/reset', async (c) => {
  await cache.del('cron:market-data:offset');
  await cache.del('cron:scores:offset');
  await cache.del('cron:red-flags:offset');

  return c.json(success({
    message: 'All cron cursors reset',
  }));
});

/**
 * GET /cron/history
 * Returns the last 50 cron job execution history records.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/history', async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const history = await db
    .select()
    .from(cronJobRuns)
    .orderBy(desc(cronJobRuns.startedAt))
    .limit(50);

  return c.json(success({
    runs: history,
    total: history.length,
  }));
});

/**
 * GET /cron/snapshot-stats
 * Returns statistics about the snapshots table: total count, oldest and newest snapshot.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/snapshot-stats', async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const totalSnapshots = await getSnapshotCount();

  const [stats] = await db
    .select({
      oldest: sql<string | null>`min(${vetrScoreSnapshots.recordedAt})::text`,
      newest: sql<string | null>`max(${vetrScoreSnapshots.recordedAt})::text`,
    })
    .from(vetrScoreSnapshots);

  return c.json(success({
    total_snapshots: totalSnapshots,
    oldest_snapshot: stats?.oldest ?? null,
    newest_snapshot: stats?.newest ?? null,
  }));
});

/**
 * POST /cron/snapshot-cleanup
 * Deletes snapshots older than the retention period.
 * Query param: retention_days (optional, default 90)
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.post('/snapshot-cleanup', async (c) => {
  const retentionDaysParam = c.req.query('retention_days');
  const retentionDays = retentionDaysParam ? parseInt(retentionDaysParam, 10) : 90;

  // Validate retention_days is a positive number
  if (isNaN(retentionDays) || retentionDays <= 0) {
    return c.json(
      {
        success: false,
        error: 'retention_days must be a positive number',
      },
      400
    );
  }

  const deleted = await cleanupOldSnapshots(retentionDays);

  return c.json(success({
    deleted,
    retention_days: retentionDays,
  }));
});

/**
 * GET /cron/news
 * Fetches news articles from BNN Bloomberg RSS feed.
 * Parses, deduplicates, and inserts into news_articles table.
 * Also generates filing calendar entries for stocks with known fiscal year ends.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/news', async (c) => {
  if (!db) throw new InternalError('Database not available');

  const { newsArticles } = await import('../db/schema/index.js');
  const { eq } = await import('drizzle-orm');

  let articlesAdded = 0;
  let filingsAdded = 0;

  // ── 1. Fetch BNN Bloomberg RSS ──
  try {
    const RSS_URL = 'https://www.bnnbloomberg.ca/arc/outboundfeeds/rss/';
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'VETTR/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const xml = await res.text();

      // Parse RSS items
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match: RegExpExecArray | null;
      const parsedItems: Array<{
        title: string;
        link: string;
        description: string;
        pubDate: string;
        imageUrl: string | null;
      }> = [];

      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];

        const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                          block.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
        const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                         block.match(/<description>([\s\S]*?)<\/description>/);
        const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const mediaMatch = block.match(/<media:content[^>]+url="([^"]+)"/);

        const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() ?? '';
        const link = linkMatch?.[1]?.trim() ?? '';

        if (title && link) {
          parsedItems.push({
            title,
            link,
            description: descMatch?.[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() ?? '',
            pubDate: dateMatch?.[1]?.trim() ?? '',
            imageUrl: mediaMatch?.[1]?.replace(/&amp;/g, '&') ?? null,
          });
        }
      }

      // Get all known tickers from DB for matching
      const allStocks = await db.select({ ticker: stocks.ticker }).from(stocks);
      const tickerSet = new Set(allStocks.map((s) => s.ticker.toUpperCase()));

      // Insert articles (dedup by source_url)
      for (const item of parsedItems) {
        try {
          // Check if article already exists by source_url
          const existing = await db
            .select({ id: newsArticles.id })
            .from(newsArticles)
            .where(eq(newsArticles.sourceUrl, item.link))
            .limit(1);

          if (existing.length > 0) continue;

          // Detect tickers mentioned in title or description
          const combinedText = `${item.title} ${item.description}`.toUpperCase();
          const detectedTickers = Array.from(tickerSet).filter((t) =>
            t.length >= 2 && new RegExp(`\\b${t.replace('.', '\\.')}\\b`).test(combinedText)
          );

          // Detect if it might be material (keywords)
          const materialKeywords = ['material change', 'acquisition', 'merger', 'bankruptcy', 'delisted', 'halt', 'cease trade', 'insider'];
          const isMaterial = materialKeywords.some((kw) => combinedText.toLowerCase().includes(kw));

          // Detect sectors
          const sectorKeywords: Record<string, string> = {
            'mining': 'Mining', 'gold': 'Mining', 'copper': 'Mining', 'lithium': 'Mining',
            'oil': 'Energy', 'gas': 'Energy', 'energy': 'Energy', 'pipeline': 'Energy',
            'cannabis': 'Cannabis', 'marijuana': 'Cannabis',
            'tech': 'Technology', 'software': 'Technology', 'ai': 'Technology',
          };
          const detectedSectors = new Set<string>();
          for (const [kw, sector] of Object.entries(sectorKeywords)) {
            if (combinedText.toLowerCase().includes(kw)) detectedSectors.add(sector);
          }

          await db.insert(newsArticles).values({
            source: 'bnn',
            sourceUrl: item.link,
            title: item.title.substring(0, 500),
            summary: item.description.substring(0, 2000) || null,
            imageUrl: item.imageUrl,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            tickers: detectedTickers.length > 0 ? detectedTickers.join(',') : null,
            sectors: detectedSectors.size > 0 ? Array.from(detectedSectors).join(',') : null,
            isMaterial,
          });

          articlesAdded++;
        } catch (err) {
          // Skip individual article errors (e.g., constraint violations)
          console.error('Failed to insert article:', item.title.substring(0, 50), err);
        }
      }
    }
  } catch (err) {
    console.error('BNN RSS fetch failed:', err);
  }

  // ── 2. Generate filing calendar entries for tracked stocks ──
  try {
    const { filingCalendar } = await import('../db/schema/index.js');

    // Get stocks that don't have recent filing calendar entries
    const existingFilings = await db
      .select({ ticker: filingCalendar.ticker })
      .from(filingCalendar)
      .limit(1000);
    const filingsTickerSet = new Set(existingFilings.map((f) => f.ticker));

    // Get first 50 stocks without filing calendar entries
    const stocksWithoutFilings = await db
      .select({
        id: stocks.id,
        ticker: stocks.ticker,
        companyName: stocks.name,
      })
      .from(stocks)
      .limit(50);

    const newStocks = stocksWithoutFilings.filter((s) => !filingsTickerSet.has(s.ticker));

    // Create quarterly and annual filing entries for new stocks
    const now = new Date();
    const currentYear = now.getFullYear();

    for (const stock of newStocks.slice(0, 20)) {
      try {
        // Q1 through Q4 quarterly filings + annual report
        const filingEntries = [
          { type: 'Q1 Quarterly Report', month: 5, day: 15 },
          { type: 'Q2 Quarterly Report', month: 8, day: 15 },
          { type: 'Q3 Quarterly Report', month: 11, day: 15 },
          { type: 'Annual Report', month: 3, day: 31 },
        ];

        for (const entry of filingEntries) {
          const expectedDate = new Date(currentYear, entry.month - 1, entry.day);
          const status = expectedDate < now ? 'overdue' : 'upcoming';

          await db.insert(filingCalendar).values({
            stockId: stock.id,
            ticker: stock.ticker,
            companyName: stock.companyName,
            filingType: entry.type,
            expectedDate: expectedDate.toISOString().split('T')[0]!,
            status,
            sourceUrl: `https://www.sedarplus.ca/csa-party/records/record.html?q=${encodeURIComponent(stock.companyName)}`,
          });

          filingsAdded++;
        }
      } catch (err) {
        console.error(`Filing calendar generation failed for ${stock.ticker}:`, err);
      }
    }
  } catch (err) {
    console.error('Filing calendar generation failed:', err);
  }

  return c.json(success({
    sources_checked: ['bnn'],
    articles_added: articlesAdded,
    filings_added: filingsAdded,
  }));
});

/**
 * GET /cron/portfolio-insights
 * Generates portfolio insights for all active portfolios.
 * Runs after market data and scores are updated.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/portfolio-insights', async (c) => {
  if (!db) throw new InternalError('Database not available');

  const { portfolios: portfoliosTable } = await import('../db/schema/index.js');
  const { generateInsights } = await import('../services/portfolio-insights.service.js');

  const allPortfolios = await db
    .select({ id: portfoliosTable.id })
    .from(portfoliosTable)
    .limit(500);

  let totalInsights = 0;

  for (const portfolio of allPortfolios) {
    try {
      const insightCount = await generateInsights(portfolio.id);
      totalInsights += insightCount;
    } catch (err) {
      console.error(`Insight generation failed for portfolio ${portfolio.id}:`, err);
    }
  }

  return c.json(success({
    portfolios_processed: allPortfolios.length,
    insights_created: totalInsights,
  }));
});

/**
 * GET /cron/cleanup
 * Deletes stale refresh tokens (expired or revoked, older than 7 days)
 * and cron_job_runs rows older than 7 days.
 * Returns deletion counts for observability.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>
 */
cronRoutes.get('/cleanup', async (c) => {
  const stats = await cleanupOrphanData();
  return c.json(success(stats));
});

export { cronRoutes };
