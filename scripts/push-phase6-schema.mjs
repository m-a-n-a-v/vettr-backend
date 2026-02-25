/**
 * Push 3 new tables to Neon: company_profiles, financial_statements, financial_summary
 */
import pg from 'pg';
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const statements = [
  // company_profiles
  `CREATE TABLE IF NOT EXISTS company_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    description TEXT,
    industry VARCHAR(255),
    sub_industry VARCHAR(255),
    employees INTEGER,
    website VARCHAR(500),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    zip VARCHAR(20),
    currency VARCHAR(10),
    exchange_name VARCHAR(100),
    quote_type VARCHAR(50),
    officers JSONB,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT company_profiles_stock_id_unique UNIQUE(stock_id)
  )`,
  `CREATE INDEX IF NOT EXISTS company_profiles_stock_id_idx ON company_profiles(stock_id)`,

  // financial_statements (normalized)
  `CREATE TABLE IF NOT EXISTS financial_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    statement_type VARCHAR(20) NOT NULL,
    period_type VARCHAR(10) NOT NULL,
    fiscal_date DATE NOT NULL,
    line_item VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION,
    currency VARCHAR(10),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fs_stock_stmt_period_date_item_idx
   ON financial_statements(stock_id, statement_type, period_type, fiscal_date, line_item)`,
  `CREATE INDEX IF NOT EXISTS financial_statements_stock_id_idx ON financial_statements(stock_id)`,
  `CREATE INDEX IF NOT EXISTS financial_statements_stmt_type_idx ON financial_statements(statement_type, period_type)`,

  // financial_summary
  `CREATE TABLE IF NOT EXISTS financial_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    total_revenue DOUBLE PRECISION,
    gross_profit DOUBLE PRECISION,
    ebitda DOUBLE PRECISION,
    net_income DOUBLE PRECISION,
    operating_cash_flow DOUBLE PRECISION,
    free_cash_flow DOUBLE PRECISION,
    total_cash DOUBLE PRECISION,
    total_cash_per_share DOUBLE PRECISION,
    total_debt DOUBLE PRECISION,
    revenue_per_share DOUBLE PRECISION,
    gross_margins DOUBLE PRECISION,
    operating_margins DOUBLE PRECISION,
    ebitda_margins DOUBLE PRECISION,
    revenue_growth DOUBLE PRECISION,
    earnings_growth DOUBLE PRECISION,
    current_ratio DOUBLE PRECISION,
    quick_ratio DOUBLE PRECISION,
    shares_outstanding BIGINT,
    float_shares BIGINT,
    currency VARCHAR(10),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT financial_summary_stock_id_unique UNIQUE(stock_id)
  )`,
  `CREATE INDEX IF NOT EXISTS financial_summary_stock_id_idx ON financial_summary(stock_id)`,
];

async function main() {
  await client.connect();
  let ok = 0;
  for (const sql of statements) {
    try {
      await client.query(sql);
      ok++;
      console.log(`  ✓ [${ok}/${statements.length}] OK`);
    } catch (e) {
      console.log(`  ✗ [${ok + 1}/${statements.length}] FAIL: ${e.message.slice(0, 100)}`);
      ok++;
    }
  }
  console.log(`\nDone: ${ok}/${statements.length} statements executed`);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
