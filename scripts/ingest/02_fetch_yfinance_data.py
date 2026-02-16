#!/usr/bin/env python3
"""
Phase 2: Fetch yfinance data for all discovered tickers.

Resume-safe: uses data/ingestion_status.json to track which tickers
have been completed, failed, or skipped. Re-running only processes
tickers not yet completed/skipped.

Filters by market cap: $10M - $10B (mid/micro cap focus).
Writes per-ticker JSON to data/stock_data/{TICKER}.json.

Usage:
    python3 02_fetch_yfinance_data.py
    # If interrupted, just re-run — it picks up where it left off
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import yfinance as yf


# Config
MARKET_CAP_MIN = 10_000_000       # $10M
MARKET_CAP_MAX = 10_000_000_000   # $10B
BATCH_SIZE = 20
BATCH_SLEEP_SECONDS = 2

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
STOCK_DATA_DIR = os.path.join(DATA_DIR, "stock_data")
TICKERS_FILE = os.path.join(DATA_DIR, "tickers_raw.json")
STATUS_FILE = os.path.join(DATA_DIR, "ingestion_status.json")


def load_status():
    """Load or create the ingestion status file."""
    if os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, "r") as f:
            return json.load(f)
    return {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "tickers": {},
        "stats": {
            "total": 0,
            "completed": 0,
            "failed": 0,
            "skipped": 0,
            "pending": 0,
        },
    }


def save_status(status):
    """Save ingestion status to disk."""
    status["last_updated"] = datetime.now(timezone.utc).isoformat()

    # Recalculate stats
    tickers = status["tickers"]
    status["stats"] = {
        "total": len(tickers),
        "completed": sum(1 for v in tickers.values() if v["status"] == "completed"),
        "failed": sum(1 for v in tickers.values() if v["status"] == "failed"),
        "skipped": sum(1 for v in tickers.values() if v["status"] == "skipped"),
        "pending": sum(1 for v in tickers.values() if v["status"] == "pending"),
    }

    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


def compute_vettr_ticker(symbol, exchange):
    """Convert yfinance ticker to VETTR ticker format (no suffix)."""
    # VETTR stores tickers without exchange suffix
    return symbol.split(".")[0]


def compute_exchange(yf_ticker):
    """Derive exchange from yfinance ticker suffix."""
    if yf_ticker.endswith(".TO"):
        return "TSX"
    elif yf_ticker.endswith(".V"):
        return "TSXV"
    elif yf_ticker.endswith(".CN"):
        return "CSE"
    return "UNKNOWN"


def map_sector(yf_info):
    """Map yfinance industry/sector to VETTR sector categories."""
    industry = (yf_info.get("industry") or "").lower()
    sector = (yf_info.get("sector") or "").lower()

    # Mining & Resources mapping
    if "gold" in industry or "gold" in sector:
        return "Gold"
    if "silver" in industry or "silver" in sector:
        return "Silver"
    if "copper" in industry:
        return "Copper"
    if "uranium" in industry or "uranium" in sector:
        return "Uranium"
    if "lithium" in industry:
        return "Lithium"
    if "nickel" in industry:
        return "Nickel"
    if "zinc" in industry:
        return "Zinc"
    if "metal" in industry and "precious" in industry:
        return "Precious Metals"
    if "metal" in industry or "base metal" in industry:
        return "Base Metals"
    if "mining" in industry or "mining" in sector:
        return "Mining"
    if "oil" in industry or "gas" in industry or "petroleum" in industry:
        return "Oil & Gas"
    if "cannabis" in industry or "marijuana" in industry:
        return "Cannabis"
    if "biotech" in industry or "pharmaceutical" in industry:
        return "Biotech"
    if "technology" in sector or "software" in industry or "tech" in industry:
        return "Technology"
    if "financial" in sector or "bank" in industry:
        return "Financial Services"
    if "real estate" in sector or "reit" in industry:
        return "Real Estate"
    if "energy" in sector:
        return "Energy"
    if "health" in sector:
        return "Healthcare"
    if "industrial" in sector:
        return "Industrial"
    if "consumer" in sector:
        return "Consumer"
    if "communication" in sector:
        return "Communications"
    if "utilities" in sector:
        return "Utilities"

    # Fallback to yfinance sector or generic
    yf_sector = yf_info.get("sector", "")
    if yf_sector:
        return yf_sector
    return "Other"


def fetch_ticker_data(yf_ticker, symbol, exchange):
    """Fetch all data for a single ticker from yfinance."""
    try:
        t = yf.Ticker(yf_ticker)
        info = t.info or {}

        # Check if ticker is valid (yfinance returns empty or error for invalid tickers)
        if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
            return None, "no_data", "No market data available"

        # Check market cap filter
        market_cap = info.get("marketCap")
        if market_cap is None:
            return None, "skipped", "No market cap data"
        if market_cap < MARKET_CAP_MIN:
            return None, "skipped", f"Market cap ${market_cap:,.0f} below $10M minimum"
        if market_cap > MARKET_CAP_MAX:
            return None, "skipped", f"Market cap ${market_cap:,.0f} above $10B maximum"

        # Fetch additional data
        balance_sheet = {}
        income_stmt = {}
        news = []
        officers = []

        try:
            bs = t.balance_sheet
            if bs is not None and not bs.empty:
                # Get most recent period (first column)
                latest = bs.iloc[:, 0]
                balance_sheet = {str(k): float(v) if v == v else None for k, v in latest.items()}
        except Exception:
            pass

        try:
            inc = t.income_stmt
            if inc is not None and not inc.empty:
                latest = inc.iloc[:, 0]
                income_stmt = {str(k): float(v) if v == v else None for k, v in latest.items()}
        except Exception:
            pass

        try:
            n = t.news
            if n:
                news = [
                    {
                        "title": item.get("title", ""),
                        "publisher": item.get("publisher", ""),
                        "link": item.get("link", ""),
                        "published": item.get("providerPublishTime", 0),
                    }
                    for item in (n[:10] if isinstance(n, list) else [])
                ]
        except Exception:
            pass

        # Extract officers from info
        raw_officers = info.get("companyOfficers", [])
        if isinstance(raw_officers, list):
            officers = [
                {
                    "name": o.get("name", "Unknown"),
                    "title": o.get("title", "Officer"),
                }
                for o in raw_officers[:5]
            ]

        # Compute days since last news
        days_since_last_pr = None
        if news:
            latest_ts = max(item.get("published", 0) for item in news)
            if latest_ts > 0:
                latest_date = datetime.fromtimestamp(latest_ts, tz=timezone.utc)
                now = datetime.now(timezone.utc)
                days_since_last_pr = (now - latest_date).days

        # Build per-ticker output
        vettr_ticker = compute_vettr_ticker(yf_ticker, exchange)

        data = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "yfinance_ticker": yf_ticker,
            "vettr_ticker": vettr_ticker,
            "exchange": exchange,

            # Stock fields
            "name": info.get("shortName") or info.get("longName") or vettr_ticker,
            "sector": map_sector(info),
            "market_cap": market_cap,
            "price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "previous_close": info.get("previousClose"),
            "price_change": None,  # Computed below

            # Financial fields
            "cash": info.get("totalCash"),
            "monthly_burn": None,  # Computed below
            "total_debt": info.get("totalDebt"),
            "total_assets": balance_sheet.get("Total Assets"),
            "exploration_exp": None,  # Not available in yfinance
            "r_and_d_exp": info.get("researchDevelopment"),
            "total_opex": info.get("operatingExpenses"),
            "g_and_a_expense": income_stmt.get("Selling General And Administration"),
            "revenue": info.get("totalRevenue"),
            "shares_current": info.get("sharesOutstanding"),
            "shares_1yr_ago": None,  # Not available in yfinance
            "insider_shares": None,  # Computed below
            "total_shares": info.get("sharesOutstanding"),
            "avg_vol_30d": info.get("averageVolume"),
            "days_since_last_pr": days_since_last_pr,

            # Raw data for reference
            "officers": officers,
            "news_items": news,
            "raw_info_keys": list(info.keys()),

            # Extra yfinance fields useful for mapping
            "held_percent_insiders": info.get("heldPercentInsiders"),
            "operating_cashflow": info.get("operatingCashflow"),
            "total_revenue": info.get("totalRevenue"),
        }

        # Compute price_change
        current = data["price"]
        prev = data["previous_close"]
        if current is not None and prev is not None:
            data["price_change"] = round(current - prev, 4)

        # Compute monthly_burn: (opex - revenue) / 12
        opex = data["total_opex"]
        rev = data["revenue"]
        if opex is not None and rev is not None:
            data["monthly_burn"] = round((opex - rev) / 12, 2)

        # Compute insider_shares from held_percent_insiders
        shares = data["shares_current"]
        insider_pct = data["held_percent_insiders"]
        if shares is not None and insider_pct is not None:
            data["insider_shares"] = int(shares * insider_pct)

        return data, "completed", None

    except Exception as e:
        return None, "failed", str(e)


def main():
    """Main entry point for yfinance data fetching."""
    print("📊 VETTR Data Fetcher — Phase 2: yfinance\n")

    # Check for tickers file
    if not os.path.exists(TICKERS_FILE):
        print(f"❌ Tickers file not found: {TICKERS_FILE}")
        print("   Run 01_discover_tickers.py first.")
        sys.exit(1)

    # Load tickers
    with open(TICKERS_FILE, "r") as f:
        tickers_data = json.load(f)

    all_tickers = tickers_data.get("all_tickers", [])
    print(f"📋 Total raw tickers: {len(all_tickers)}")

    # Load/create status
    status = load_status()

    # Initialize any new tickers in status
    for t in all_tickers:
        yf_ticker = t["yfinance_ticker"]
        if yf_ticker not in status["tickers"]:
            status["tickers"][yf_ticker] = {
                "status": "pending",
                "symbol": t["symbol"],
                "exchange": t["exchange"],
                "reason": None,
            }

    save_status(status)

    # Filter to only pending tickers
    pending = [
        yf_ticker
        for yf_ticker, info in status["tickers"].items()
        if info["status"] == "pending"
    ]

    if not pending:
        print("\n✅ No pending tickers to process. All done!")
        print(f"   Stats: {json.dumps(status['stats'], indent=2)}")
        return

    print(f"⏳ Pending tickers to process: {len(pending)}")
    print(f"   Already completed: {status['stats'].get('completed', 0)}")
    print(f"   Already skipped: {status['stats'].get('skipped', 0)}")
    print(f"   Already failed: {status['stats'].get('failed', 0)}")

    # Ensure output directory exists
    os.makedirs(STOCK_DATA_DIR, exist_ok=True)

    # Process in batches
    batch_num = 0
    processed = 0

    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        batch_num += 1

        print(f"\n--- Batch {batch_num} ({len(batch)} tickers) ---")

        for yf_ticker in batch:
            ticker_info = status["tickers"][yf_ticker]
            symbol = ticker_info["symbol"]
            exchange = ticker_info["exchange"]

            try:
                data, result_status, reason = fetch_ticker_data(yf_ticker, symbol, exchange)

                if result_status == "completed" and data:
                    # Write per-ticker JSON
                    output_path = os.path.join(STOCK_DATA_DIR, f"{yf_ticker}.json")
                    with open(output_path, "w") as f:
                        json.dump(data, f, indent=2, default=str)

                    ticker_info["status"] = "completed"
                    ticker_info["reason"] = None
                    ticker_info["market_cap"] = data.get("market_cap")
                    ticker_info["vettr_ticker"] = data.get("vettr_ticker")
                    print(f"   ✅ {yf_ticker} → {data['name']} (${data['market_cap']:,.0f})")

                elif result_status == "skipped":
                    ticker_info["status"] = "skipped"
                    ticker_info["reason"] = reason
                    # Print skip reason only for the first few
                    if processed < 30:
                        print(f"   ⏭️  {yf_ticker}: {reason}")

                elif result_status == "no_data":
                    ticker_info["status"] = "skipped"
                    ticker_info["reason"] = reason or "No data"

                else:
                    ticker_info["status"] = "failed"
                    ticker_info["reason"] = reason or "Unknown error"
                    print(f"   ❌ {yf_ticker}: {reason}")

            except Exception as e:
                ticker_info["status"] = "failed"
                ticker_info["reason"] = str(e)
                print(f"   ❌ {yf_ticker}: {e}")

            processed += 1

        # Save status after each batch
        save_status(status)

        # Print batch summary
        s = status["stats"]
        print(
            f"   Progress: {s['completed']} completed, "
            f"{s['skipped']} skipped, "
            f"{s['failed']} failed, "
            f"{s['pending']} pending"
        )

        # Sleep between batches to respect rate limits
        if i + BATCH_SIZE < len(pending):
            print(f"   💤 Sleeping {BATCH_SLEEP_SECONDS}s before next batch...")
            time.sleep(BATCH_SLEEP_SECONDS)

    # Final summary
    save_status(status)
    s = status["stats"]
    print(f"\n{'='*50}")
    print(f"📊 Final Results:")
    print(f"   Total tickers:  {s['total']}")
    print(f"   Completed:      {s['completed']}")
    print(f"   Skipped:        {s['skipped']}")
    print(f"   Failed:         {s['failed']}")
    print(f"   Pending:        {s['pending']}")
    print(f"\n💾 Stock data saved to: {STOCK_DATA_DIR}")
    print(f"📋 Status saved to: {STATUS_FILE}")


if __name__ == "__main__":
    main()
