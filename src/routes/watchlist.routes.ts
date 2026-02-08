import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '../services/watchlist.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const watchlistRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all watchlist routes
watchlistRoutes.use('*', authMiddleware);

// Helper function to convert watchlist item to DTO
function toWatchlistItemDto(item: any) {
  return {
    id: item.id,
    ticker: item.ticker,
    name: item.name,
    exchange: item.exchange,
    sector: item.sector,
    market_cap: item.marketCap,
    price: item.price,
    price_change: item.priceChange,
    vetr_score: item.vetrScore,
    updated_at: item.updatedAt.toISOString(),
    added_at: item.added_at.toISOString(),
  };
}

// GET /watchlist - Return user's watchlist with full stock data
watchlistRoutes.get('/', async (c) => {
  const user = c.get('user');
  const watchlist = await getWatchlist(user.id);

  const watchlistDto = watchlist.map(toWatchlistItemDto);

  return c.json(success(watchlistDto), 200);
});

// POST /watchlist/:ticker - Add stock to watchlist (validates tier limit)
watchlistRoutes.post('/:ticker', async (c) => {
  const user = c.get('user');
  const ticker = c.req.param('ticker');

  const item = await addToWatchlist(user.id, ticker, user.tier);

  const itemDto = toWatchlistItemDto(item);

  return c.json(success(itemDto), 201);
});

// DELETE /watchlist/:ticker - Remove stock from watchlist
watchlistRoutes.delete('/:ticker', async (c) => {
  const user = c.get('user');
  const ticker = c.req.param('ticker');

  const result = await removeFromWatchlist(user.id, ticker);

  return c.json(success(result), 200);
});

export { watchlistRoutes };
