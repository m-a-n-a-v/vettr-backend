import { db } from '../../config/database.js';
import { alerts, alertRules, stocks, users } from '../schema/index.js';
import { eq, inArray } from 'drizzle-orm';

/**
 * Seed sample alert rules and triggered alerts for demo purposes.
 * Requires stocks and at least one user to already exist in the database.
 * Returns total count of seeded alert rules + alerts.
 */
export async function seedAlerts(): Promise<number> {
  if (!db) {
    console.error('\u274c Database not available - cannot seed alerts');
    return 0;
  }

  console.log('\n\U0001f514 Seeding alerts...');

  // Clear existing alerts and alert_rules to avoid duplicates
  // Alerts first (references alert_rules via FK)
  console.log('\U0001f5d1\ufe0f  Clearing existing alerts...');
  await db.delete(alerts);
  console.log('\U0001f5d1\ufe0f  Clearing existing alert rules...');
  await db.delete(alertRules);

  // Look up a demo user (first user in the table)
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.log('   \u26a0\ufe0f  No users found - skipping alert seeding');
    return 0;
  }
  const demoUser = allUsers[0];
  console.log(`   Using demo user: ${demoUser.email}`);

  // Look up real stock IDs by ticker
  const targetTickers = ['NXE', 'ARIS', 'LUN', 'FM', 'ERO', 'MAG', 'WPM', 'AEM'];
  const stockRows = await db
    .select({ id: stocks.id, ticker: stocks.ticker, name: stocks.name })
    .from(stocks)
    .where(inArray(stocks.ticker, targetTickers));

  if (stockRows.length === 0) {
    console.log('   \u26a0\ufe0f  No stocks found - skipping alert seeding');
    return 0;
  }

  const stockByTicker = new Map(stockRows.map((s) => [s.ticker, s]));
  console.log(`   Found ${stockRows.length} stocks for alert seeding`);

  // ── Alert Rules ──────────────────────────────────────────────────────

  const ruleDefs = [
    {
      stockTicker: 'NXE',
      ruleType: 'Red Flag',
      triggerConditions: { threshold: 50, condition: 'score_below' },
      frequency: 'instant' as const,
      threshold: 50,
    },
    {
      stockTicker: 'ARIS',
      ruleType: 'Financing',
      triggerConditions: { minAmount: 10_000_000, condition: 'financing_announced' },
      frequency: 'instant' as const,
      threshold: null,
    },
    {
      stockTicker: 'LUN',
      ruleType: 'Executive Changes',
      triggerConditions: { roles: ['CEO', 'CFO', 'COO'], condition: 'role_change' },
      frequency: 'daily' as const,
      threshold: null,
    },
    {
      stockTicker: 'FM',
      ruleType: 'Consolidation',
      triggerConditions: { condition: 'merger_or_acquisition' },
      frequency: 'instant' as const,
      threshold: null,
    },
    {
      stockTicker: 'ERO',
      ruleType: 'Drill Results',
      triggerConditions: { minGrade: 2.5, mineral: 'copper', condition: 'assay_results' },
      frequency: 'daily' as const,
      threshold: 2.5,
    },
    {
      stockTicker: 'MAG',
      ruleType: 'Red Flag',
      triggerConditions: { threshold: 40, condition: 'score_below' },
      frequency: 'weekly' as const,
      threshold: 40,
    },
    {
      stockTicker: 'WPM',
      ruleType: 'Financing',
      triggerConditions: { minAmount: 50_000_000, condition: 'financing_announced' },
      frequency: 'instant' as const,
      threshold: null,
    },
    {
      stockTicker: 'AEM',
      ruleType: 'Executive Changes',
      triggerConditions: { roles: ['CEO', 'VP Exploration'], condition: 'role_change' },
      frequency: 'instant' as const,
      threshold: null,
    },
  ];

  let rulesInserted = 0;
  const insertedRuleIds: Record<string, string> = {};

  for (const rule of ruleDefs) {
    const result = await db
      .insert(alertRules)
      .values({
        userId: demoUser.id,
        stockTicker: rule.stockTicker,
        ruleType: rule.ruleType,
        triggerConditions: rule.triggerConditions,
        conditionOperator: 'AND',
        frequency: rule.frequency,
        threshold: rule.threshold,
        isActive: true,
      })
      .returning({ id: alertRules.id });

    insertedRuleIds[`${rule.stockTicker}_${rule.ruleType}`] = result[0].id;
    rulesInserted++;
  }

  console.log(`   \u2713 Inserted ${rulesInserted} alert rules`);

  // ── Triggered Alerts ─────────────────────────────────────────────────

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const alertDefs = [
    {
      ticker: 'NXE',
      alertRuleKey: 'NXE_Red Flag',
      alertType: 'Red Flag',
      title: 'Red Flag: VETR Score Below Threshold',
      message: "NXE\'s VETR score dropped to 42, below your threshold of 50. Key concerns include recent insider selling and delayed project timelines.",
      triggeredAt: oneHourAgo,
      isRead: false,
    },
    {
      ticker: 'ARIS',
      alertRuleKey: 'ARIS_Financing',
      alertType: 'Financing',
      title: 'New Financing: Aris Mining $25M Bought Deal',
      message: 'Aris Mining announced a $25M bought deal financing at $7.20 per share. Proceeds earmarked for Segovia mine expansion.',
      triggeredAt: sixHoursAgo,
      isRead: false,
    },
    {
      ticker: 'LUN',
      alertRuleKey: 'LUN_Executive Changes',
      alertType: 'Executive Changes',
      title: 'Executive Change: Lundin Mining CFO Departure',
      message: 'Lundin Mining\'s CFO has announced departure effective Q2 2025. Interim CFO appointed from existing senior management.',
      triggeredAt: oneDayAgo,
      isRead: false,
    },
    {
      ticker: 'FM',
      alertRuleKey: 'FM_Consolidation',
      alertType: 'Consolidation',
      title: 'M&A Activity: First Quantum Acquisition Rumour',
      message: 'Market reports suggest First Quantum Minerals is in early-stage discussions regarding a potential acquisition target in the copper space.',
      triggeredAt: oneDayAgo,
      isRead: true,
    },
    {
      ticker: 'ERO',
      alertRuleKey: 'ERO_Drill Results',
      alertType: 'Drill Results',
      title: 'Drill Results: Ero Copper Tucuma Extension',
      message: 'Ero Copper reported 15.2m @ 3.8% Cu in step-out drilling at Tucuma. Results extend known mineralization 200m to the east.',
      triggeredAt: twoDaysAgo,
      isRead: true,
    },
    {
      ticker: 'MAG',
      alertRuleKey: 'MAG_Red Flag',
      alertType: 'Red Flag',
      title: 'Red Flag: MAG Silver Score Decline',
      message: 'MAG Silver\'s VETR score fell to 38, below your threshold of 40. Permitting delays at Juanicipio are the primary driver.',
      triggeredAt: twoDaysAgo,
      isRead: false,
    },
    {
      ticker: 'WPM',
      alertRuleKey: null,
      alertType: 'Financing',
      title: 'Streaming Deal: Wheaton Precious Metals New Agreement',
      message: 'Wheaton Precious Metals announced a new $150M streaming agreement with a mid-tier gold producer in West Africa.',
      triggeredAt: threeDaysAgo,
      isRead: true,
    },
    {
      ticker: 'NXE',
      alertRuleKey: null,
      alertType: 'Drill Results',
      title: 'Drill Update: NexGen Rook I Infill Results',
      message: 'NexGen Energy released infill drill results at Rook I showing 8.5m @ 22.6% U3O8 in Arrow deposit, confirming high-grade continuity.',
      triggeredAt: threeDaysAgo,
      isRead: false,
    },
    {
      ticker: 'AEM',
      alertRuleKey: 'AEM_Executive Changes',
      alertType: 'Executive Changes',
      title: 'Leadership: Agnico Eagle VP Exploration Appointed',
      message: 'Agnico Eagle appointed a new VP Exploration with 20+ years experience in Canadian Shield geology. Previously led discovery at a major gold camp.',
      triggeredAt: oneWeekAgo,
      isRead: true,
    },
    {
      ticker: 'LUN',
      alertRuleKey: null,
      alertType: 'Red Flag',
      title: 'Red Flag: Lundin Mining Production Warning',
      message: 'Lundin Mining issued a production guidance revision for Candelaria, lowering full-year copper output estimate by 8% due to water constraints.',
      triggeredAt: oneWeekAgo,
      isRead: false,
    },
    {
      ticker: 'FM',
      alertRuleKey: null,
      alertType: 'Drill Results',
      title: 'Exploration Update: First Quantum Kansanshi S3',
      message: 'First Quantum released positive exploration results from Kansanshi S3 expansion, with 42m @ 1.2% Cu including a high-grade zone of 12m @ 3.1% Cu.',
      triggeredAt: oneWeekAgo,
      isRead: true,
    },
    {
      ticker: 'ARIS',
      alertRuleKey: null,
      alertType: 'Executive Changes',
      title: 'Board Change: Aris Mining Director Resignation',
      message: 'An independent director at Aris Mining has resigned from the board citing personal reasons. Board now has 7 members, below the target of 8.',
      triggeredAt: oneWeekAgo,
      isRead: false,
    },
  ];

  let alertsInserted = 0;

  for (const alertDef of alertDefs) {
    const stock = stockByTicker.get(alertDef.ticker);
    if (!stock) {
      console.log(`   \u26a0\ufe0f  Stock ${alertDef.ticker} not found, skipping alert`);
      continue;
    }

    const ruleId = alertDef.alertRuleKey ? insertedRuleIds[alertDef.alertRuleKey] ?? null : null;

    await db.insert(alerts).values({
      userId: demoUser.id,
      stockId: stock.id,
      alertRuleId: ruleId,
      alertType: alertDef.alertType,
      title: alertDef.title,
      message: alertDef.message,
      triggeredAt: alertDef.triggeredAt,
      isRead: alertDef.isRead,
    });

    alertsInserted++;
  }

  console.log(`   \u2713 Inserted ${alertsInserted} triggered alerts`);

  const total = rulesInserted + alertsInserted;
  console.log(`   \u2705 Alerts seeding complete (${total} total records)`);
  return total;
}
