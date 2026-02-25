CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_ticker" varchar(10) NOT NULL,
	"rule_type" varchar(50) NOT NULL,
	"trigger_conditions" jsonb NOT NULL,
	"condition_operator" varchar(10) DEFAULT 'AND' NOT NULL,
	"frequency" varchar(20) DEFAULT 'instant' NOT NULL,
	"threshold" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"alert_rule_id" uuid,
	"alert_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analyst_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"action_date" timestamp NOT NULL,
	"firm" varchar(255) NOT NULL,
	"action" varchar(20) NOT NULL,
	"to_grade" varchar(50),
	"from_grade" varchar(50),
	"price_target_action" varchar(30),
	"current_price_target" double precision,
	"prior_price_target" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analyst_consensus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "corporate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"event_name" varchar(500) NOT NULL,
	"event_date" timestamp NOT NULL,
	"event_status" varchar(20),
	"event_url" varchar(1000),
	"source_event_id" varchar(50),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"stocks_processed" integer DEFAULT 0,
	"succeeded" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"failures" jsonb,
	"chunk_offset" integer,
	"chunk_size" integer,
	"total_stocks" integer,
	"duration_ms" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dividend_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "earnings_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "earnings_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"quarter" timestamp NOT NULL,
	"period" varchar(10),
	"currency" varchar(10),
	"eps_actual" double precision,
	"eps_estimate" double precision,
	"eps_difference" double precision,
	"surprise_percent" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "executives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"years_at_company" double precision NOT NULL,
	"previous_companies" jsonb DEFAULT '[]'::jsonb,
	"education" varchar(500),
	"specialization" varchar(255),
	"social_linkedin" varchar(500),
	"social_twitter" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "filing_reads" (
	"user_id" uuid NOT NULL,
	"filing_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "filing_reads_user_id_filing_id_pk" PRIMARY KEY("user_id","filing_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"date" timestamp NOT NULL,
	"summary" text,
	"is_material" boolean DEFAULT false NOT NULL,
	"source_url" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"cash" double precision,
	"monthly_burn" double precision,
	"total_debt" double precision,
	"total_assets" double precision,
	"exploration_exp" double precision,
	"r_and_d_exp" double precision,
	"total_opex" double precision,
	"g_and_a_expense" double precision,
	"revenue" double precision,
	"shares_current" bigint,
	"shares_1yr_ago" bigint,
	"insider_shares" bigint,
	"total_shares" bigint,
	"avg_vol_30d" double precision,
	"days_since_last_pr" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_data_stock_id_unique" UNIQUE("stock_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"avatar_url" varchar(512),
	"tier" varchar(20) DEFAULT 'free' NOT NULL,
	"password_hash" varchar(255),
	"auth_provider" varchar(50) DEFAULT 'email' NOT NULL,
	"auth_provider_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"sector" varchar(100) NOT NULL,
	"market_cap" double precision,
	"price" double precision,
	"price_change" double precision,
	"vetr_score" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"user_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_items_user_id_stock_id_pk" PRIMARY KEY("user_id","stock_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vetr_score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_ticker" varchar(20) NOT NULL,
	"overall_score" integer NOT NULL,
	"financial_survival_score" integer DEFAULT 0 NOT NULL,
	"operational_efficiency_score" integer DEFAULT 0 NOT NULL,
	"shareholder_structure_score" integer DEFAULT 0 NOT NULL,
	"market_sentiment_score" integer DEFAULT 0 NOT NULL,
	"cash_runway_score" integer,
	"solvency_score" integer,
	"efficiency_score" integer,
	"pedigree_sub_score" integer,
	"dilution_penalty_score" integer,
	"insider_alignment_score" integer,
	"liquidity_score" integer,
	"news_velocity_score" integer,
	"p1_weight" double precision,
	"p2_weight" double precision,
	"p3_weight" double precision,
	"p4_weight" double precision,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vetr_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_ticker" varchar(20) NOT NULL,
	"overall_score" integer NOT NULL,
	"financial_survival_score" integer DEFAULT 0 NOT NULL,
	"operational_efficiency_score" integer DEFAULT 0 NOT NULL,
	"shareholder_structure_score" integer DEFAULT 0 NOT NULL,
	"market_sentiment_score" integer DEFAULT 0 NOT NULL,
	"price" double precision,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vetr_score_snapshots_ticker_time_unique" UNIQUE("stock_ticker","recorded_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "red_flag_acknowledgments" (
	"user_id" uuid NOT NULL,
	"red_flag_id" uuid NOT NULL,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "red_flag_acknowledgments_user_id_red_flag_id_pk" PRIMARY KEY("user_id","red_flag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "red_flag_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_ticker" varchar(10) NOT NULL,
	"flag_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"score" double precision NOT NULL,
	"description" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"items_synced" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) NOT NULL,
	"errors" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"source" varchar(100) DEFAULT 'marketing_site',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "short_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"short_shares" bigint,
	"short_interest_pct" double precision,
	"days_to_cover_10d" double precision,
	"days_to_cover_30d" double precision,
	"days_to_cover_90d" double precision,
	"report_date" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "short_interest_stock_id_unique" UNIQUE("stock_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutional_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"holder_type" varchar(20) NOT NULL,
	"organization" varchar(500) NOT NULL,
	"report_date" timestamp,
	"pct_held" double precision,
	"position" bigint,
	"value" double precision,
	"pct_change" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "major_holders_breakdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insider_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insider_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"filer_name" varchar(255) NOT NULL,
	"filer_relation" varchar(100),
	"transaction_date" timestamp NOT NULL,
	"transaction_text" varchar(500),
	"ownership" varchar(5),
	"shares" bigint,
	"value" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"headline" varchar(1000) NOT NULL,
	"summary" text,
	"source" varchar(255),
	"published_at" timestamp NOT NULL,
	"url" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analyst_actions" ADD CONSTRAINT "analyst_actions_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analyst_consensus" ADD CONSTRAINT "analyst_consensus_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corporate_events" ADD CONSTRAINT "corporate_events_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dividend_info" ADD CONSTRAINT "dividend_info_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "earnings_estimates" ADD CONSTRAINT "earnings_estimates_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "earnings_history" ADD CONSTRAINT "earnings_history_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "executives" ADD CONSTRAINT "executives_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "filing_reads" ADD CONSTRAINT "filing_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "filing_reads" ADD CONSTRAINT "filing_reads_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "filings" ADD CONSTRAINT "filings_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "financial_data" ADD CONSTRAINT "financial_data_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "red_flag_acknowledgments" ADD CONSTRAINT "red_flag_acknowledgments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "red_flag_acknowledgments" ADD CONSTRAINT "red_flag_acknowledgments_red_flag_id_red_flag_history_id_fk" FOREIGN KEY ("red_flag_id") REFERENCES "public"."red_flag_history"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_history" ADD CONSTRAINT "sync_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "valuation_metrics" ADD CONSTRAINT "valuation_metrics_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "short_interest" ADD CONSTRAINT "short_interest_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institutional_holders" ADD CONSTRAINT "institutional_holders_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "major_holders_breakdown" ADD CONSTRAINT "major_holders_breakdown_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insider_holdings" ADD CONSTRAINT "insider_holdings_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insider_transactions" ADD CONSTRAINT "insider_transactions_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_news" ADD CONSTRAINT "stock_news_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_user_id_idx" ON "alert_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_stock_ticker_idx" ON "alert_rules" USING btree ("stock_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_stock_id_idx" ON "alerts" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_alert_rule_id_idx" ON "alerts" USING btree ("alert_rule_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyst_actions_stock_id_idx" ON "analyst_actions" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyst_actions_date_idx" ON "analyst_actions" USING btree ("action_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyst_consensus_stock_id_idx" ON "analyst_consensus" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corporate_events_stock_id_idx" ON "corporate_events" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corporate_events_date_idx" ON "corporate_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corporate_events_type_idx" ON "corporate_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_job_runs_job_name_idx" ON "cron_job_runs" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_job_runs_started_at_idx" ON "cron_job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dividend_info_stock_id_idx" ON "dividend_info" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earnings_estimates_stock_id_idx" ON "earnings_estimates" USING btree ("stock_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "earnings_estimates_stock_period_uniq" ON "earnings_estimates" USING btree ("stock_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earnings_history_stock_id_idx" ON "earnings_history" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "earnings_history_quarter_idx" ON "earnings_history" USING btree ("quarter");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "earnings_history_stock_quarter_uniq" ON "earnings_history" USING btree ("stock_id","quarter");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executives_stock_id_idx" ON "executives" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executives_name_idx" ON "executives" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_stock_id_idx" ON "filings" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filings_date_idx" ON "filings" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_data_stock_id_idx" ON "financial_data" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stocks_ticker_idx" ON "stocks" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stocks_sector_idx" ON "stocks" USING btree ("sector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stocks_exchange_idx" ON "stocks" USING btree ("exchange");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_items_user_id_idx" ON "watchlist_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vetr_score_history_stock_ticker_idx" ON "vetr_score_history" USING btree ("stock_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vetr_score_history_calculated_at_idx" ON "vetr_score_history" USING btree ("calculated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vetr_score_snapshots_ticker_time_idx" ON "vetr_score_snapshots" USING btree ("stock_ticker","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vetr_score_snapshots_recorded_at_idx" ON "vetr_score_snapshots" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "red_flag_history_stock_ticker_idx" ON "red_flag_history" USING btree ("stock_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "red_flag_history_detected_at_idx" ON "red_flag_history" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "red_flag_history_flag_type_idx" ON "red_flag_history" USING btree ("flag_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_history_user_id_idx" ON "sync_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_history_started_at_idx" ON "sync_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "valuation_metrics_stock_id_idx" ON "valuation_metrics" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "short_interest_stock_id_idx" ON "short_interest" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutional_holders_stock_id_idx" ON "institutional_holders" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutional_holders_type_idx" ON "institutional_holders" USING btree ("holder_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "major_holders_breakdown_stock_id_idx" ON "major_holders_breakdown" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insider_holdings_stock_id_idx" ON "insider_holdings" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insider_holdings_name_idx" ON "insider_holdings" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insider_transactions_stock_id_idx" ON "insider_transactions" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insider_transactions_date_idx" ON "insider_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_news_stock_id_idx" ON "stock_news" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_news_published_at_idx" ON "stock_news" USING btree ("published_at");