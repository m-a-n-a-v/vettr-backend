/**
 * Average True Range (ATR) Calculator
 * Uses Wilder's 14-day smoothing for the Hourly Action Overlay
 */

export interface DailyPrice {
  high: number | null;
  low: number | null;
  close: number | null;
  previousClose: number | null;
}

/**
 * Calculate True Range for a single day
 * TR = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
 */
export function calculateTrueRange(high: number | null, low: number | null, previousClose: number | null): number {
  if (high == null || low == null || previousClose == null || high === 0 || low === 0 || previousClose === 0) {
    return 0;
  }

  const highLow = high - low;
  const highPrevClose = Math.abs(high - previousClose);
  const lowPrevClose = Math.abs(low - previousClose);

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Calculate 14-day ATR using Wilder's smoothing
 * - First 14 days: simple average of TR values
 * - Subsequent days: ((prevATR * 13) + currentTR) / 14
 *
 * @param dailyPrices - Array of daily prices sorted oldest→newest
 * @returns ATR value, or 0 if insufficient data
 */
export function calculateATR(dailyPrices: DailyPrice[], period: number = 14): number {
  if (dailyPrices.length < period) {
    // Not enough data — use simple average of whatever we have
    if (dailyPrices.length === 0) return 0;

    const trValues = dailyPrices.map((d) =>
      calculateTrueRange(d.high, d.low, d.previousClose)
    );
    const sum = trValues.reduce((a, b) => a + b, 0);
    return sum / trValues.length;
  }

  // Calculate TR for all days
  const trValues = dailyPrices.map((d) =>
    calculateTrueRange(d.high, d.low, d.previousClose)
  );

  // First ATR: simple average of first `period` TR values
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder's smoothing for subsequent days
  for (let i = period; i < trValues.length; i++) {
    atr = ((atr * (period - 1)) + trValues[i]) / period;
  }

  return atr;
}

/**
 * Convert ATR to percentage relative to current close price
 * ATR% = (ATR / Close) * 100
 */
export function calculateATRPercent(atr: number, currentClose: number | null): number {
  if (currentClose == null || currentClose === 0 || atr === 0) {
    return 0;
  }
  return (atr / currentClose) * 100;
}

/**
 * Calculate the full Hourly Action Overlay
 *
 * Step A: Return% = (currentPrice - previousClose) / previousClose * 100
 * Step B: Z-Score = Return% / ATR%
 * Step C: Dynamic Tilt = 15 * (sigmoid(Z) - 0.5) → range ±7.5
 * Step D: Final = clamp(baseScore + dynamicTilt, 0, 100)
 */
export function calculateHourlyActionOverlay(
  currentPrice: number | null,
  previousClose: number | null,
  atrPercent: number
): { returnPct: number; zScore: number; dynamicTilt: number } {
  // Edge case: missing price data
  if (currentPrice == null || previousClose == null || currentPrice === 0 || previousClose === 0) {
    return { returnPct: 0, zScore: 0, dynamicTilt: 0 };
  }

  // Step A: Hourly Return
  const returnPct = ((currentPrice - previousClose) / previousClose) * 100;

  // Step B: Z-Score (volatility-adjusted significance)
  const zScore = atrPercent === 0 ? 0 : returnPct / atrPercent;

  // Step C: Sigmoid cap → Dynamic Tilt (±7.5 max)
  const sigmoid = 1 / (1 + Math.exp(-zScore));
  const dynamicTilt = 15 * (sigmoid - 0.5);

  return { returnPct, zScore, dynamicTilt };
}

/**
 * Apply the overlay tilt to a base score and clamp to [0, 100]
 */
export function applyOverlayToScore(baseScore: number, dynamicTilt: number): number {
  return Math.max(0, Math.min(100, Math.round(baseScore + dynamicTilt)));
}
