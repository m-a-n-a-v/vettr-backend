import { db } from '../../config/database.js';
import { stocks } from '../schema/index.js';

/**
 * Seed data for 25 Canadian pilot stocks (TSX/TSXV/CSE)
 * Includes mining, precious metals, and resource sector companies
 */
export const stockSeedData = [
  {
    ticker: 'NXE',
    name: 'NexGen Energy Ltd.',
    exchange: 'TSX',
    sector: 'Uranium',
    marketCap: 4820000000,
    price: 9.85,
    priceChange: 0.32,
    vetrScore: 78,
  },
  {
    ticker: 'ARIS',
    name: 'Aris Mining Corporation',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 2150000000,
    price: 7.42,
    priceChange: -0.15,
    vetrScore: 72,
  },
  {
    ticker: 'LUN',
    name: 'Lundin Mining Corporation',
    exchange: 'TSX',
    sector: 'Base Metals',
    marketCap: 9870000000,
    price: 12.68,
    priceChange: 0.47,
    vetrScore: 81,
  },
  {
    ticker: 'FM',
    name: 'First Quantum Minerals Ltd.',
    exchange: 'TSX',
    sector: 'Base Metals',
    marketCap: 11200000000,
    price: 16.23,
    priceChange: -0.89,
    vetrScore: 65,
  },
  {
    ticker: 'TKO',
    name: 'Taseko Mines Limited',
    exchange: 'TSX',
    sector: 'Copper',
    marketCap: 890000000,
    price: 3.12,
    priceChange: 0.08,
    vetrScore: 58,
  },
  {
    ticker: 'ERO',
    name: 'Ero Copper Corp.',
    exchange: 'TSX',
    sector: 'Copper',
    marketCap: 2340000000,
    price: 25.40,
    priceChange: 1.12,
    vetrScore: 74,
  },
  {
    ticker: 'CS',
    name: 'Capstone Copper Corp.',
    exchange: 'TSX',
    sector: 'Copper',
    marketCap: 5670000000,
    price: 8.15,
    priceChange: 0.23,
    vetrScore: 69,
  },
  {
    ticker: 'MAG',
    name: 'MAG Silver Corp.',
    exchange: 'TSX',
    sector: 'Silver',
    marketCap: 1980000000,
    price: 19.75,
    priceChange: -0.42,
    vetrScore: 71,
  },
  {
    ticker: 'FVI',
    name: 'Fortuna Mining Corp.',
    exchange: 'TSX',
    sector: 'Precious Metals',
    marketCap: 1560000000,
    price: 5.18,
    priceChange: 0.09,
    vetrScore: 66,
  },
  {
    ticker: 'WPM',
    name: 'Wheaton Precious Metals Corp.',
    exchange: 'TSX',
    sector: 'Precious Metals',
    marketCap: 29400000000,
    price: 64.85,
    priceChange: 1.75,
    vetrScore: 88,
  },
  {
    ticker: 'AEM',
    name: 'Agnico Eagle Mines Limited',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 42300000000,
    price: 85.20,
    priceChange: 2.35,
    vetrScore: 91,
  },
  {
    ticker: 'OR',
    name: 'Osisko Gold Royalties Ltd.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 3450000000,
    price: 18.92,
    priceChange: 0.54,
    vetrScore: 76,
  },
  {
    ticker: 'ELD',
    name: 'Eldorado Gold Corporation',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 3780000000,
    price: 18.45,
    priceChange: -0.67,
    vetrScore: 63,
  },
  {
    ticker: 'SII',
    name: 'Sprott Inc.',
    exchange: 'TSX',
    sector: 'Financial Services',
    marketCap: 1620000000,
    price: 62.30,
    priceChange: 0.88,
    vetrScore: 79,
  },
  {
    ticker: 'BTO',
    name: 'B2Gold Corp.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 5120000000,
    price: 3.92,
    priceChange: 0.11,
    vetrScore: 73,
  },
  {
    ticker: 'NGD',
    name: 'New Gold Inc.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 1890000000,
    price: 2.78,
    priceChange: -0.05,
    vetrScore: 55,
  },
  {
    ticker: 'IMG',
    name: 'IAMGOLD Corporation',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 3250000000,
    price: 6.45,
    priceChange: 0.28,
    vetrScore: 62,
  },
  {
    ticker: 'MND',
    name: 'Mandalay Resources Corporation',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 420000000,
    price: 4.35,
    priceChange: 0.15,
    vetrScore: 59,
  },
  {
    ticker: 'LUG',
    name: 'Lundin Gold Inc.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 4150000000,
    price: 17.20,
    priceChange: 0.92,
    vetrScore: 82,
  },
  {
    ticker: 'KRR',
    name: 'Karora Resources Inc.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 1340000000,
    price: 5.68,
    priceChange: 0.21,
    vetrScore: 67,
  },
  {
    ticker: 'RIO',
    name: 'Rio2 Limited',
    exchange: 'TSXV',
    sector: 'Gold',
    marketCap: 185000000,
    price: 0.52,
    priceChange: -0.03,
    vetrScore: 44,
  },
  {
    ticker: 'SBB',
    name: 'Sabina Gold & Silver Corp.',
    exchange: 'TSX',
    sector: 'Gold',
    marketCap: 1780000000,
    price: 1.42,
    priceChange: 0.04,
    vetrScore: 61,
  },
  {
    ticker: 'GPL',
    name: 'Great Panther Mining Limited',
    exchange: 'TSX',
    sector: 'Silver',
    marketCap: 95000000,
    price: 0.28,
    priceChange: -0.02,
    vetrScore: 35,
  },
  {
    ticker: 'FR',
    name: 'First Majestic Silver Corp.',
    exchange: 'TSX',
    sector: 'Silver',
    marketCap: 3680000000,
    price: 12.55,
    priceChange: 0.38,
    vetrScore: 70,
  },
  {
    ticker: 'AG',
    name: 'First Majestic Silver Corp. (NYSE)',
    exchange: 'NYSE',
    sector: 'Silver',
    marketCap: 3680000000,
    price: 12.55,
    priceChange: 0.38,
    vetrScore: 70,
  },
];

/**
 * Seed stocks into the database.
 * Uses upsert (insert or update on conflict) to handle re-seeding gracefully.
 */
export async function seedStocks(): Promise<number> {
  if (!db) {
    console.warn('⚠️  Database not available - skipping stock seed');
    return 0;
  }

  console.log('🌱 Seeding stocks...');

  let count = 0;
  for (const stock of stockSeedData) {
    await db
      .insert(stocks)
      .values(stock)
      .onConflictDoUpdate({
        target: stocks.ticker,
        set: {
          name: stock.name,
          exchange: stock.exchange,
          sector: stock.sector,
          marketCap: stock.marketCap,
          price: stock.price,
          priceChange: stock.priceChange,
          vetrScore: stock.vetrScore,
        },
      });
    count++;
  }

  console.log(`✅ Seeded ${count} stocks`);
  return count;
}
