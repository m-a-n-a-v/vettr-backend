/**
 * Converts ero-fundamentals.json into a comprehensive markdown table document
 */

const fs = require("fs");
const data = JSON.parse(
  fs.readFileSync("/Users/manav/Space/code/ero-fundamentals.json", "utf8")
);

const lines = [];
const add = (s) => lines.push(s);
const nl = () => lines.push("");

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (v === "") return "—";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (Number.isInteger(v) && Math.abs(v) > 10000)
      return v.toLocaleString("en-US");
    if (typeof v === "number" && !Number.isInteger(v))
      return parseFloat(v.toFixed(4)).toString();
    return v.toString();
  }
  if (typeof v === "string" && v.length > 120) return v.slice(0, 117) + "...";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function fmtRaw(v) {
  if (v === null || v === undefined) return "—";
  if (v === "") return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) > 1000)
      return v.toLocaleString("en-US");
    if (!Number.isInteger(v)) return parseFloat(v.toFixed(4)).toString();
    return v.toString();
  }
  if (typeof v === "string" && v.length > 120) return v.slice(0, 117) + "...";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function pct(v) {
  if (v === null || v === undefined) return "—";
  return (v * 100).toFixed(2) + "%";
}

// ===== HEADER =====
add(`# ERO (Ero Copper Corp.) — Comprehensive Fundamentals Report`);
nl();
add(
  `> **Generated:** ${data._meta.fetchedAt} | **Sources:** ${data._meta.sources.join(", ")}`
);
nl();
add("---");
nl();

// ===== 1. COMPANY PROFILE =====
add("## 1. Company Profile");
nl();

const tmxQ = data.tmx.quote;
const yProfile = data.yahoo.quoteSummary.summaryProfile;
const yAsset = data.yahoo.quoteSummary.assetProfile;

add("| Field | Value |");
add("|-------|-------|");
add(`| **Name** | ${tmxQ.name} |`);
add(`| **Symbol** | ${tmxQ.symbol} (TSX) / ERO (NYSE) |`);
add(`| **Exchange** | ${tmxQ.exchangeName} (${tmxQ.exchangeCode}) |`);
add(`| **Issue Type** | ${tmxQ.issueType === "CS" ? "Common Stock" : tmxQ.issueType} |`);
add(`| **Sector** | ${tmxQ.sector} (TMX) / ${yAsset?.sector || "—"} (Yahoo) |`);
add(`| **Industry** | ${tmxQ.industry} (TMX) / ${yAsset?.industry || "—"} (Yahoo) |`);
add(`| **Sub-Industry** | ${tmxQ.qmdescription} |`);
add(`| **Employees** | ${parseInt(tmxQ.employees).toLocaleString()} |`);
add(`| **Currency** | ${tmxQ.currency} |`);
add(`| **Address** | ${tmxQ.fullAddress} |`);
add(`| **Website** | ${tmxQ.website} |`);
add(`| **Email** | ${tmxQ.email} |`);
add(`| **Phone** | ${tmxQ.phoneNumber} |`);
add(`| **Description** | ${fmt(tmxQ.longDescription)} |`);
nl();

// Governance Risk (Yahoo)
if (yAsset) {
  add("### Governance Risk Scores (Yahoo)");
  nl();
  add("| Risk Category | Score (1-10) |");
  add("|---------------|:------------:|");
  add(`| Audit Risk | ${yAsset.auditRisk || "—"} |`);
  add(`| Board Risk | ${yAsset.boardRisk || "—"} |`);
  add(`| Compensation Risk | ${yAsset.compensationRisk || "—"} |`);
  add(`| Shareholder Rights Risk | ${yAsset.shareHolderRightsRisk || "—"} |`);
  add(`| **Overall Risk** | **${yAsset.overallRisk || "—"}** |`);
  nl();
}

// Officers
if (yAsset?.companyOfficers?.length) {
  add("### Company Officers");
  nl();
  add("| Name | Title | Age | Total Pay |");
  add("|------|-------|:---:|----------:|");
  for (const o of yAsset.companyOfficers) {
    add(
      `| ${o.name || "—"} | ${o.title || "—"} | ${o.age || "—"} | ${o.totalPay ? "$" + o.totalPay.toLocaleString() : "—"} |`
    );
  }
  nl();
}

// ===== 2. PRICE & MARKET DATA =====
add("## 2. Price & Market Data");
nl();

const yPrice = data.yahoo.quoteSummary.price;
const ySummary = data.yahoo.quoteSummary.summaryDetail;

add("| Metric | TMX Value | Yahoo Value |");
add("|--------|----------:|------------:|");
add(`| **Price** | $${tmxQ.price} | $${yPrice?.regularMarketPrice || "—"} |`);
add(`| **Open** | $${tmxQ.openPrice} | $${ySummary?.regularMarketOpen || "—"} |`);
add(`| **Previous Close** | $${tmxQ.prevClose} | $${ySummary?.regularMarketPreviousClose || "—"} |`);
add(`| **Day High** | $${tmxQ.dayHigh} | $${ySummary?.regularMarketDayHigh || "—"} |`);
add(`| **Day Low** | $${tmxQ.dayLow} | $${ySummary?.regularMarketDayLow || "—"} |`);
add(`| **Day Change** | $${tmxQ.priceChange} (${tmxQ.percentChange.toFixed(2)}%) | $${yPrice?.regularMarketChange?.toFixed(2) || "—"} (${(yPrice?.regularMarketChangePercent * 100)?.toFixed(2) || "—"}%) |`);
add(`| **VWAP** | $${tmxQ.vwap.toFixed(4)} | — |`);
add(`| **52-Week High** | $${tmxQ.weeks52high} | $${ySummary?.fiftyTwoWeekHigh || "—"} |`);
add(`| **52-Week Low** | $${tmxQ.weeks52low} | $${ySummary?.fiftyTwoWeekLow || "—"} |`);
add(`| **All-Time High** | — | $${ySummary?.allTimeHigh || "—"} |`);
add(`| **All-Time Low** | — | $${ySummary?.allTimeLow || "—"} |`);
add(`| **50-Day MA** | — | $${ySummary?.fiftyDayAverage?.toFixed(2) || "—"} |`);
add(`| **200-Day MA** | — | $${ySummary?.twoHundredDayAverage?.toFixed(2) || "—"} |`);
add(`| **Bid / Ask** | — | $${ySummary?.bid || "—"} / $${ySummary?.ask || "—"} |`);
nl();

// ===== 3. VOLUME =====
add("## 3. Volume & Shares");
nl();
add("| Metric | TMX | Yahoo |");
add("|--------|----:|------:|");
add(`| **Volume** | ${tmxQ.volume?.toLocaleString()} | ${ySummary?.regularMarketVolume?.toLocaleString() || "—"} |`);
add(`| **Avg Volume 10D** | ${tmxQ.averageVolume10D?.toLocaleString()} | ${ySummary?.averageDailyVolume10Day?.toLocaleString() || "—"} |`);
add(`| **Avg Volume 30D** | ${tmxQ.averageVolume30D?.toLocaleString()} | — |`);
add(`| **Avg Volume 50D** | ${tmxQ.averageVolume50D?.toLocaleString()} | — |`);
add(`| **Avg Volume 3M** | — | ${ySummary?.averageVolume?.toLocaleString() || "—"} |`);
add(`| **Shares Outstanding** | ${tmxQ.shareOutStanding?.toLocaleString()} | ${data.yahoo.quoteSummary.defaultKeyStatistics?.sharesOutstanding?.toLocaleString() || "—"} |`);
add(`| **Float Shares** | — | ${data.yahoo.quoteSummary.defaultKeyStatistics?.floatShares?.toLocaleString() || "—"} |`);
add(`| **Shares in Escrow** | ${fmtRaw(tmxQ.sharesESCROW)} | — |`);
nl();

// ===== 4. VALUATION =====
add("## 4. Valuation Metrics");
nl();

const yKS = data.yahoo.quoteSummary.defaultKeyStatistics;
const yFD = data.yahoo.quoteSummary.financialData;

add("| Metric | TMX | Yahoo |");
add("|--------|----:|------:|");
add(`| **Market Cap** | ${fmt(tmxQ.MarketCap)} | ${fmt(ySummary?.marketCap)} |`);
add(`| **Market Cap (All Classes)** | ${fmt(tmxQ.MarketCapAllClasses)} | — |`);
add(`| **Enterprise Value** | — | ${fmt(yKS?.enterpriseValue)} |`);
add(`| **EPS (Trailing)** | $${tmxQ.eps} | $${yKS?.trailingEps || "—"} |`);
add(`| **EPS (Forward)** | — | $${yKS?.forwardEps || "—"} |`);
add(`| **P/E (Trailing)** | ${tmxQ.peRatio} | ${ySummary?.trailingPE?.toFixed(2) || "—"} |`);
add(`| **P/E (Forward)** | — | ${ySummary?.forwardPE?.toFixed(2) || "—"} |`);
add(`| **Price/Book** | ${tmxQ.priceToBook} | ${yKS?.priceToBook?.toFixed(2) || "—"} |`);
add(`| **Price/Cash Flow** | ${tmxQ.priceToCashFlow} | — |`);
add(`| **Price/Sales (TTM)** | — | ${ySummary?.priceToSalesTrailing12Months?.toFixed(2) || "—"} |`);
add(`| **EV/Revenue** | — | ${yKS?.enterpriseToRevenue?.toFixed(2) || "—"} |`);
add(`| **EV/EBITDA** | — | ${yKS?.enterpriseToEbitda?.toFixed(2) || "—"} |`);
add(`| **Book Value/Share** | — | $${yKS?.bookValue?.toFixed(2) || "—"} |`);
add(`| **Beta** | ${tmxQ.beta} | ${yKS?.beta?.toFixed(3) || "—"} |`);
add(`| **52-Week Change** | — | ${pct(yKS?.["52WeekChange"])} |`);
add(`| **S&P 52-Week Change** | — | ${pct(yKS?.SandP52WeekChange)} |`);
nl();

// ===== 5. FINANCIAL PERFORMANCE =====
add("## 5. Financial Performance");
nl();

add("| Metric | Value | Source |");
add("|--------|------:|--------|");
add(`| **Revenue (TTM)** | ${fmt(yFD?.totalRevenue)} | Yahoo |`);
add(`| **Gross Profit** | ${fmt(yFD?.grossProfits)} | Yahoo |`);
add(`| **EBITDA** | ${fmt(yFD?.ebitda)} | Yahoo |`);
add(`| **Net Income** | ${fmt(yKS?.netIncomeToCommon)} | Yahoo |`);
add(`| **Operating Cash Flow** | ${fmt(yFD?.operatingCashflow)} | Yahoo |`);
add(`| **Free Cash Flow** | ${fmt(yFD?.freeCashflow)} | Yahoo |`);
add(`| **Total Cash** | ${fmt(yFD?.totalCash)} | Yahoo |`);
add(`| **Total Cash/Share** | $${yFD?.totalCashPerShare || "—"} | Yahoo |`);
add(`| **Total Debt** | ${fmt(yFD?.totalDebt)} | Yahoo |`);
add(`| **Revenue/Share** | $${yFD?.revenuePerShare || "—"} | Yahoo |`);
nl();

add("### Margins & Returns");
nl();
add("| Metric | TMX | Yahoo |");
add("|--------|----:|------:|");
add(`| **Gross Margin** | — | ${pct(yFD?.grossMargins)} |`);
add(`| **Operating Margin** | — | ${pct(yFD?.operatingMargins)} |`);
add(`| **EBITDA Margin** | — | ${pct(yFD?.ebitdaMargins)} |`);
add(`| **Profit Margin** | — | ${pct(yFD?.profitMargins)} |`);
add(`| **Return on Equity** | ${tmxQ.returnOnEquity}% | ${pct(yFD?.returnOnEquity)} |`);
add(`| **Return on Assets** | ${tmxQ.returnOnAssets}% | ${pct(yFD?.returnOnAssets)} |`);
add(`| **Debt/Equity** | ${tmxQ.totalDebtToEquity} | ${yFD?.debtToEquity?.toFixed(2) || "—"} |`);
add(`| **Current Ratio** | — | ${yFD?.currentRatio || "—"} |`);
add(`| **Quick Ratio** | — | ${yFD?.quickRatio || "—"} |`);
nl();

add("### Growth");
nl();
add("| Metric | Value |");
add("|--------|------:|");
add(`| **Revenue Growth** | ${pct(yFD?.revenueGrowth)} |`);
add(`| **Earnings Growth** | ${pct(yFD?.earningsGrowth)} |`);
add(`| **Quarterly Earnings Growth** | ${pct(yKS?.earningsQuarterlyGrowth)} |`);
nl();

// ===== 6. SHORT INTEREST =====
add("## 6. Short Interest (TMX)");
nl();
const si = data.tmx.shortInterest;
add("| Metric | Value |");
add("|--------|------:|");
add(`| **Short Interest** | ${si.SHORT_INTEREST?.toLocaleString()} shares |`);
add(`| **Short Interest %** | ${(si.SHORTINTERESTPCT * 100).toFixed(2)}% |`);
add(`| **Days to Cover (30D)** | ${si.DAYSTOCOVER30DAY} |`);
add(`| **As of Date** | ${si.BUSINESS_DATE} |`);
nl();

// ===== 7. ANALYST RATINGS =====
add("## 7. Analyst Ratings & Price Targets");
nl();

const tmxA = data.tmx.analysts;
add("### TMX Analyst Consensus");
nl();
add("| Metric | Value |");
add("|--------|------:|");
add(`| **Total Analysts** | ${tmxA.totalAnalysts} |`);
add(`| **Consensus** | ${tmxA.consensusAnalysts.consensus} |`);
add(`| **Buy** | ${tmxA.consensusAnalysts.buy} |`);
add(`| **Hold** | ${tmxA.consensusAnalysts.hold} |`);
add(`| **Sell** | ${tmxA.consensusAnalysts.sell} |`);
add(`| **Price Target** | $${tmxA.priceTarget.priceTarget.toFixed(2)} |`);
add(`| **High Target** | $${tmxA.priceTarget.highPriceTarget.toFixed(2)} |`);
add(`| **Low Target** | $${tmxA.priceTarget.lowPriceTarget.toFixed(2)} |`);
nl();

add("### Yahoo Analyst Data");
nl();
add("| Metric | Value |");
add("|--------|------:|");
add(`| **# Analyst Opinions** | ${yFD?.numberOfAnalystOpinions || "—"} |`);
add(`| **Recommendation** | ${yFD?.recommendationKey || "—"} (${yFD?.recommendationMean?.toFixed(1) || "—"}/5) |`);
add(`| **Target Mean** | $${yFD?.targetMeanPrice?.toFixed(2) || "—"} |`);
add(`| **Target Median** | $${yFD?.targetMedianPrice?.toFixed(2) || "—"} |`);
add(`| **Target High** | $${yFD?.targetHighPrice || "—"} |`);
add(`| **Target Low** | $${yFD?.targetLowPrice || "—"} |`);
nl();

// Upgrades/Downgrades
const upgrades = data.yahoo.quoteSummary.upgradeDowngradeHistory?.history;
if (upgrades?.length) {
  add("### Recent Upgrades/Downgrades");
  nl();
  add("| Date | Firm | Action | From | To |");
  add("|------|------|--------|------|-----|");
  for (const u of upgrades.slice(0, 10)) {
    const d = u.epochGradeDate
      ? new Date(u.epochGradeDate).toISOString().split("T")[0]
      : "—";
    add(
      `| ${d} | ${u.firm || "—"} | ${u.action || "—"} | ${u.fromGrade || "—"} | ${u.toGrade || "—"} |`
    );
  }
  nl();
}

// Recommendation trend
const recTrend = data.yahoo.quoteSummary.recommendationTrend?.trend;
if (recTrend?.length) {
  add("### Recommendation Trend");
  nl();
  add("| Period | Strong Buy | Buy | Hold | Sell | Strong Sell |");
  add("|--------|:----------:|:---:|:----:|:----:|:-----------:|");
  for (const t of recTrend) {
    add(
      `| ${t.period || "—"} | ${t.strongBuy || 0} | ${t.buy || 0} | ${t.hold || 0} | ${t.sell || 0} | ${t.strongSell || 0} |`
    );
  }
  nl();
}

// ===== 8. OWNERSHIP =====
add("## 8. Ownership Structure");
nl();

const mhb = data.yahoo.quoteSummary.majorHoldersBreakdown;
add("### Breakdown");
nl();
add("| Holder Type | Percentage |");
add("|-------------|----------:|");
add(`| **Insiders** | ${pct(mhb?.insidersPercentHeld)} |`);
add(`| **Institutions** | ${pct(mhb?.institutionsPercentHeld)} |`);
add(`| **Institutions (of Float)** | ${pct(mhb?.institutionsFloatPercentHeld)} |`);
add(`| **# Institutions** | ${mhb?.institutionsCount || "—"} |`);
nl();

// Top institutional owners
const instOwn = data.yahoo.quoteSummary.institutionOwnership?.ownershipList;
if (instOwn?.length) {
  add("### Top Institutional Holders");
  nl();
  add("| Institution | Shares | % Held |");
  add("|------------|-------:|-------:|");
  for (const i of instOwn.slice(0, 10)) {
    add(
      `| ${i.organization || "—"} | ${i.position?.toLocaleString() || "—"} | ${pct(i.pctHeld)} |`
    );
  }
  nl();
}

// Top fund owners
const fundOwn = data.yahoo.quoteSummary.fundOwnership?.ownershipList;
if (fundOwn?.length) {
  add("### Top Fund Holders");
  nl();
  add("| Fund | Shares | % Held |");
  add("|------|-------:|-------:|");
  for (const f of fundOwn.slice(0, 10)) {
    add(
      `| ${f.organization || "—"} | ${f.position?.toLocaleString() || "—"} | ${pct(f.pctHeld)} |`
    );
  }
  nl();
}

// Insider holders
const insiderH = data.yahoo.quoteSummary.insiderHolders?.holders;
if (insiderH?.length) {
  add("### Named Insider Holdings");
  nl();
  add("| Name | Relation | Direct Shares | Latest Transaction |");
  add("|------|----------|-------------:|--------------------|");
  for (const h of insiderH) {
    const txnDate = h.latestTransDate
      ? new Date(h.latestTransDate).toISOString().split("T")[0]
      : "—";
    add(
      `| ${h.name || "—"} | ${h.relation || "—"} | ${h.positionDirect?.toLocaleString() || "—"} | ${txnDate} |`
    );
  }
  nl();
}

// Net share purchase
const nsp = data.yahoo.quoteSummary.netSharePurchaseActivity;
if (nsp) {
  add("### Net Insider Activity (6 months)");
  nl();
  add("| Metric | Value |");
  add("|--------|------:|");
  add(`| **Total Insider Shares** | ${nsp.totalInsiderShares?.toLocaleString() || "—"} |`);
  add(`| **Buy Transactions** | ${nsp.buyInfoCount || 0} (${nsp.buyInfoShares?.toLocaleString() || 0} shares) |`);
  add(`| **Sell Transactions** | ${nsp.sellInfoCount || 0} |`);
  add(`| **Net Transactions** | ${nsp.netInfoCount || 0} (${nsp.netInfoShares?.toLocaleString() || 0} shares) |`);
  nl();
}

// ===== 9. EARNINGS =====
add("## 9. Earnings");
nl();

// Calendar
const cal = data.yahoo.quoteSummary.calendarEvents?.earnings;
if (cal) {
  add("### Upcoming Earnings");
  nl();
  add("| Metric | Value |");
  add("|--------|------:|");
  add(`| **Earnings Date** | ${cal.earningsDate?.[0] ? new Date(cal.earningsDate[0]).toISOString().split("T")[0] : "—"} |`);
  add(`| **EPS Estimate** | $${cal.earningsAverage?.toFixed(2) || "—"} ($${cal.earningsLow?.toFixed(2) || "—"} - $${cal.earningsHigh?.toFixed(2) || "—"}) |`);
  add(`| **Revenue Estimate** | ${fmt(cal.revenueAverage)} (${fmt(cal.revenueLow)} - ${fmt(cal.revenueHigh)}) |`);
  nl();
}

// Earnings History
const earnHist = data.yahoo.quoteSummary.earningsHistory?.history;
if (earnHist?.length) {
  add("### Earnings History (Last 4 Quarters)");
  nl();
  add("| Period | Actual EPS | Estimated EPS | Surprise | Surprise % |");
  add("|--------|----------:|-------------:|---------:|----------:|");
  for (const h of earnHist) {
    add(
      `| ${h.period || "—"} | $${h.epsActual?.toFixed(3) || "—"} | $${h.epsEstimate?.toFixed(3) || "—"} | $${h.epsDifference?.toFixed(3) || "—"} | ${pct(h.surprisePercent)} |`
    );
  }
  nl();
}

// TMX Earnings Surprises (historical)
const tmxSurprises = data.tmx.earnings?.surprises;
if (tmxSurprises?.length) {
  add("### TMX Earnings Surprises (Historical)");
  nl();
  add("| Date | Actual EPS | Surprise % |");
  add("|------|----------:|----------:|");
  for (const s of tmxSurprises.slice(0, 15)) {
    add(`| ${s.date || "—"} | $${s.actualEps?.toFixed(3) || "—"} | ${s.percentSurprise?.toFixed(2) || "—"}% |`);
  }
  nl();
}

// Earnings Trend (Forward Estimates)
const eTrend = data.yahoo.quoteSummary.earningsTrend?.trend;
if (eTrend?.length) {
  add("### Forward Estimates");
  nl();
  add("| Period | EPS Est (Avg) | EPS Low | EPS High | # Analysts | Rev Est (Avg) | Rev Low | Rev High |");
  add("|--------|-------------:|--------:|---------:|:----------:|-------------:|--------:|---------:|");
  for (const t of eTrend) {
    const ee = t.earningsEstimate || {};
    const re = t.revenueEstimate || {};
    add(
      `| ${t.period || "—"} | $${ee.avg?.toFixed(2) || "—"} | $${ee.low?.toFixed(2) || "—"} | $${ee.high?.toFixed(2) || "—"} | ${ee.numberOfAnalysts || "—"} | ${fmt(re.avg)} | ${fmt(re.low)} | ${fmt(re.high)} |`
    );
  }
  nl();
}

// ===== 10. FINANCIAL STATEMENTS =====
add("## 10. Financial Statements (fundamentalsTimeSeries)");
nl();

const fts = data.yahoo.fundamentalsTimeSeries;
if (Array.isArray(fts) && fts.length > 0) {
  // Get all periods sorted
  const periods = fts
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const periodLabels = periods.map(
    (p) => p.date.split("T")[0] + " (" + (p.periodType || "—") + ")"
  );

  // Group fields by category
  const incomeFields = [
    "totalRevenue", "operatingRevenue", "costOfRevenue", "grossProfit",
    "sellingGeneralAndAdministration", "generalAndAdministrativeExpense",
    "salariesAndWages", "otherGandA", "operatingExpense", "operatingIncome",
    "interestIncome", "interestExpense", "interestExpenseNonOperating",
    "netInterestIncome", "otherIncomeExpense", "otherNonOperatingIncomeExpenses",
    "specialIncomeCharges", "assetImpairmentCharge",
    "netForeignCurrencyExchangeGainLoss", "operatingGainsLosses",
    "pretaxIncome", "taxProvision", "netIncome", "netIncomeCommonStockholders",
    "netIncomeContinuousOperations", "dilutedEPS", "basicEPS",
    "dilutedAverageShares", "basicAverageShares",
    "EBIT", "EBITDA", "normalizedEBITDA", "normalizedIncome",
    "reconciledCostOfRevenue", "reconciledDepreciation",
    "depreciationAmortizationDepletionIncomeStatement",
  ];

  const balanceFields = [
    "totalAssets", "currentAssets", "cashAndCashEquivalents",
    "cashCashEquivalentsAndShortTermInvestments",
    "receivables", "accountsReceivable", "notesReceivable",
    "taxesReceivable", "nonCurrentAccountsReceivable",
    "inventory", "rawMaterials", "workInProcess", "finishedGoods", "otherInventories",
    "prepaidAssets", "otherCurrentAssets",
    "totalNonCurrentAssets", "netPPE", "grossPPE",
    "accumulatedDepreciation", "mineralProperties",
    "buildingsAndImprovements", "otherProperties", "constructionInProgress",
    "nonCurrentDeferredTaxesAssets", "nonCurrentDeferredAssets",
    "nonCurrentNoteReceivables", "otherNonCurrentAssets",
    "totalLiabilitiesNetMinorityInterest",
    "currentLiabilities", "payables", "payablesAndAccruedExpenses",
    "accountsPayable", "currentAccruedExpenses", "incomeTaxPayable",
    "pensionandOtherPostRetirementBenefitPlansCurrent",
    "currentDebt", "currentDebtAndCapitalLeaseObligation",
    "currentCapitalLeaseObligation", "otherCurrentBorrowings",
    "currentDeferredLiabilities", "currentDeferredRevenue",
    "currentProvisions", "otherCurrentLiabilities",
    "totalNonCurrentLiabilitiesNetMinorityInterest",
    "longTermDebt", "longTermDebtAndCapitalLeaseObligation",
    "longTermCapitalLeaseObligation", "capitalLeaseObligations",
    "longTermProvisions", "nonCurrentDeferredLiabilities",
    "nonCurrentDeferredRevenue", "tradeandOtherPayablesNonCurrent",
    "otherNonCurrentLiabilities",
    "totalEquityGrossMinorityInterest", "stockholdersEquity",
    "commonStock", "commonStockEquity", "capitalStock",
    "retainedEarnings", "gainsLossesNotAffectingRetainedEarnings",
    "otherEquityAdjustments", "minorityInterest",
    "totalDebt", "netDebt", "totalCapitalization",
    "investedCapital", "tangibleBookValue", "netTangibleAssets",
    "workingCapital", "ordinarySharesNumber", "shareIssued",
    "totalTaxPayable", "totalExpenses",
  ];

  const cashflowFields = [
    "operatingCashFlow", "cashFlowFromContinuingOperatingActivities",
    "changeInWorkingCapital", "changeInReceivables", "changesInAccountReceivables",
    "changeInInventory", "changeInPayablesAndAccruedExpense",
    "changeInOtherCurrentAssets", "changeInOtherWorkingCapital",
    "depreciationAndAmortization", "depreciationAmortizationDepletion",
    "deferredIncomeTax", "deferredTax",
    "stockBasedCompensation", "otherNonCashItems",
    "investingCashFlow", "cashFlowFromContinuingInvestingActivities",
    "capitalExpenditure", "purchaseOfPPE", "netPPEPurchaseAndSale",
    "saleOfInvestment", "netInvestmentPurchaseAndSale",
    "gainOnSaleOfSecurity",
    "financingCashFlow", "cashFlowFromContinuingFinancingActivities",
    "issuanceOfDebt", "longTermDebtIssuance", "longTermDebtPayments",
    "repaymentOfDebt", "netIssuancePaymentsOfDebt", "netLongTermDebtIssuance",
    "proceedsFromStockOptionExercised",
    "interestPaidCFF", "totalOtherFinanceCost", "taxesRefundPaid",
    "effectOfExchangeRateChanges",
    "changesInCash", "beginningCashPosition", "endCashPosition",
    "freeCashFlow",
  ];

  function renderStatementTable(title, fields) {
    add(`### ${title}`);
    nl();
    const header =
      "| Line Item | " + periodLabels.join(" | ") + " |";
    const sep =
      "|-----------|" + periodLabels.map(() => "----------:").join("|") + "|";
    add(header);
    add(sep);

    for (const field of fields) {
      const hasData = periods.some(
        (p) => p[field] !== null && p[field] !== undefined
      );
      if (!hasData) continue;

      const label = field
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      const vals = periods.map((p) => {
        const v = p[field];
        if (v === null || v === undefined) return "—";
        if (typeof v === "number") {
          if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
          if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
          if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
          return `$${v.toFixed(2)}`;
        }
        return String(v);
      });
      add(`| ${label} | ${vals.join(" | ")} |`);
    }
    nl();
  }

  renderStatementTable("Income Statement", incomeFields);
  renderStatementTable("Balance Sheet", balanceFields);
  renderStatementTable("Cash Flow Statement", cashflowFields);

  // Key ratios row
  add("### Key Ratios from Statements");
  nl();
  add("| Ratio | " + periodLabels.join(" | ") + " |");
  add("|-------|" + periodLabels.map(() => "------:").join("|") + "|");

  for (const field of ["taxRateForCalcs"]) {
    const hasData = periods.some((p) => p[field] != null);
    if (!hasData) continue;
    const vals = periods.map((p) =>
      p[field] != null ? pct(p[field]) : "—"
    );
    add(`| Tax Rate | ${vals.join(" | ")} |`);
  }
  nl();
}

// ===== 11. INCOME STATEMENT (quoteSummary) =====
const incHist =
  data.yahoo.quoteSummary.incomeStatementHistory?.incomeStatementHistory;
if (incHist?.length) {
  add("## 11. Income Statement Summary (quoteSummary)");
  nl();
  const labels = incHist.map(
    (s) => (s.endDate ? new Date(s.endDate).toISOString().split("T")[0] : "—")
  );
  add("| Line Item | " + labels.join(" | ") + " |");
  add("|-----------|" + labels.map(() => "----------:").join("|") + "|");

  const fields = [
    "totalRevenue", "costOfRevenue", "grossProfit",
    "totalOperatingExpenses", "operatingIncome",
    "interestExpense", "incomeBeforeTax", "incomeTaxExpense",
    "netIncome",
  ];
  for (const f of fields) {
    const vals = incHist.map((s) => fmt(s[f]));
    const label = f.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
    add(`| ${label} | ${vals.join(" | ")} |`);
  }
  nl();
}

// ===== 12. NEWS =====
const tmxNews = data.tmx.news;
if (tmxNews?.length) {
  add("## 12. Recent News (TMX)");
  nl();
  add("| Date | Headline | Source |");
  add("|------|----------|--------|");
  for (const n of tmxNews) {
    const d = n.datetime
      ? new Date(n.datetime).toISOString().split("T")[0]
      : "—";
    add(`| ${d} | ${fmt(n.headline)} | ${n.source || "—"} |`);
  }
  nl();
}

// ===== 13. TMX EVENTS =====
const tmxEvents = data.tmx.events?.data;
if (tmxEvents?.length) {
  add("## 13. Upcoming Corporate Events (TMX/WSH)");
  nl();
  add("| Date | Event | Type | Status |");
  add("|------|-------|------|--------|");
  for (const raw of tmxEvents) {
    let e = raw;
    if (typeof raw === "string") {
      try { e = JSON.parse(raw); } catch { add(`| — | ${fmt(raw)} | — | — |`); continue; }
    }
    if (typeof e === "object" && e !== null) {
      const name = e.event_name || e.name || e.description || "—";
      const date = e.event_date || e.date || e.eventDate || "—";
      const type = e.event_type || e.type || e.eventType || "—";
      const status = e.event_status === "CON" ? "Confirmed" : e.event_status === "UNC" ? "Unconfirmed" : (e.event_status || "—");
      add(`| ${date} | ${fmt(name)} | ${type} | ${status} |`);
    }
  }
  nl();
}

// ===== 14. TMX FILINGS =====
const tmxFilings = data.tmx.filings;
if (Array.isArray(tmxFilings) && tmxFilings.length) {
  add("## 14. Recent Filings (TMX)");
  nl();
  add("| Filing | Description | Size |");
  add("|--------|-------------|-----:|");
  for (const f of tmxFilings.slice(0, 20)) {
    add(`| ${fmt(f.name)} | ${fmt(f.description)} | ${f.size || "—"} |`);
  }
  nl();
}

// ===== 15. DIVIDENDS =====
add("## 15. Dividends");
nl();
add("| Metric | TMX | Yahoo |");
add("|--------|-----|-------|");
add(`| **Dividend Yield** | ${fmtRaw(tmxQ.dividendYield)} | ${ySummary?.trailingAnnualDividendYield || "—"} |`);
add(`| **Dividend Amount** | ${fmtRaw(tmxQ.dividendAmount)} | $${ySummary?.trailingAnnualDividendRate || "—"} |`);
add(`| **Payout Ratio** | — | ${pct(ySummary?.payoutRatio)} |`);
add(`| **Ex-Dividend Date** | ${fmtRaw(tmxQ.exDividendDate)} | — |`);
add(`| **Dividend Frequency** | ${fmtRaw(tmxQ.dividendFrequency)} | — |`);
add(`| **3-Year History** | ${fmtRaw(tmxQ.dividend3Years)} | — |`);
add(`| **5-Year History** | ${fmtRaw(tmxQ.dividend5Years)} | — |`);
nl();
add("*ERO does not currently pay dividends.*");
nl();

// ===== FOOTER =====
add("---");
nl();
add(
  `*Report generated at ${data._meta.fetchedAt} from ${data._meta.sources.join(" and ")}.*`
);

// Write output
const output = lines.join("\n");
fs.writeFileSync(
  "/Users/manav/Space/code/ero-fundamentals.md",
  output,
  "utf8"
);
console.log(
  `Written ${lines.length} lines to /Users/manav/Space/code/ero-fundamentals.md`
);
