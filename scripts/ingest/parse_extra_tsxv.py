#!/usr/bin/env python3
"""
Parse a raw text blob of TSXV tickers into structured JSON format.

The raw text follows the pattern: "TSXV{CompanyName}{TICKER}" repeated without
clear delimiters. Each entry starts with "TSXV", followed by the company name,
and ends with the ticker symbol (uppercase letters/numbers, possibly with dots).

Usage:
    python3 parse_extra_tsxv.py data/extra_tsxv_raw.txt

Reads:
    - data/extra_tsxv_raw.txt  (raw text blob)
    - data/ingestion_status.json (already-processed tickers)
    - data/tickers_raw.json (already-known tickers)

Outputs:
    - data/extra_tsxv_tickers.json (new tickers to process)
"""

import re
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")


def extract_tickers_from_raw(raw_text: str) -> list[str]:
    """
    Extract ticker symbols from the raw TSXV text blob.
    
    The pattern is: "TSXV" + CompanyName + TICKER
    Where TICKER is the last uppercase word in each entry (2-6 chars, letters/digits/dots).
    """
    # Normalize whitespace
    raw_text = raw_text.strip()
    
    # Split on "TSXV" to get individual entries
    parts = re.split(r'TSXV', raw_text)
    parts = [p.strip() for p in parts if p.strip()]
    
    tickers = []
    for part in parts:
        # Each part is like "CompanyName TICKER" or "01 Quantum Inc.ONE"
        # The ticker is the last sequence of uppercase alphanumeric chars at the end
        # Tickers are typically 1-6 chars, all caps, possibly with a dot
        
        # Strip trailing whitespace/newlines
        part = part.rstrip()
        
        # Try matching the last token that looks like a ticker symbol
        # Pattern: 1-6 uppercase letters/digits, optionally with a dot segment
        match = re.search(r'([A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?)$', part)
        if match:
            ticker = match.group(1)
            # Skip .P (capital pool) and .H (inactive/halted) tickers
            if not ticker.endswith('.P') and not ticker.endswith('.H'):
                tickers.append(ticker)
        else:
            # Fallback: try to find ticker after last space or period
            # Some entries may have the ticker separated by whitespace
            words = part.split()
            if words:
                candidate = words[-1].strip()
                if re.match(r'^[A-Z][A-Z0-9]{0,5}$', candidate):
                    tickers.append(candidate)
    
    return tickers


def load_existing_tickers() -> set[str]:
    """Load all already-known yfinance tickers from ingestion_status and tickers_raw."""
    existing = set()
    
    # From ingestion_status.json
    status_path = os.path.join(DATA_DIR, "ingestion_status.json")
    if os.path.exists(status_path):
        with open(status_path) as f:
            status = json.load(f)
        existing.update(status.get("tickers", {}).keys())
    
    # From tickers_raw.json
    raw_path = os.path.join(DATA_DIR, "tickers_raw.json")
    if os.path.exists(raw_path):
        with open(raw_path) as f:
            raw_data = json.load(f)
        
        all_tickers = []
        if isinstance(raw_data, list):
            all_tickers = raw_data
        elif isinstance(raw_data, dict):
            all_tickers = raw_data.get("all_tickers", [])
        
        for t in all_tickers:
            if isinstance(t, dict) and "yfinance_ticker" in t:
                existing.add(t["yfinance_ticker"])
    
    return existing


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 parse_extra_tsxv.py <raw_text_file>")
        print("  e.g. python3 parse_extra_tsxv.py data/extra_tsxv_raw.txt")
        sys.exit(1)
    
    raw_file = sys.argv[1]
    if not os.path.isabs(raw_file):
        raw_file = os.path.join(SCRIPT_DIR, raw_file)
    
    # Read raw text
    with open(raw_file) as f:
        raw_text = f.read()
    
    print(f"Read {len(raw_text)} chars from {raw_file}")
    
    # Extract tickers
    extracted = extract_tickers_from_raw(raw_text)
    unique_extracted = sorted(set(extracted))
    print(f"Extracted {len(extracted)} tickers ({len(unique_extracted)} unique)")
    
    # Load existing
    existing = load_existing_tickers()
    existing_tsxv = {t for t in existing if t.endswith('.V')}
    print(f"Already known TSXV tickers: {len(existing_tsxv)}")
    
    # Find new tickers
    new_tickers = []
    already_known = 0
    for symbol in unique_extracted:
        yf_ticker = f"{symbol}.V"
        if yf_ticker in existing:
            already_known += 1
        else:
            new_tickers.append({
                "symbol": symbol,
                "yfinance_ticker": yf_ticker,
                "exchange": "TSXV"
            })
    
    print(f"Already in pipeline: {already_known}")
    print(f"NEW tickers to add: {len(new_tickers)}")
    
    # Save output
    output_path = os.path.join(DATA_DIR, "extra_tsxv_tickers.json")
    with open(output_path, 'w') as f:
        json.dump(new_tickers, f, indent=2)
    print(f"\nSaved {len(new_tickers)} new tickers to {output_path}")
    
    # Print sample
    if new_tickers:
        print("\nSample of new tickers:")
        for t in new_tickers[:20]:
            print(f"  {t['yfinance_ticker']}  ({t['symbol']})")
        if len(new_tickers) > 20:
            print(f"  ... and {len(new_tickers) - 20} more")


if __name__ == "__main__":
    main()
