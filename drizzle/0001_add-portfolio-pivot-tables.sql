-- Portfolio pivot tables migration
-- Adds portfolios, portfolio_holdings, portfolio_snapshots, portfolio_insights,
-- portfolio_alerts, news_articles, and filing_calendar tables

CREATE TABLE IF NOT EXISTS "portfolios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "connection_type" varchar(20) NOT NULL,
  "connection_id" varchar(255),
  "connection_status" varchar(20) NOT NULL DEFAULT 'active',
  "institution_name" varchar(255),
  "last_synced_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portfolios_user_id_idx" ON "portfolios" ("user_id");

CREATE TABLE IF NOT EXISTS "portfolio_holdings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "stock_id" uuid REFERENCES "stocks"("id") ON DELETE SET NULL,
  "ticker" varchar(20) NOT NULL,
  "name" varchar(255) NOT NULL,
  "asset_category" varchar(20) NOT NULL DEFAULT 'global',
  "quantity" double precision NOT NULL DEFAULT 0,
  "average_cost" double precision,
  "current_price" double precision,
  "current_value" double precision,
  "unrealized_pnl" double precision,
  "unrealized_pnl_pct" double precision,
  "currency" varchar(10) NOT NULL DEFAULT 'CAD',
  "exchange" varchar(50),
  "sector" varchar(100),
  "last_updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portfolio_holdings_portfolio_id_idx" ON "portfolio_holdings" ("portfolio_id");
CREATE INDEX IF NOT EXISTS "portfolio_holdings_stock_id_idx" ON "portfolio_holdings" ("stock_id");
CREATE INDEX IF NOT EXISTS "portfolio_holdings_ticker_idx" ON "portfolio_holdings" ("ticker");
CREATE INDEX IF NOT EXISTS "portfolio_holdings_asset_category_idx" ON "portfolio_holdings" ("asset_category");

CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "total_value" double precision NOT NULL DEFAULT 0,
  "total_cost" double precision NOT NULL DEFAULT 0,
  "total_pnl" double precision NOT NULL DEFAULT 0,
  "total_pnl_pct" double precision NOT NULL DEFAULT 0,
  "vettr_coverage_value" double precision NOT NULL DEFAULT 0,
  "vettr_coverage_pct" double precision NOT NULL DEFAULT 0,
  "recorded_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portfolio_snapshots_portfolio_id_idx" ON "portfolio_snapshots" ("portfolio_id");
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_recorded_at_idx" ON "portfolio_snapshots" ("recorded_at");

CREATE TABLE IF NOT EXISTS "portfolio_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portfolio_id" uuid NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "holding_id" uuid REFERENCES "portfolio_holdings"("id") ON DELETE CASCADE,
  "insight_type" varchar(30) NOT NULL,
  "severity" varchar(20) NOT NULL DEFAULT 'info',
  "title" varchar(255) NOT NULL,
  "summary" text NOT NULL,
  "data" jsonb,
  "is_dismissed" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portfolio_insights_portfolio_id_idx" ON "portfolio_insights" ("portfolio_id");
CREATE INDEX IF NOT EXISTS "portfolio_insights_holding_id_idx" ON "portfolio_insights" ("holding_id");
CREATE INDEX IF NOT EXISTS "portfolio_insights_type_idx" ON "portfolio_insights" ("insight_type");
CREATE INDEX IF NOT EXISTS "portfolio_insights_severity_idx" ON "portfolio_insights" ("severity");

CREATE TABLE IF NOT EXISTS "portfolio_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "portfolio_id" uuid REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "holding_id" uuid REFERENCES "portfolio_holdings"("id") ON DELETE CASCADE,
  "alert_type" varchar(30) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "severity" varchar(20) NOT NULL DEFAULT 'info',
  "deep_link" varchar(512),
  "is_read" boolean NOT NULL DEFAULT false,
  "triggered_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portfolio_alerts_user_id_idx" ON "portfolio_alerts" ("user_id");
CREATE INDEX IF NOT EXISTS "portfolio_alerts_portfolio_id_idx" ON "portfolio_alerts" ("portfolio_id");
CREATE INDEX IF NOT EXISTS "portfolio_alerts_type_idx" ON "portfolio_alerts" ("alert_type");
CREATE INDEX IF NOT EXISTS "portfolio_alerts_triggered_at_idx" ON "portfolio_alerts" ("triggered_at");
CREATE INDEX IF NOT EXISTS "portfolio_alerts_is_read_idx" ON "portfolio_alerts" ("is_read");

CREATE TABLE IF NOT EXISTS "news_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(30) NOT NULL,
  "source_url" varchar(1024),
  "title" varchar(500) NOT NULL,
  "summary" text,
  "content" text,
  "image_url" varchar(1024),
  "published_at" timestamp NOT NULL,
  "tickers" varchar(1000),
  "sectors" varchar(500),
  "is_material" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "news_articles_source_idx" ON "news_articles" ("source");
CREATE INDEX IF NOT EXISTS "news_articles_published_at_idx" ON "news_articles" ("published_at");

CREATE TABLE IF NOT EXISTS "filing_calendar" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stock_id" uuid REFERENCES "stocks"("id") ON DELETE CASCADE,
  "ticker" varchar(20) NOT NULL,
  "company_name" varchar(255) NOT NULL,
  "filing_type" varchar(100) NOT NULL,
  "expected_date" date NOT NULL,
  "actual_date" date,
  "source_url" varchar(1024),
  "status" varchar(20) NOT NULL DEFAULT 'upcoming',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "filing_calendar_ticker_idx" ON "filing_calendar" ("ticker");
CREATE INDEX IF NOT EXISTS "filing_calendar_expected_date_idx" ON "filing_calendar" ("expected_date");
CREATE INDEX IF NOT EXISTS "filing_calendar_status_idx" ON "filing_calendar" ("status");
