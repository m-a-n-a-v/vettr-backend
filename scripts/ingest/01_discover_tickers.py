#!/usr/bin/env python3
"""
Phase 1: Discover all Canadian stock tickers from TSX, TSXV, and CSE exchanges.

Uses cad-tickers package to scrape exchange websites.
Outputs data/tickers_raw.json with all tickers grouped by exchange.

Usage:
    python3 01_discover_tickers.py
"""

import json
import os
from datetime import datetime

from cad_tickers.exchanges import get_tsx_tickers


def discover_tickers():
    """Discover all tickers from TSX, TSXV, and CSE."""
    print("🔍 Discovering Canadian stock tickers...\n")

    result = {
        "generated_at": datetime.now().isoformat(),
        "exchanges": {},
        "all_tickers": [],
        "stats": {},
    }

    total = 0

    # TSX
    print("📡 Fetching TSX tickers...")
    try:
        tsx_symbols = get_tsx_tickers("tsx")
        tsx_tickers = []
        for sym in tsx_symbols:
            clean = str(sym).strip()
            if not clean or ".P" in clean:  # Skip capital pool companies
                continue
            yf_ticker = f"{clean}.TO"
            tsx_tickers.append({
                "symbol": clean,
                "yfinance_ticker": yf_ticker,
                "exchange": "TSX",
            })
        result["exchanges"]["TSX"] = {"count": len(tsx_tickers), "tickers": tsx_tickers}
        result["all_tickers"].extend(tsx_tickers)
        total += len(tsx_tickers)
        print(f"   ✅ Found {len(tsx_tickers)} tickers on TSX")
    except Exception as e:
        print(f"   ❌ Error fetching TSX: {e}")
        result["exchanges"]["TSX"] = {"count": 0, "tickers": [], "error": str(e)}

    # TSXV
    print("📡 Fetching TSXV tickers...")
    try:
        tsxv_symbols = get_tsx_tickers("tsxv")
        tsxv_tickers = []
        for sym in tsxv_symbols:
            clean = str(sym).strip()
            if not clean or ".P" in clean:  # Skip capital pool companies
                continue
            yf_ticker = f"{clean}.V"
            tsxv_tickers.append({
                "symbol": clean,
                "yfinance_ticker": yf_ticker,
                "exchange": "TSXV",
            })
        result["exchanges"]["TSXV"] = {"count": len(tsxv_tickers), "tickers": tsxv_tickers}
        result["all_tickers"].extend(tsxv_tickers)
        total += len(tsxv_tickers)
        print(f"   ✅ Found {len(tsxv_tickers)} tickers on TSXV")
    except Exception as e:
        print(f"   ❌ Error fetching TSXV: {e}")
        result["exchanges"]["TSXV"] = {"count": 0, "tickers": [], "error": str(e)}

    # CSE
    print("📡 Fetching CSE tickers...")
    try:
        from cad_tickers.exchanges import get_cse_tickers_df, get_all_cse_tickers
        cse_df = get_cse_tickers_df()
        if cse_df is not None and not cse_df.empty:
            cse_symbols = get_all_cse_tickers(cse_df)
            cse_tickers = []
            for sym in cse_symbols:
                clean = str(sym).strip()
                if not clean:
                    continue
                yf_ticker = f"{clean}.CN"
                cse_tickers.append({
                    "symbol": clean,
                    "yfinance_ticker": yf_ticker,
                    "exchange": "CSE",
                })
            result["exchanges"]["CSE"] = {"count": len(cse_tickers), "tickers": cse_tickers}
            result["all_tickers"].extend(cse_tickers)
            total += len(cse_tickers)
            print(f"   ✅ Found {len(cse_tickers)} tickers on CSE")
        else:
            print("   ⚠️  CSE data unavailable (website may have changed). Skipping.")
            result["exchanges"]["CSE"] = {"count": 0, "tickers": [], "error": "CSE export unavailable"}
    except Exception as e:
        print(f"   ⚠️  CSE fetch failed: {e}. Continuing with TSX/TSXV.")
        result["exchanges"]["CSE"] = {"count": 0, "tickers": [], "error": str(e)}

    result["stats"] = {
        "total_tickers": total,
        "tsx_count": result["exchanges"].get("TSX", {}).get("count", 0),
        "tsxv_count": result["exchanges"].get("TSXV", {}).get("count", 0),
        "cse_count": result["exchanges"].get("CSE", {}).get("count", 0),
    }

    # Write output
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "tickers_raw.json")

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n📊 Summary:")
    print(f"   TSX:  {result['stats']['tsx_count']}")
    print(f"   TSXV: {result['stats']['tsxv_count']}")
    print(f"   CSE:  {result['stats']['cse_count']}")
    print(f"   Total: {total}")
    print(f"\n💾 Saved to {output_path}")

    return result


if __name__ == "__main__":
    discover_tickers()
