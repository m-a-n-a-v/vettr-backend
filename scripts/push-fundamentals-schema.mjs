import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const statements = [
  // 1. valuation_metrics
  `CREATE TABLE IF NOT EXISTS "valuation_metrics" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "pe_ratio" double precision,
    "forward_pe" double precision,
    "price_to_book" double precision,
    "price_to_cash_flow" double precision,
    "price_to_sales" double precision,
    "enterprise_to_revenue" double precision,
    "enterprise_to_ebitda" double precision,
    "enterprise_value" double precision,
    "book_value" double precision,
    "profit_margins" double precision,
    "return_on_equity" double precision,
    "return_on_assets" double precision,
    "earnings_quarterly_growth" double precision,
    "beta" double precision,
    "total_debt_to_equity" double precision,
    "weeks_52_high" double precision,
    "weeks_52_low" double precision,
    "fifty_day_average" double precision,
    "two_hundred_day_average" double precision,
    "week_52_change" double precision,
    "trailing_eps" double precision,
    "forward_eps" double precision,
    "audit_risk" integer,
    "board_risk" integer,
    "compensation_risk" integer,
    "shareholder_rights_risk" integer,
    "overall_risk" integer,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "valuation_metrics_stock_id_unique" UNIQUE("stock_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "valuation_metrics_stock_id_idx" ON "valuation_metrics" ("stock_id")`,

  // 2. earnings_history
  `CREATE TABLE IF NOT EXISTS "earnings_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "quarter" timestamp NOT NULL,
    "period" varchar(10),
    "currency" varchar(10),
    "eps_actual" double precision,
    "eps_estimate" double precision,
    "eps_difference" double precision,
    "surprise_percent" double precision,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "earnings_history_stock_quarter_uniq" ON "earnings_history" ("stock_id", "quarter")`,
  `CREATE INDEX IF NOT EXISTS "earnings_history_stock_id_idx" ON "earnings_history" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "earnings_history_quarter_idx" ON "earnings_history" ("quarter")`,

  // 3. earnings_estimates
  `CREATE TABLE IF NOT EXISTS "earnings_estimates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "period" varchar(10) NOT NULL,
    "end_date" timestamp,
    "currency" varchar(10),
    "eps_avg" double precision,
    "eps_low" double precision,
    "eps_high" double precision,
    "eps_year_ago" double precision,
    "eps_growth" double precision,
    "number_of_analysts_eps" integer,
    "revenue_avg" double precision,
    "revenue_low" double precision,
    "revenue_high" double precision,
    "revenue_year_ago" double precision,
    "revenue_growth" double precision,
    "number_of_analysts_revenue" integer,
    "eps_trend_current" double precision,
    "eps_trend_7d_ago" double precision,
    "eps_trend_30d_ago" double precision,
    "eps_trend_60d_ago" double precision,
    "eps_trend_90d_ago" double precision,
    "revisions_up_last_7d" integer,
    "revisions_up_last_30d" integer,
    "revisions_down_last_7d" integer,
    "revisions_down_last_30d" integer,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "earnings_estimates_stock_period_uniq" ON "earnings_estimates" ("stock_id", "period")`,
  `CREATE INDEX IF NOT EXISTS "earnings_estimates_stock_id_idx" ON "earnings_estimates" ("stock_id")`,

  // 4. analyst_consensus
  `CREATE TABLE IF NOT EXISTS "analyst_consensus" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "total_analysts" integer,
    "buy_count" integer,
    "hold_count" integer,
    "sell_count" integer,
    "consensus" varchar(20),
    "price_target" double precision,
    "price_target_high" double precision,
    "price_target_low" double precision,
    "recommendation_trend" jsonb,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "analyst_consensus_stock_id_unique" UNIQUE("stock_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "analyst_consensus_stock_id_idx" ON "analyst_consensus" ("stock_id")`,

  // 5. analyst_actions
  `CREATE TABLE IF NOT EXISTS "analyst_actions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "action_date" timestamp NOT NULL,
    "firm" varchar(255) NOT NULL,
    "action" varchar(20) NOT NULL,
    "to_grade" varchar(50),
    "from_grade" varchar(50),
    "price_target_action" varchar(30),
    "current_price_target" double precision,
    "prior_price_target" double precision,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "analyst_actions_stock_id_idx" ON "analyst_actions" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "analyst_actions_date_idx" ON "analyst_actions" ("action_date")`,

  // 6. short_interest
  `CREATE TABLE IF NOT EXISTS "short_interest" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "short_shares" bigint,
    "short_interest_pct" double precision,
    "days_to_cover_10d" double precision,
    "days_to_cover_30d" double precision,
    "days_to_cover_90d" double precision,
    "report_date" timestamp,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "short_interest_stock_id_unique" UNIQUE("stock_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "short_interest_stock_id_idx" ON "short_interest" ("stock_id")`,

  // 7. institutional_holders
  `CREATE TABLE IF NOT EXISTS "institutional_holders" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "holder_type" varchar(20) NOT NULL,
    "organization" varchar(500) NOT NULL,
    "report_date" timestamp,
    "pct_held" double precision,
    "position" bigint,
    "value" double precision,
    "pct_change" double precision,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "institutional_holders_stock_id_idx" ON "institutional_holders" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "institutional_holders_type_idx" ON "institutional_holders" ("holder_type")`,

  // 8. major_holders_breakdown
  `CREATE TABLE IF NOT EXISTS "major_holders_breakdown" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "insiders_percent_held" double precision,
    "institutions_percent_held" double precision,
    "institutions_float_percent_held" double precision,
    "institutions_count" bigint,
    "net_buy_count" bigint,
    "net_sell_count" bigint,
    "net_shares" bigint,
    "total_insider_shares" bigint,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "major_holders_breakdown_stock_id_unique" UNIQUE("stock_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "major_holders_breakdown_stock_id_idx" ON "major_holders_breakdown" ("stock_id")`,

  // 9. insider_holdings
  `CREATE TABLE IF NOT EXISTS "insider_holdings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "name" varchar(255) NOT NULL,
    "relation" varchar(100),
    "latest_trans_date" timestamp,
    "transaction_description" varchar(255),
    "position_direct" bigint,
    "position_direct_date" timestamp,
    "position_indirect" bigint,
    "position_indirect_date" timestamp,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "insider_holdings_stock_id_idx" ON "insider_holdings" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "insider_holdings_name_idx" ON "insider_holdings" ("name")`,

  // 10. insider_transactions
  `CREATE TABLE IF NOT EXISTS "insider_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "filer_name" varchar(255) NOT NULL,
    "filer_relation" varchar(100),
    "transaction_date" timestamp NOT NULL,
    "transaction_text" varchar(500),
    "ownership" varchar(5),
    "shares" bigint,
    "value" double precision,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "insider_transactions_stock_id_idx" ON "insider_transactions" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "insider_transactions_date_idx" ON "insider_transactions" ("transaction_date")`,

  // 11. dividend_info
  `CREATE TABLE IF NOT EXISTS "dividend_info" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "dividend_yield" double precision,
    "dividend_amount" double precision,
    "payout_ratio" double precision,
    "ex_dividend_date" timestamp,
    "dividend_pay_date" timestamp,
    "dividend_frequency" varchar(30),
    "dividend_currency" varchar(10),
    "trailing_annual_dividend_rate" double precision,
    "trailing_annual_dividend_yield" double precision,
    "dividend_3_years" double precision,
    "dividend_5_years" double precision,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "dividend_info_stock_id_unique" UNIQUE("stock_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "dividend_info_stock_id_idx" ON "dividend_info" ("stock_id")`,

  // 12. corporate_events
  `CREATE TABLE IF NOT EXISTS "corporate_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "event_type" varchar(20) NOT NULL,
    "event_name" varchar(500) NOT NULL,
    "event_date" timestamp NOT NULL,
    "event_status" varchar(20),
    "event_url" varchar(1000),
    "source_event_id" varchar(50),
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "corporate_events_stock_id_idx" ON "corporate_events" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "corporate_events_date_idx" ON "corporate_events" ("event_date")`,
  `CREATE INDEX IF NOT EXISTS "corporate_events_type_idx" ON "corporate_events" ("event_type")`,

  // 13. stock_news
  `CREATE TABLE IF NOT EXISTS "stock_news" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "stock_id" uuid NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
    "headline" varchar(1000) NOT NULL,
    "summary" text,
    "source" varchar(255),
    "published_at" timestamp NOT NULL,
    "url" varchar(1000),
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "stock_news_stock_id_idx" ON "stock_news" ("stock_id")`,
  `CREATE INDEX IF NOT EXISTS "stock_news_published_at_idx" ON "stock_news" ("published_at")`,
];

console.log(`Running ${statements.length} SQL statements against Neon...`);
let success = 0;
let failed = 0;
for (const sql of statements) {
  try {
    await client.query(sql);
    success++;
    const match = sql.match(/(?:TABLE|INDEX).*?"(\w+)"/i);
    if (match) console.log(`  ✓ ${match[1]}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${err.message.slice(0, 100)}`);
  }
}
console.log(`\n${success}/${statements.length} succeeded, ${failed} failed`);

// Verify new tables exist
const result = await client.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN (
    'valuation_metrics', 'earnings_history', 'earnings_estimates',
    'analyst_consensus', 'analyst_actions', 'short_interest',
    'institutional_holders', 'major_holders_breakdown',
    'insider_holdings', 'insider_transactions',
    'dividend_info', 'corporate_events', 'stock_news'
  )
  ORDER BY tablename
`);
console.log(`\nNew fundamentals tables created (${result.rows.length}/13):`);
result.rows.forEach(r => console.log(`  ✓ ${r.tablename}`));

if (result.rows.length === 13) {
  console.log('\n✅ All 13 fundamentals tables created successfully!');
} else {
  const expected = [
    'analyst_actions', 'analyst_consensus', 'corporate_events', 'dividend_info',
    'earnings_estimates', 'earnings_history', 'insider_holdings', 'insider_transactions',
    'institutional_holders', 'major_holders_breakdown', 'short_interest',
    'stock_news', 'valuation_metrics'
  ];
  const created = result.rows.map(r => r.tablename);
  const missing = expected.filter(t => !created.includes(t));
  console.log(`\n❌ Missing tables: ${missing.join(', ')}`);
}

await client.end();
