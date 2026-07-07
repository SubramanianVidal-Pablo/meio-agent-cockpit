import { SKU_DATA } from './mockData';

const critical = SKU_DATA.filter(s => s.status === 'CRITICAL_OOS');
const excess   = SKU_DATA.filter(s => s.status === 'EXCESS');

export const AGENT_STEPS = [
  {
    id: 'scan',
    tool: 'scan_biopharma_network',
    params: { scope: 'all_echelons', cold_chain: true, skus: SKU_DATA.length },
    delayMs: 600,
    durationMs: 1100,
    icon: '🔍',
    label: 'Scanning biologics supply network across all echelons',
    result: {
      totalSkus: SKU_DATA.length,
      exceptions: SKU_DATA.filter(s => s.status !== 'HEALTHY').length,
      criticalOOS: critical.length,
      excessShelfLifeRisk: excess.length,
      coldChainSKUs: SKU_DATA.filter(s => s.coldChain).length,
      lifeSavingAtRisk: SKU_DATA.filter(s => s.criticality === 'Life-saving' && s.status !== 'HEALTHY').length,
      networkHealthScore: 87,
      coldChainCompliance: '98.2%',
    },
    resultSummary: `Network scan complete. ${SKU_DATA.filter(s => s.status !== 'HEALTHY').length} exceptions across ${SKU_DATA.length} biologics SKUs. ${SKU_DATA.filter(s => s.criticality === 'Life-saving' && s.status !== 'HEALTHY').length} life-saving therapies at risk. Cold chain compliance: 98.2%.`,
  },
  {
    id: 'get_critical',
    tool: 'get_critical_supply_risks',
    params: { status: 'CRITICAL_OOS', priority: 'life_saving_first', include_batch_status: true },
    delayMs: 300,
    durationMs: 900,
    icon: '🚨',
    label: 'Retrieving critical OOS risks — prioritising life-saving therapies',
    result: {
      skus: critical.map(s => s.id),
      therapies: critical.map(s => s.name),
      totalPnlAtRisk: critical.reduce((a, s) => a + Math.abs(s.pnlImpact), 0),
      avgDaysToStockout: (critical.reduce((a, s) => a + s.daysToImpact, 0) / critical.length).toFixed(1),
      batchReleaseDelays: ['BIO-A100'],
      plasmaCollectionShortfall: ['BIO-L120'],
    },
    resultSummary: `${critical.length} critical OOS SKUs — all life-saving biologics. Combined P&L at risk: $${(critical.reduce((a, s) => a + Math.abs(s.pnlImpact), 0) / 1000000).toFixed(2)}M. Avg days to patient stockout: ${(critical.reduce((a, s) => a + s.daysToImpact, 0) / critical.length).toFixed(1)}. BIO-A100 delayed by batch release hold; BIO-L120 constrained by plasma collection shortfall.`,
  },
  {
    id: 'replen_a100',
    tool: 'calculate_replenishment',
    params: { sku_id: 'BIO-A100', method: 'safety_stock_optimisation', consider_batch_release: true },
    delayMs: 250,
    durationMs: 1300,
    icon: '📦',
    label: 'Calculating replenishment — BIO-A100 Adalimumab mAb DS',
    result: {
      sku: 'BIO-A100',
      orderQty: '1,650 vials (3.3 batches)',
      orderValue: 470250,
      newDoS: 90,
      newServiceLevel: '99.2%',
      leadTimeCover: '120 days (incl. QC release)',
      expediteRequired: true,
      urgency: 'IMMEDIATE — patient impact within 3 days',
      batchReleaseAction: 'Escalate to QA for priority batch release review',
    },
    resultSummary: 'BIO-A100: Order 1,650 vials ($470K). New DoS: 90d. SL: 99.2%. Expedite required — escalate batch release hold to QA within 24 hours.',
  },
  {
    id: 'replen_l120',
    tool: 'calculate_replenishment',
    params: { sku_id: 'BIO-L120', method: 'safety_stock_optimisation', consider_plasma_yield: true },
    delayMs: 200,
    durationMs: 1200,
    icon: '📦',
    label: 'Calculating replenishment — BIO-L120 Factor VIII Plasma DS',
    result: {
      sku: 'BIO-L120',
      orderQty: '1,400 units (14 plasma lots)',
      orderValue: 728000,
      newDoS: 120,
      newServiceLevel: '99.3%',
      leadTimeCover: '180 days (plasma fractionation)',
      plasmaCollectionSites: 3,
      urgency: 'HIGH — haemophilia patient risk',
    },
    resultSummary: 'BIO-L120: 14 plasma lots ($728K). New DoS: 120d target met. 180-day plasma fractionation lead time — activate 3 additional plasma collection sites immediately.',
  },
  {
    id: 'replen_b200_c300',
    tool: 'calculate_replenishment_batch',
    params: { skus: ['BIO-B200', 'BIO-C300'], method: 'safety_stock_optimisation', cmo_allocation: true },
    delayMs: 200,
    durationMs: 1100,
    icon: '📦',
    label: 'Calculating replenishment — BIO-B200 Rituximab & BIO-C300 Pembrolizumab',
    result: {
      'BIO-B200': { orderQty: '6,700 vials', orderValue: 281400, newDoS: 60, urgency: 'HIGH' },
      'BIO-C300': { orderQty: '3,600 vials', orderValue: 280800, newDoS: 45, urgency: 'HIGH' },
      cmoCapacityCheck: 'Sufficient — dual-source CMO available',
      combinedValue: 562200,
    },
    resultSummary: 'BIO-B200: 6,700 vials ($281K). BIO-C300: 3,600 vials ($281K). Dual-source CMO confirmed available. Combined order: $562K.',
  },
  {
    id: 'shelf_life',
    tool: 'assess_shelf_life_risk',
    params: { skus: excess.map(s => s.id), action: 'lateral_transfer_or_destock', cold_chain: true },
    delayMs: 300,
    durationMs: 1200,
    icon: '⏳',
    label: 'Assessing shelf life risk on excess biologics inventory',
    result: {
      skus: excess.map(s => s.id),
      'BIO-D400': { excessDoS: 52, shelfLifeMonths: 18, writeOffRisk: '$156K within 90 days', recommendation: 'Lateral transfer to Cold Chain DC East' },
      'BIO-E500': { excessDoS: 73, shelfLifeMonths: 12, writeOffRisk: '$89K within 45 days', recommendation: 'Expedite commercial release — specialty pharmacy channel' },
      totalWriteOffAvoided: 245000,
    },
    resultSummary: 'BIO-D400 (Trastuzumab DS): 52 excess DoS vs 18-month shelf life — $156K write-off risk. BIO-E500 (Insulin Glargine): 73 excess DoS vs 12-month shelf life — $89K risk. Total $245K avoidable via lateral transfer and expedited commercial release.',
  },
  {
    id: 'rank',
    tool: 'rank_action_priorities',
    params: { criteria: ['patient_impact', 'pnl_impact', 'days_to_stockout', 'regulatory_risk'], method: 'weighted_score' },
    delayMs: 300,
    durationMs: 800,
    icon: '🏆',
    label: 'Ranking actions by patient impact and P&L priority score',
    result: {
      ranked: [
        { sku: 'BIO-A100', score: 99, action: 'Emergency replenishment + QA batch release escalation', pnl: '$487K', patientRisk: 'CRITICAL' },
        { sku: 'BIO-L120', score: 96, action: 'Activate plasma collection sites + expedite fractionation', pnl: '$275K', patientRisk: 'CRITICAL' },
        { sku: 'BIO-C300', score: 91, action: 'Expedited CMO order', pnl: '$218K', patientRisk: 'HIGH' },
        { sku: 'BIO-B200', score: 89, action: 'Standard replenishment order', pnl: '$342K', patientRisk: 'HIGH' },
        { sku: 'BIO-D400', score: 74, action: 'Lateral transfer — avoid shelf life write-off', pnl: '-$156K saved', patientRisk: 'LOW' },
      ],
    },
    resultSummary: 'Priority ranking complete. BIO-A100 highest urgency (score 99) — patient stockout imminent. BIO-L120 second priority due to haemophilia patient dependency and 180-day fractionation lead time. Total actionable P&L: $1.76M.',
  },
]

export function buildSynthesisPrompt(stepResults) {
  return `You are MEIO-GPT, a biopharma supply chain AI agent. You have just completed an agentic inventory optimisation run across a biologics network spanning Drug Substance manufacturing, Fill-Finish, and Cold Chain Distribution.

TOOL EXECUTION RESULTS:

NETWORK SCAN:
${stepResults.scan?.resultSummary || ''}

CRITICAL SUPPLY RISKS:
${stepResults.get_critical?.resultSummary || ''}

REPLENISHMENT CALCULATIONS:
- ${stepResults.replen_a100?.resultSummary || ''}
- ${stepResults.replen_l120?.resultSummary || ''}
- ${stepResults.replen_b200_c300?.resultSummary || ''}

SHELF LIFE RISK ASSESSMENT:
${stepResults.shelf_life?.resultSummary || ''}

PRIORITY RANKING:
${stepResults.rank?.resultSummary || ''}

Write a concise executive summary (5-6 sentences) for the supply chain planner. Use biopharma supply chain language — reference batch release, cold chain, DoS (days of supply), CMO, plasma fractionation, and patient impact where relevant. State: (1) the most critical patient risk and what must happen in the next 24 hours, (2) total capital required for replenishment orders, (3) working capital that can be recovered from excess positions, and (4) the single biggest systemic risk in this network. Be direct and quantitative.`
}

export const PROPOSED_ACTIONS = [
  {
    id: 'a1',
    sku: 'BIO-A100',
    action: 'Emergency replenishment + QA batch release escalation',
    detail: '1,650 vials · $470K · Escalate batch release hold within 24h',
    urgency: 'IMMEDIATE',
    pnl: 487000,
  },
  {
    id: 'a2',
    sku: 'BIO-L120',
    action: 'Activate plasma collection sites — expedite fractionation',
    detail: '14 plasma lots · $728K · 180-day lead time — activate now',
    urgency: 'IMMEDIATE',
    pnl: 275000,
  },
  {
    id: 'a3',
    sku: 'BIO-C300',
    action: 'Expedited CMO replenishment order',
    detail: '3,600 vials · $281K · Dual-source CMO · 75-day lead time',
    urgency: 'HIGH',
    pnl: 218000,
  },
  {
    id: 'a4',
    sku: 'BIO-B200',
    action: 'Standard replenishment order',
    detail: '6,700 vials · $281K · Single-source CMO · 90-day lead time',
    urgency: 'HIGH',
    pnl: 342000,
  },
  {
    id: 'a5',
    sku: 'BIO-D400',
    action: 'Lateral transfer — Cold Chain DC East',
    detail: 'Destock 52 excess DoS · avoid $156K shelf life write-off',
    urgency: 'MEDIUM',
    pnl: -156000,
  },
  {
    id: 'a6',
    sku: 'BIO-E500',
    action: 'Expedite commercial release — specialty pharmacy channel',
    detail: 'Reduce 73 excess DoS · avoid $89K write-off · 12-month shelf life',
    urgency: 'MEDIUM',
    pnl: -89000,
  },
]
