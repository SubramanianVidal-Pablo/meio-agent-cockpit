import { MONTH_LABELS } from './skuData';

/**
 * Core simulation runner.
 *
 * customParams (optional) — when provided, overrides the scenario presets:
 * {
 *   shortfallMonths:   number[]   // 0-indexed months with reduced supply
 *   shortfallPct:      number     // supply as fraction of plan, e.g. 0.70
 *   spikeMonths:       number[]   // 0-indexed months with elevated demand
 *   spikeMultiplier:   number     // demand multiplier, e.g. 1.35
 *   spikeTiers:        number[]   // which tiers the spike applies to, e.g. [1,2]
 *   ssMultiplierOverride: number  // overrides the ssMultiplier argument
 * }
 */
// ── Scenario SS multipliers ────────────────────────────────────────────────────
// Conservative (baseline): risk-averse — MEIO target × 1.25 (bigger buffers)
// Base        (reactive) : MEIO-recommended — target × 1.00
// Optimistic  (proactive): lean            — MEIO target × 0.80 (tighter buffers)
export const SCENARIO_SS_MULT = { baseline: 1.08, reactive: 1.0, proactive: 0.93 };

export function runSimulation(skus, scenario, ssMultiplier, months = 12, customParams = null) {
  return skus.map(sku => {
    const timeline = [];

    // ── Resolve per-SKU SS multiplier (supports global number or per-tier object) ──
    const rawMult = customParams?.ssMultiplierOverride ?? ssMultiplier;
    const effectiveMult = typeof rawMult === 'object' ? (rawMult[sku.tier] ?? 1.0) : rawMult;

    // ── Planning parameters (extended biopharma levers) ──────────────────────
    const forecastBias      = customParams?.forecastBias      ?? 1.0;
    const cmoReliability    = customParams?.cmoReliability    ?? 1.0;
    const leadTimeAdjWeeks  = customParams?.leadTimeAdjWeeks  ?? 0;
    const batchReleaseWeeks = customParams?.batchReleaseWeeks ?? 0;
    const demandCVMult      = customParams?.demandCVMult      ?? 1.0;

    // ── Scenario SS multiplier: drives Conservative / Base / Optimistic split ─
    // Only applied when no customParams override is active (Scenario Planning
    // uses customParams directly and bypasses this).
    const scenarioSSMult = customParams ? 1.0 : (SCENARIO_SS_MULT[scenario] ?? 1.0);

    // ── Lead-time effect on safety stock (SS ∝ √LT) ──────────────────────────
    const baseLT     = Math.max(sku.leadTimeWeeks, 1);
    const adjustedLT = baseLT + leadTimeAdjWeeks + batchReleaseWeeks;
    const ltSSFactor = Math.sqrt(adjustedLT / baseLT);
    const cvSSFactor = demandCVMult;

    // ── SS target: MEIO base × scenario × user levers ────────────────────────
    const ssTarget = sku.meioSafetyStock * effectiveMult * scenarioSSMult * ltSSFactor * cvSSFactor;

    // ── Risk threshold: scenario-adjusted MEIO floor ──────────────────────────
    // (higher in Conservative → more SKUs flagged at risk; lower in Optimistic)
    const riskThreshold = sku.meioSafetyStock * scenarioSSMult;

    // ── Starting inventory: scale with user lever (not scenario) ──────────────
    let prevInventory = sku.onHand * effectiveMult;

    for (let m = 0; m < months; m++) {
      const baseDemand = sku.monthlyDemand[m];

      // ── Demand: only customParams spike logic; no scenario-baked disruptions ─
      let demandMultiplier = forecastBias;
      if (customParams) {
        const inSpike     = customParams.spikeMonths?.includes(m);
        const tierAffected = !customParams.spikeTiers || customParams.spikeTiers.includes(sku.tier);
        if (inSpike && tierAffected)
          demandMultiplier = (customParams.spikeMultiplier ?? 1.0) * forecastBias;
      }
      const demand = baseDemand * demandMultiplier;

      // ── Supply: only customParams shortfall logic; no scenario-baked cuts ────
      let supplyMultiplier = cmoReliability;
      if (customParams && customParams.shortfallMonths?.includes(m))
        supplyMultiplier = Math.min(cmoReliability, customParams.shortfallPct ?? 1.0);
      const supply = sku.plannedSupply[m] * supplyMultiplier;

      // ── Inventory update ────────────────────────────────────────────────
      const inventory = Math.max(0, prevInventory + supply - demand);

      // Risk is measured against the fixed MEIO baseline (not the scaled target)
      const gap             = inventory - riskThreshold;
      const atRisk          = gap < 0;
      const criticalRisk    = inventory < riskThreshold * 0.5;
      const coverageDays    = Math.round((inventory / Math.max(demand, 1)) * 30);
      const fulfillmentRate = inventory + supply >= demand
        ? 100
        : Math.min(100, (inventory / Math.max(demand, 1)) * 100);
      const marginAtRisk    = atRisk ? Math.abs(gap) * sku.unitRevenue * sku.unitMargin : 0;

      timeline.push({
        month: m + 1,
        label: MONTH_LABELS[m],
        inventory,
        demand,
        supply,
        ssTarget,
        gap,
        atRisk,
        criticalRisk,
        coverageDays,
        fulfillmentRate,
        marginAtRisk,
      });

      prevInventory = inventory;
    }

    return { ...sku, timeline };
  });
}

export function getPortfolioSummary(simulatedSkus) {
  let totalMarginAtRisk = 0;
  let skusAtRisk = 0;
  const criticalSkus = [];
  let totalFulfillment = 0;
  let totalDataPoints = 0;
  const monthRiskCounts = new Array(12).fill(0);
  const monthMarginAtRisk = new Array(12).fill(0);

  for (const sku of simulatedSkus) {
    let skuAtRisk = false;
    let skuCritical = false;

    for (const entry of sku.timeline) {
      const m = entry.month - 1;
      totalMarginAtRisk += entry.marginAtRisk;
      totalFulfillment += entry.fulfillmentRate;
      totalDataPoints++;
      if (entry.atRisk) {
        skuAtRisk = true;
        monthRiskCounts[m]++;
        monthMarginAtRisk[m] += entry.marginAtRisk;
      }
      if (entry.criticalRisk) skuCritical = true;
    }

    if (skuAtRisk) skusAtRisk++;
    if (skuCritical) criticalSkus.push(sku);
  }

  const avgFulfillmentRate = totalDataPoints > 0 ? totalFulfillment / totalDataPoints : 100;

  const worstMonthIdx = monthRiskCounts.indexOf(Math.max(...monthRiskCounts));
  const peakRiskMonthIdx = monthMarginAtRisk.indexOf(Math.max(...monthMarginAtRisk));

  return {
    totalMarginAtRisk,
    skusAtRisk,
    criticalSkus,
    avgFulfillmentRate,
    worstMonth: MONTH_LABELS[worstMonthIdx],
    peakRiskMonth: peakRiskMonthIdx,
  };
}

export function getScenarioComparison(skus, ssMultiplier) {
  const scenarios = ['baseline', 'reactive', 'proactive'];
  const result = {};

  for (const scenario of scenarios) {
    const simulated = runSimulation(skus, scenario, ssMultiplier);
    const summary = getPortfolioSummary(simulated);
    result[scenario] = {
      totalMarginAtRisk: summary.totalMarginAtRisk,
      skusAtRisk: summary.skusAtRisk,
      avgFulfillmentRate: summary.avgFulfillmentRate,
    };
  }

  return result;
}

/**
 * Inventory Optimisation Engine
 * For each SKU, computes the "just enough" safety stock target calibrated to:
 *  - Statistical service level (Z-score × demand variability × √lead-time)
 *  - Scenario stress (reactive/proactive raise the effective buffer requirement)
 * Then classifies the gap vs current stock as REDUCE / MAINTAIN / INCREASE
 * and sizes the working-capital and holding-cost impact.
 */
export function optimizeInventory(skus, scenario, ssMultiplier) {
  // Run the simulation first so we have per-month risk data
  const simulated = runSimulation(skus, scenario, ssMultiplier);

  // Z-score lookup for standard service targets
  function zScore(st) {
    if (st >= 0.995) return 2.58;
    if (st >= 0.99)  return 2.33;
    if (st >= 0.98)  return 2.05;
    if (st >= 0.97)  return 1.88;
    if (st >= 0.95)  return 1.65;
    return 1.28;
  }

  // Scenario SS multiplier: Conservative=1.25×, Base=1.0×, Optimistic=0.80×
  const scenarioSSMult = SCENARIO_SS_MULT[scenario] ?? 1.0;

  return simulated.map(sku => {
    const z           = zScore(sku.serviceTarget);
    const avgWeekly   = sku.monthlyDemand.reduce((a, b) => a + b, 0) / 12 / 4.33;
    const sigmaWeekly = avgWeekly * sku.demandCV;

    // SS formula: Z × σ × √LT, scaled by scenario philosophy
    const statOptimal = Math.round(z * sigmaWeekly * Math.sqrt(sku.leadTimeWeeks) * 4.33);

    // Policy target: MEIO baseline × scenario × user tier lever
    const tierMult      = typeof ssMultiplier === 'object' ? (ssMultiplier[sku.tier] ?? 1.0) : ssMultiplier;
    const policyOptimal = Math.round(sku.meioSafetyStock * tierMult * scenarioSSMult);
    const effectiveOptimal = Math.max(statOptimal, Math.round(policyOptimal * 0.85));

    const currentSS = sku.currentSafetyStock;

    // Anchor decisions and financials to on-hand vs MEIO target (apples-to-apples with UI)
    const onHand    = sku.onHand;
    const delta     = onHand - effectiveOptimal;           // + = on-hand above MEIO (overstock), − = below (understock)
    const deltaFrac = effectiveOptimal > 0 ? delta / effectiveOptimal : 0;

    // Decision thresholds: >+12 % over → REDUCE, >10 % under → INCREASE, else MAINTAIN
    const decision =
      deltaFrac >  0.12 ? 'REDUCE'   :
      deltaFrac < -0.10 ? 'INCREASE' : 'MAINTAIN';

    // Financial sizing: based on on-hand delta vs MEIO target
    const wcImpact            = -delta * sku.unitCost;    // +ve = WC needed (understock), −ve = WC release (overstock)
    const annualHoldingImpact =  Math.abs(delta) * sku.unitCost * sku.holdingCostPct;

    const riskMonths = sku.timeline.filter(t => t.atRisk).length;
    const urgency =
      (decision === 'INCREASE' && riskMonths >= 3) ? 'Immediate' :
      (decision === 'INCREASE' && riskMonths  > 0) ? 'This Quarter' :
       decision === 'REDUCE'                        ? 'Next Review' : 'Monitor';

    return {
      ...sku,
      effectiveOptimal,
      policyOptimal,
      currentSS,
      onHand,
      delta,          // on-hand minus MEIO target: + = overstock, − = understock
      decision,
      wcImpact,       // + = WC needed to build up, − = WC releasable
      annualHoldingImpact,
      riskMonths,
      urgency,
    };
  });
}

/**
 * Shortfall Management Plan
 * ─────────────────────────────────────────────────────────────────────────────
 * Core agent value: instead of holding a FLAT SS target every month and watching
 * inventory crash through it, the agent computes a TIME-PHASED drawdown schedule.
 *
 * Logic per phase:
 *   Pre-shortfall  (months 1–2)  : Pre-build T1/T2 buffers +10 % above target.
 *   Shortfall onset (month 3)    : Hold T1/T2 at 100 %; step T3/T4 down to 75 %.
 *   Peak shortfall  (months 4–5) : Keep T1/T2 at 100 %; T3/T4 drawn to 50 %
 *                                   — they act as the portfolio shock-absorber.
 *   Recovery        (months 6–7) : Demand spike hits T1/T2; hold protection;
 *                                   begin rebuilding T3/T4.
 *   Normalise       (months 8–12): Step all tiers back to normal ssMultiplier.
 *
 * The function runs the simulation TWICE with the same supply/demand stress
 * and returns both timelines so the UI can show "No-action" vs "Agent-managed".
 */
export function getShortfallManagementPlan(skus, scenario, ssMultiplier) {
  // Month-by-month SS multiplier per tier (relative to meioSafetyStock)
  // These are applied on top of the user's ssMultiplier
  const SCHEDULE = [
    { phase: 'Pre-build',       t12: 1.10, t34: 1.00, action: 'Pre-build T1/T2 buffer above normal target' },
    { phase: 'Pre-build',       t12: 1.10, t34: 1.00, action: 'Confirm planned supply; lock CMO slots' },
    { phase: 'Shortfall starts',t12: 1.00, t34: 0.75, action: 'Draw down T3/T4 buffer — protect T1/T2 allocation' },
    { phase: 'Peak shortfall',  t12: 1.00, t34: 0.55, action: 'T3/T4 is shock-absorber; short T4 if needed to free capacity' },
    { phase: 'Peak shortfall',  t12: 1.00, t34: 0.55, action: 'Maintain T1/T2 at full target; expedite CMO recovery' },
    { phase: 'Demand spike',    t12: 1.05, t34: 0.65, action: 'Demand spike starts — lift T1/T2 buffer 5 %; begin T3/T4 rebuild' },
    { phase: 'Demand spike',    t12: 1.05, t34: 0.75, action: 'Spike peak — monitor T1/T2 coverage daily' },
    { phase: 'Demand spike',    t12: 1.05, t34: 0.80, action: 'Spike winding down; continue T3/T4 rebuild' },
    { phase: 'Normalising',     t12: 1.00, t34: 0.88, action: 'Return T1/T2 to standard target; rebuild T3/T4 to 88 %' },
    { phase: 'Normalising',     t12: 1.00, t34: 0.94, action: 'T3/T4 approaching normal; confirm SS policy re-set' },
    { phase: 'Stable',          t12: 1.00, t34: 1.00, action: 'All tiers at standard MEIO target — hold' },
    { phase: 'Stable',          t12: 1.00, t34: 1.00, action: 'Normal operations — quarterly SS review' },
  ];

  // For baseline scenario the schedule is flat (no event to manage)
  const isStressed = scenario !== 'baseline';

  function ssForMonth(sku, m) {
    if (!isStressed) return sku.meioSafetyStock * ssMultiplier;
    const row = SCHEDULE[m];
    const factor = sku.tier <= 2 ? row.t12 : row.t34;
    return sku.meioSafetyStock * ssMultiplier * factor;
  }

  // ── Run managed simulation with time-phased SS targets ───────────────────
  function runManaged(skus) {
    return skus.map(sku => {
      const timeline = [];
      let prevInventory = sku.onHand;

      for (let m = 0; m < 12; m++) {
        const baseDemand = sku.monthlyDemand[m];
        let demandMultiplier = 1.0;
        if (m >= 5 && m <= 7 && sku.tier <= 2)
          demandMultiplier = scenario === 'proactive' ? 1.25 : 1.40;
        const demand = baseDemand * demandMultiplier;

        let supplyMultiplier = 1.0;
        if (m >= 2 && m <= 4)
          supplyMultiplier = scenario === 'proactive' ? 0.85 : 0.70;
        const supply = sku.plannedSupply[m] * supplyMultiplier;

        const managedSS = ssForMonth(sku, m);
        const staticSS  = sku.meioSafetyStock * ssMultiplier;
        const inventory = Math.max(0, prevInventory + supply - demand);

        timeline.push({
          month: m + 1,
          label: MONTH_LABELS[m],
          inventory,
          demand,
          supply,
          supplyPct: Math.round((supply / sku.plannedSupply[m]) * 100),
          managedSS,
          staticSS,
          managedGap:  inventory - managedSS,
          staticGap:   inventory - staticSS,
          atRiskManaged: inventory < managedSS,
          atRiskStatic:  inventory < staticSS,
          phase: SCHEDULE[m].phase,
          action: SCHEDULE[m].action,
          ssReduction: Math.round(staticSS - managedSS),        // units of SS released
          ssReductionPct: staticSS > 0
            ? Math.round(((staticSS - managedSS) / staticSS) * 100) : 0,
        });

        prevInventory = inventory;
      }

      return { ...sku, timeline };
    });
  }

  const managedSkus = runManaged(skus);

  // ── Portfolio comparison: managed vs static ──────────────────────────────
  function countRiskMonths(skuList, useManaged) {
    let total = 0;
    for (const s of skuList)
      for (const t of s.timeline)
        total += (useManaged ? t.atRiskManaged : t.atRiskStatic) ? 1 : 0;
    return total;
  }

  const t12Skus = managedSkus.filter(s => s.tier <= 2);
  const t34Skus = managedSkus.filter(s => s.tier  > 2);

  const comparison = {
    t12: {
      staticRiskMonths:  countRiskMonths(t12Skus, false),
      managedRiskMonths: countRiskMonths(t12Skus, true),
    },
    t34: {
      staticRiskMonths:  countRiskMonths(t34Skus, false),
      managedRiskMonths: countRiskMonths(t34Skus, true),
    },
  };

  // ── Monthly portfolio-level summary table ────────────────────────────────
  const monthlyPlan = SCHEDULE.map((row, m) => {
    const allSkus = managedSkus;
    const staticRisk  = allSkus.filter(s => s.timeline[m].atRiskStatic).length;
    const managedRisk = allSkus.filter(s => s.timeline[m].atRiskManaged).length;
    const t12Risk     = t12Skus.filter(s => s.timeline[m].atRiskManaged).length;
    const t34Risk     = t34Skus.filter(s => s.timeline[m].atRiskManaged).length;
    const supplyPct   = scenario === 'baseline' ? 100
      : (m >= 2 && m <= 4) ? (scenario === 'proactive' ? 85 : 70) : 100;

    // WC released this month from managed drawdown vs static
    const wcReleased = allSkus.reduce((sum, s) => {
      const released = s.timeline[m].ssReduction * s.unitCost;
      return sum + Math.max(0, released);
    }, 0);

    return {
      month: m + 1,
      label: MONTH_LABELS[m],
      phase: row.phase,
      action: row.action,
      supplyPct,
      t12Target: Math.round(row.t12 * ssMultiplier * 100),   // % of meioSS
      t34Target: Math.round(row.t34 * ssMultiplier * 100),
      staticRiskSkus:  staticRisk,
      managedRiskSkus: managedRisk,
      t12RiskSkus: t12Risk,
      t34RiskSkus: t34Risk,
      wcReleased,
    };
  });

  return { managedSkus, monthlyPlan, comparison, schedule: SCHEDULE };
}

export function getRiskHeatmapData(simulatedSkus) {
  const sorted = [...simulatedSkus].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.name.localeCompare(b.name);
  });

  return sorted.map(sku => ({
    skuId: sku.id,
    skuName: sku.name,
    tier: sku.tier,
    months: sku.timeline.map(entry => ({
      skuId: sku.id,
      skuName: sku.name,
      tier: sku.tier,
      month: entry.month,
      atRisk: entry.atRisk,
      criticalRisk: entry.criticalRisk,
      gap: entry.gap,
      inventory: entry.inventory,
      ssTarget: entry.ssTarget,
    })),
  }));
}
