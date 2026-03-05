CREATE TABLE IF NOT EXISTS "ai_agent_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" varchar(50) NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"asked_at" timestamp DEFAULT now() NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"description" text,
	"industry" varchar(255),
	"sub_industry" varchar(255),
	"employees" integer,
	"website" varchar(500),
	"phone" varchar(50),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"country" varchar(100),
	"zip" varchar(20),
	"currency" varchar(10),
	"exchange_name" varchar(100),
	"quote_type" varchar(50),
	"officers" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_profiles_stock_id_unique" UNIQUE("stock_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(10) NOT NULL,
	"token" varchar(512) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "filing_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid,
	"ticker" varchar(20) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"filing_type" varchar(100) NOT NULL,
	"expected_date" date NOT NULL,
	"actual_date" date,
	"source_url" varchar(1024),
	"status" varchar(20) DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"statement_type" varchar(20) NOT NULL,
	"period_type" varchar(10) NOT NULL,
	"fiscal_date" date NOT NULL,
	"line_item" varchar(100) NOT NULL,
	"value" double precision,
	"currency" varchar(10),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"total_revenue" double precision,
	"gross_profit" double precision,
	"ebitda" double precision,
	"net_income" double precision,
	"operating_cash_flow" double precision,
	"free_cash_flow" double precision,
	"total_cash" double precision,
	"total_cash_per_share" double precision,
	"total_debt" double precision,
	"revenue_per_share" double precision,
	"gross_margins" double precision,
	"operating_margins" double precision,
	"ebitda_margins" double precision,
	"revenue_growth" double precision,
	"earnings_growth" double precision,
	"current_ratio" double precision,
	"quick_ratio" double precision,
	"shares_outstanding" bigint,
	"float_shares" bigint,
	"currency" varchar(10),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_summary_stock_id_unique" UNIQUE("stock_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_type" varchar(20) NOT NULL,
	"connection_id" varchar(255),
	"connection_status" varchar(20) DEFAULT 'active' NOT NULL,
	"institution_name" varchar(255),
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"stock_id" uuid,
	"ticker" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"asset_category" varchar(20) DEFAULT 'global' NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"average_cost" double precision,
	"current_price" double precision,
	"current_value" double precision,
	"unrealized_pnl" double precision,
	"unrealized_pnl_pct" double precision,
	"currency" varchar(10) DEFAULT 'CAD' NOT NULL,
	"exchange" varchar(50),
	"sector" varchar(100),
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"total_cost" double precision DEFAULT 0 NOT NULL,
	"total_pnl" double precision DEFAULT 0 NOT NULL,
	"total_pnl_pct" double precision DEFAULT 0 NOT NULL,
	"vettr_coverage_value" double precision DEFAULT 0 NOT NULL,
	"vettr_coverage_pct" double precision DEFAULT 0 NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"holding_id" uuid,
	"insight_type" varchar(30) NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"portfolio_id" uuid,
	"holding_id" uuid,
	"alert_type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"deep_link" varchar(512),
	"is_read" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"is_material" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_daily_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"date" date NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"close" double precision,
	"previous_close" double precision,
	"volume" double precision,
	"true_range" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_daily_prices_ticker_date_unique" UNIQUE("ticker","date")
);
--> statement-breakpoint
ALTER TABLE "financial_data" ADD COLUMN "warrant_strike_price" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tos_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tos_version" varchar(20);--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "sedi_insider_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "warrant_overhang_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "technical_momentum_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "short_squeeze_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "analyst_consensus_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "hourly_return_pct" double precision;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "z_score" double precision;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "atr_pct" double precision;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "dynamic_tilt" double precision;--> statement-breakpoint
ALTER TABLE "vetr_score_history" ADD COLUMN "base_score" integer;--> statement-breakpoint
ALTER TABLE "vetr_score_snapshots" ADD COLUMN "dynamic_tilt" double precision;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_agent_usage" ADD CONSTRAINT "ai_agent_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "filing_calendar" ADD CONSTRAINT "filing_calendar_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_summary" ADD CONSTRAINT "financial_summary_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_insights" ADD CONSTRAINT "portfolio_insights_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_insights" ADD CONSTRAINT "portfolio_insights_holding_id_portfolio_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."portfolio_holdings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_alerts" ADD CONSTRAINT "portfolio_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_alerts" ADD CONSTRAINT "portfolio_alerts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_alerts" ADD CONSTRAINT "portfolio_alerts_holding_id_portfolio_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."portfolio_holdings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_daily_prices" ADD CONSTRAINT "stock_daily_prices_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_agent_usage_user_date_idx" ON "ai_agent_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_profiles_stock_id_idx" ON "company_profiles" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_unique_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_tokens_platform_idx" ON "device_tokens" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_calendar_ticker_idx" ON "filing_calendar" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_calendar_expected_date_idx" ON "filing_calendar" USING btree ("expected_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_calendar_status_idx" ON "filing_calendar" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fs_stock_stmt_period_date_item_idx" ON "financial_statements" USING btree ("stock_id","statement_type","period_type","fiscal_date","line_item");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_statements_stock_id_idx" ON "financial_statements" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_statements_stmt_type_idx" ON "financial_statements" USING btree ("statement_type","period_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_summary_stock_id_idx" ON "financial_summary" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolios_user_id_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_holdings_portfolio_id_idx" ON "portfolio_holdings" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_holdings_stock_id_idx" ON "portfolio_holdings" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_holdings_ticker_idx" ON "portfolio_holdings" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_holdings_asset_category_idx" ON "portfolio_holdings" USING btree ("asset_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_portfolio_id_idx" ON "portfolio_snapshots" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_recorded_at_idx" ON "portfolio_snapshots" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_insights_portfolio_id_idx" ON "portfolio_insights" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_insights_holding_id_idx" ON "portfolio_insights" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_insights_type_idx" ON "portfolio_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_insights_severity_idx" ON "portfolio_insights" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_alerts_user_id_idx" ON "portfolio_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_alerts_portfolio_id_idx" ON "portfolio_alerts" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_alerts_type_idx" ON "portfolio_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_alerts_triggered_at_idx" ON "portfolio_alerts" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_alerts_is_read_idx" ON "portfolio_alerts" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_articles_source_idx" ON "news_articles" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_articles_published_at_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_daily_prices_ticker_idx" ON "stock_daily_prices" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_daily_prices_ticker_date_idx" ON "stock_daily_prices" USING btree ("ticker","date");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id");