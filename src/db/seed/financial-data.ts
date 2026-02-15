import { db } from '../../config/database.js';
import { financialData, stocks } from '../schema/index.js';
import { eq } from 'drizzle-orm';

/**
 * Financial data seed for 25 Canadian pilot stocks.
 * Sector-realistic values derived from market cap and sector.
 * Mining stocks have exploration_exp, tech stocks have r_and_d_exp.
 * 2-3 stocks have null cash/burn to test null pillar handling.
 */

interface FinancialDataSeed {
  ticker: string;
  cash: number | null;
  monthlyBurn: number | null;
  totalDebt: number;
  totalAssets: number;
  explorationExp: number | null;
  rAndDExp: number | null;
  totalOpex: number;
  gAndAExpense: number;
  revenue: number;
  sharesCurrent: number;
  shares1YrAgo: number;
  insiderShares: number;
  totalShares: number;
  avgVol30d: number;
  daysSinceLastPr: number;
}

const financialDataSeed: FinancialDataSeed[] = [
  {
    ticker: 'NXE',
    cash: 325000000,
    monthlyBurn: 8500000,
    totalDebt: 0,
    totalAssets: 520000000,
    explorationExp: 45000000,
    rAndDExp: null,
    totalOpex: 102000000,
    gAndAExpense: 18000000,
    revenue: 0, // Pre-production
    sharesCurrent: 489000000,
    shares1YrAgo: 482000000,
    insiderShares: 48900000,
    totalShares: 489000000,
    avgVol30d: 1200000,
    daysSinceLastPr: 12,
  },
  {
    ticker: 'ARIS',
    cash: 185000000,
    monthlyBurn: 6200000,
    totalDebt: 125000000,
    totalAssets: 980000000,
    explorationExp: 28000000,
    rAndDExp: null,
    totalOpex: 165000000,
    gAndAExpense: 22000000,
    revenue: 425000000,
    sharesCurrent: 289000000,
    shares1YrAgo: 276000000,
    insiderShares: 34680000,
    totalShares: 289000000,
    avgVol30d: 850000,
    daysSinceLastPr: 8,
  },
  {
    ticker: 'LUN',
    cash: 425000000,
    monthlyBurn: -15000000, // Profitable, negative burn
    totalDebt: 1450000000,
    totalAssets: 8900000000,
    explorationExp: 62000000,
    rAndDExp: null,
    totalOpex: 720000000,
    gAndAExpense: 98000000,
    revenue: 3200000000,
    sharesCurrent: 778000000,
    shares1YrAgo: 775000000,
    insiderShares: 38900000,
    totalShares: 778000000,
    avgVol30d: 2800000,
    daysSinceLastPr: 5,
  },
  {
    ticker: 'FM',
    cash: null, // Null cash/burn for testing
    monthlyBurn: null,
    totalDebt: 6250000000,
    totalAssets: 14800000000,
    explorationExp: 85000000,
    rAndDExp: null,
    totalOpex: 1250000000,
    gAndAExpense: 178000000,
    revenue: 6800000000,
    sharesCurrent: 690000000,
    shares1YrAgo: 672000000,
    insiderShares: 34500000,
    totalShares: 690000000,
    avgVol30d: 3200000,
    daysSinceLastPr: 3,
  },
  {
    ticker: 'TKO',
    cash: 48000000,
    monthlyBurn: 4500000,
    totalDebt: 340000000,
    totalAssets: 1120000000,
    explorationExp: 12000000,
    rAndDExp: null,
    totalOpex: 145000000,
    gAndAExpense: 18500000,
    revenue: 325000000,
    sharesCurrent: 285000000,
    shares1YrAgo: 270000000,
    insiderShares: 14250000,
    totalShares: 285000000,
    avgVol30d: 580000,
    daysSinceLastPr: 18,
  },
  {
    ticker: 'ERO',
    cash: 155000000,
    monthlyBurn: -8000000, // Profitable
    totalDebt: 425000000,
    totalAssets: 2150000000,
    explorationExp: 35000000,
    rAndDExp: null,
    totalOpex: 285000000,
    gAndAExpense: 42000000,
    revenue: 825000000,
    sharesCurrent: 92000000,
    shares1YrAgo: 88500000,
    insiderShares: 9200000,
    totalShares: 92000000,
    avgVol30d: 420000,
    daysSinceLastPr: 6,
  },
  {
    ticker: 'CS',
    cash: 285000000,
    monthlyBurn: -12000000, // Profitable
    totalDebt: 980000000,
    totalAssets: 5250000000,
    explorationExp: 48000000,
    rAndDExp: null,
    totalOpex: 580000000,
    gAndAExpense: 78000000,
    revenue: 1850000000,
    sharesCurrent: 695000000,
    shares1YrAgo: 685000000,
    insiderShares: 34750000,
    totalShares: 695000000,
    avgVol30d: 1450000,
    daysSinceLastPr: 10,
  },
  {
    ticker: 'MAG',
    cash: 92000000,
    monthlyBurn: 3200000,
    totalDebt: 0,
    totalAssets: 385000000,
    explorationExp: 18000000,
    rAndDExp: null,
    totalOpex: 38400000,
    gAndAExpense: 8200000,
    revenue: 0, // Development stage
    sharesCurrent: 100000000,
    shares1YrAgo: 98000000,
    insiderShares: 20000000,
    totalShares: 100000000,
    avgVol30d: 380000,
    daysSinceLastPr: 14,
  },
  {
    ticker: 'FVI',
    cash: 125000000,
    monthlyBurn: -4500000, // Profitable
    totalDebt: 180000000,
    totalAssets: 1280000000,
    explorationExp: 22000000,
    rAndDExp: null,
    totalOpex: 195000000,
    gAndAExpense: 28000000,
    revenue: 485000000,
    sharesCurrent: 301000000,
    shares1YrAgo: 298000000,
    insiderShares: 60200000,
    totalShares: 301000000,
    avgVol30d: 620000,
    daysSinceLastPr: 7,
  },
  {
    ticker: 'WPM',
    cash: 850000000,
    monthlyBurn: -42000000, // Highly profitable
    totalDebt: 1250000000,
    totalAssets: 12500000000,
    explorationExp: null, // Royalty/streaming, no exploration
    rAndDExp: null,
    totalOpex: 125000000,
    gAndAExpense: 48000000,
    revenue: 1450000000,
    sharesCurrent: 453000000,
    shares1YrAgo: 452000000,
    insiderShares: 45300000,
    totalShares: 453000000,
    avgVol30d: 2100000,
    daysSinceLastPr: 4,
  },
  {
    ticker: 'AEM',
    cash: 1250000000,
    monthlyBurn: -85000000, // Highly profitable
    totalDebt: 1800000000,
    totalAssets: 28500000000,
    explorationExp: 125000000,
    rAndDExp: null,
    totalOpex: 1850000000,
    gAndAExpense: 245000000,
    revenue: 6250000000,
    sharesCurrent: 496000000,
    shares1YrAgo: 494000000,
    insiderShares: 24800000,
    totalShares: 496000000,
    avgVol30d: 2850000,
    daysSinceLastPr: 2,
  },
  {
    ticker: 'OR',
    cash: 225000000,
    monthlyBurn: -12000000, // Profitable
    totalDebt: 485000000,
    totalAssets: 3850000000,
    explorationExp: null, // Royalty company
    rAndDExp: null,
    totalOpex: 42000000,
    gAndAExpense: 18500000,
    revenue: 385000000,
    sharesCurrent: 182000000,
    shares1YrAgo: 180000000,
    insiderShares: 18200000,
    totalShares: 182000000,
    avgVol30d: 950000,
    daysSinceLastPr: 9,
  },
  {
    ticker: 'ELD',
    cash: null, // Null cash/burn for testing
    monthlyBurn: null,
    totalDebt: 580000000,
    totalAssets: 4250000000,
    explorationExp: 48000000,
    rAndDExp: null,
    totalOpex: 485000000,
    gAndAExpense: 62000000,
    revenue: 925000000,
    sharesCurrent: 205000000,
    shares1YrAgo: 198000000,
    insiderShares: 10250000,
    totalShares: 205000000,
    avgVol30d: 1850000,
    daysSinceLastPr: 11,
  },
  {
    ticker: 'SII',
    cash: 185000000,
    monthlyBurn: -8500000, // Profitable financial services
    totalDebt: 125000000,
    totalAssets: 2850000000,
    explorationExp: null, // Financial services
    rAndDExp: 4200000, // Tech/software for asset management
    totalOpex: 95000000,
    gAndAExpense: 52000000,
    revenue: 285000000,
    sharesCurrent: 26000000,
    shares1YrAgo: 26000000,
    insiderShares: 5200000,
    totalShares: 26000000,
    avgVol30d: 85000,
    daysSinceLastPr: 15,
  },
  {
    ticker: 'BTO',
    cash: 385000000,
    monthlyBurn: -22000000, // Profitable
    totalDebt: 425000000,
    totalAssets: 5850000000,
    explorationExp: 68000000,
    rAndDExp: null,
    totalOpex: 685000000,
    gAndAExpense: 92000000,
    revenue: 1650000000,
    sharesCurrent: 1305000000,
    shares1YrAgo: 1285000000,
    insiderShares: 65250000,
    totalShares: 1305000000,
    avgVol30d: 3850000,
    daysSinceLastPr: 6,
  },
  {
    ticker: 'NGD',
    cash: 68000000,
    monthlyBurn: 5200000,
    totalDebt: 485000000,
    totalAssets: 2150000000,
    explorationExp: 28000000,
    rAndDExp: null,
    totalOpex: 285000000,
    gAndAExpense: 38000000,
    revenue: 625000000,
    sharesCurrent: 680000000,
    shares1YrAgo: 640000000,
    insiderShares: 34000000,
    totalShares: 680000000,
    avgVol30d: 4250000,
    daysSinceLastPr: 22,
  },
  {
    ticker: 'IMG',
    cash: null, // Null cash/burn for testing (3rd one)
    monthlyBurn: null,
    totalDebt: 725000000,
    totalAssets: 3850000000,
    explorationExp: 42000000,
    rAndDExp: null,
    totalOpex: 485000000,
    gAndAExpense: 58000000,
    revenue: 1150000000,
    sharesCurrent: 504000000,
    shares1YrAgo: 485000000,
    insiderShares: 25200000,
    totalShares: 504000000,
    avgVol30d: 2850000,
    daysSinceLastPr: 17,
  },
  {
    ticker: 'MND',
    cash: 28000000,
    monthlyBurn: 2800000,
    totalDebt: 85000000,
    totalAssets: 485000000,
    explorationExp: 8500000,
    rAndDExp: null,
    totalOpex: 58000000,
    gAndAExpense: 9200000,
    revenue: 165000000,
    sharesCurrent: 97000000,
    shares1YrAgo: 92000000,
    insiderShares: 9700000,
    totalShares: 97000000,
    avgVol30d: 185000,
    daysSinceLastPr: 25,
  },
  {
    ticker: 'LUG',
    cash: 295000000,
    monthlyBurn: -18000000, // Profitable
    totalDebt: 285000000,
    totalAssets: 3250000000,
    explorationExp: 38000000,
    rAndDExp: null,
    totalOpex: 385000000,
    gAndAExpense: 52000000,
    revenue: 985000000,
    sharesCurrent: 241000000,
    shares1YrAgo: 238000000,
    insiderShares: 24100000,
    totalShares: 241000000,
    avgVol30d: 680000,
    daysSinceLastPr: 5,
  },
  {
    ticker: 'KRR',
    cash: 95000000,
    monthlyBurn: -4200000, // Profitable
    totalDebt: 125000000,
    totalAssets: 1180000000,
    explorationExp: 18000000,
    rAndDExp: null,
    totalOpex: 185000000,
    gAndAExpense: 22000000,
    revenue: 485000000,
    sharesCurrent: 236000000,
    shares1YrAgo: 228000000,
    insiderShares: 47200000,
    totalShares: 236000000,
    avgVol30d: 580000,
    daysSinceLastPr: 13,
  },
  {
    ticker: 'RIO',
    cash: 12000000,
    monthlyBurn: 1850000,
    totalDebt: 8500000,
    totalAssets: 125000000,
    explorationExp: 5800000,
    rAndDExp: null,
    totalOpex: 22200000,
    gAndAExpense: 4200000,
    revenue: 0, // Development stage
    sharesCurrent: 356000000,
    shares1YrAgo: 325000000,
    insiderShares: 35600000,
    totalShares: 356000000,
    avgVol30d: 285000,
    daysSinceLastPr: 38,
  },
  {
    ticker: 'SBB',
    cash: 85000000,
    monthlyBurn: 4200000,
    totalDebt: 0,
    totalAssets: 525000000,
    explorationExp: 22000000,
    rAndDExp: null,
    totalOpex: 50400000,
    gAndAExpense: 12000000,
    revenue: 0, // Development stage
    sharesCurrent: 1254000000,
    shares1YrAgo: 1185000000,
    insiderShares: 125400000,
    totalShares: 1254000000,
    avgVol30d: 1250000,
    daysSinceLastPr: 20,
  },
  {
    ticker: 'GPL',
    cash: 8500000,
    monthlyBurn: 2200000,
    totalDebt: 28000000,
    totalAssets: 125000000,
    explorationExp: 3200000,
    rAndDExp: null,
    totalOpex: 32000000,
    gAndAExpense: 6800000,
    revenue: 78000000,
    sharesCurrent: 340000000,
    shares1YrAgo: 310000000,
    insiderShares: 17000000,
    totalShares: 340000000,
    avgVol30d: 1850000,
    daysSinceLastPr: 45,
  },
  {
    ticker: 'FR',
    cash: 185000000,
    monthlyBurn: -8500000, // Profitable
    totalDebt: 225000000,
    totalAssets: 1950000000,
    explorationExp: 28000000,
    rAndDExp: null,
    totalOpex: 285000000,
    gAndAExpense: 42000000,
    revenue: 685000000,
    sharesCurrent: 293000000,
    shares1YrAgo: 288000000,
    insiderShares: 58600000,
    totalShares: 293000000,
    avgVol30d: 1450000,
    daysSinceLastPr: 8,
  },
  {
    ticker: 'AG',
    cash: 185000000,
    monthlyBurn: -8500000, // Profitable (same as FR, NYSE listing)
    totalDebt: 225000000,
    totalAssets: 1950000000,
    explorationExp: 28000000,
    rAndDExp: null,
    totalOpex: 285000000,
    gAndAExpense: 42000000,
    revenue: 685000000,
    sharesCurrent: 293000000,
    shares1YrAgo: 288000000,
    insiderShares: 58600000,
    totalShares: 293000000,
    avgVol30d: 2850000, // Higher volume on NYSE
    daysSinceLastPr: 8,
  },
];

/**
 * Seed financial data into the database.
 * Uses upsert (insert or update on conflict on stock_id) to handle re-seeding.
 */
export async function seedFinancialData(): Promise<number> {
  if (!db) {
    console.warn('⚠️  Database not available - skipping financial data seed');
    return 0;
  }

  console.log('🌱 Seeding financial data...');

  let count = 0;
  for (const data of financialDataSeed) {
    // Look up stock ID by ticker
    const stockRows = await db
      .select({ id: stocks.id })
      .from(stocks)
      .where(eq(stocks.ticker, data.ticker))
      .limit(1);

    if (stockRows.length === 0) {
      console.warn(`⚠️  Stock ${data.ticker} not found - skipping financial data`);
      continue;
    }

    const stockId = stockRows[0].id;

    await db
      .insert(financialData)
      .values({
        stockId,
        cash: data.cash,
        monthlyBurn: data.monthlyBurn,
        totalDebt: data.totalDebt,
        totalAssets: data.totalAssets,
        explorationExp: data.explorationExp,
        rAndDExp: data.rAndDExp,
        totalOpex: data.totalOpex,
        gAndAExpense: data.gAndAExpense,
        revenue: data.revenue,
        sharesCurrent: data.sharesCurrent,
        shares1YrAgo: data.shares1YrAgo,
        insiderShares: data.insiderShares,
        totalShares: data.totalShares,
        avgVol30d: data.avgVol30d,
        daysSinceLastPr: data.daysSinceLastPr,
      })
      .onConflictDoUpdate({
        target: financialData.stockId,
        set: {
          cash: data.cash,
          monthlyBurn: data.monthlyBurn,
          totalDebt: data.totalDebt,
          totalAssets: data.totalAssets,
          explorationExp: data.explorationExp,
          rAndDExp: data.rAndDExp,
          totalOpex: data.totalOpex,
          gAndAExpense: data.gAndAExpense,
          revenue: data.revenue,
          sharesCurrent: data.sharesCurrent,
          shares1YrAgo: data.shares1YrAgo,
          insiderShares: data.insiderShares,
          totalShares: data.totalShares,
          avgVol30d: data.avgVol30d,
          daysSinceLastPr: data.daysSinceLastPr,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  console.log(`✅ Seeded ${count} financial data records`);
  return count;
}
