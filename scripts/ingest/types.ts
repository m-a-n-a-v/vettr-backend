/**
 * Shared TypeScript interfaces for the ingestion pipeline.
 * Maps yfinance JSON output to VETTR database fields.
 */

/** Raw yfinance per-ticker JSON structure (from 02_fetch_yfinance_data.py) */
export interface YFinanceTickerData {
  fetched_at: string;
  yfinance_ticker: string;
  vettr_ticker: string;
  exchange: string;

  // Stock fields
  name: string;
  sector: string;
  market_cap: number | null;
  price: number | null;
  previous_close: number | null;
  price_change: number | null;

  // Financial fields
  cash: number | null;
  monthly_burn: number | null;
  total_debt: number | null;
  total_assets: number | null;
  exploration_exp: number | null;
  r_and_d_exp: number | null;
  total_opex: number | null;
  g_and_a_expense: number | null;
  revenue: number | null;
  shares_current: number | null;
  shares_1yr_ago: number | null;
  insider_shares: number | null;
  total_shares: number | null;
  avg_vol_30d: number | null;
  days_since_last_pr: number | null;

  // Officers
  officers: Array<{
    name: string;
    title: string;
  }>;

  // Extra yfinance fields
  held_percent_insiders: number | null;
  operating_cashflow: number | null;
  total_revenue: number | null;
}

/** Ingestion status per ticker */
export interface TickerStatus {
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  symbol: string;
  exchange: string;
  reason: string | null;
  market_cap?: number;
  vettr_ticker?: string;
}

/** Full ingestion status file structure */
export interface IngestionStatus {
  started_at: string;
  last_updated: string;
  tickers: Record<string, TickerStatus>;
  stats: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
}

/** VETTR stock record for upsert */
export interface StockUpsert {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  marketCap: number | null;
  price: number | null;
  priceChange: number | null;
  vetrScore: number;
}

/** VETTR financial_data record for upsert */
export interface FinancialDataUpsert {
  stockId: string;
  cash: number | null;
  monthlyBurn: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  explorationExp: number | null;
  rAndDExp: number | null;
  totalOpex: number | null;
  gAndAExpense: number | null;
  revenue: number | null;
  sharesCurrent: number | null;
  shares1YrAgo: number | null;
  insiderShares: number | null;
  totalShares: number | null;
  avgVol30d: number | null;
  daysSinceLastPr: number | null;
}
