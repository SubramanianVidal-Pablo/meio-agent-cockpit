import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, X, Info } from 'lucide-react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER OPTIONS
───────────────────────────────────────────────────────────────────────────── */
const BU_OPTIONS     = ['All BU / Franchise', 'Oncology', 'Immunology', 'Neurology', 'Rare Disease'];
const REGION_OPTIONS = ['All Regions', 'North America', 'Europe', 'Asia Pacific', 'Latin America'];
const CLASS_OPTIONS  = ['All Classes', 'Class A', 'Class B', 'Class C'];
const WEEK_OPTIONS   = ['Current Week', 'W−1', 'W−2', 'W−3', 'W−4'];

/* ─────────────────────────────────────────────────────────────────────────────
   MASTER SKU DATASET
   Every SKU carries all filter dimensions + every metric the dashboard needs.
───────────────────────────────────────────────────────────────────────────── */
const SKU_MASTER = [
  // ── ONCOLOGY ──────────────────────────────────────────────────────────────
  { id: 'ONK-001', name: 'Lumexia IV',     bu: 'Oncology',    regions: ['North America', 'Europe'],
    abcClass: 'Class A', ipcStatus: 'below',   otif: 92.4, otifTarget: 98.5,
    woc: 2.1, daysToBreach: 14, stockoutProb: 82, stockoutAtRisk: 6.8e6,
    eoWriteOff: 1.8e6, eoRecoverable: 2.4e6, invValue: 18.4e6,
    stockoutRec: 'Expedite CMO batch — airfreight to avoid breach' },
  { id: 'ONK-002', name: 'Protazen Oral',  bu: 'Oncology',    regions: ['North America', 'Latin America'],
    abcClass: 'Class B', ipcStatus: 'above',   otif: 97.2, otifTarget: 97.0,
    woc: 5.1, daysToBreach: 0,  stockoutProb: 0,  stockoutAtRisk: 0,
    eoWriteOff: 1.4e6, eoRecoverable: 3.2e6, invValue: 12.1e6,
    stockoutRec: null },
  { id: 'ONK-003', name: 'Nexotab Caps',   bu: 'Oncology',    regions: ['Europe', 'Asia Pacific'],
    abcClass: 'Class C', ipcStatus: 'in-band', otif: 95.1, otifTarget: 95.0,
    woc: 6.2, daysToBreach: 0,  stockoutProb: 0,  stockoutAtRisk: 0,
    eoWriteOff: 0.6e6, eoRecoverable: 0.6e6, invValue: 4.8e6,
    stockoutRec: null },
  // ── IMMUNOLOGY ────────────────────────────────────────────────────────────
  { id: 'IMM-001', name: 'Velazan Sub',    bu: 'Immunology',  regions: ['Europe', 'Asia Pacific'],
    abcClass: 'Class A', ipcStatus: 'in-band', otif: 96.1, otifTarget: 98.5,
    woc: 3.4, daysToBreach: 24, stockoutProb: 61, stockoutAtRisk: 4.5e6,
    eoWriteOff: 0.4e6, eoRecoverable: 2.2e6, invValue: 22.6e6,
    stockoutRec: 'Increase WH transfer from EU hub by 2 wks supply' },
  { id: 'IMM-002', name: 'Immurel IV',     bu: 'Immunology',  regions: ['North America', 'Europe'],
    abcClass: 'Class A', ipcStatus: 'in-band', otif: 97.4, otifTarget: 98.5,
    woc: 7.8, daysToBreach: 0,  stockoutProb: 0,  stockoutAtRisk: 0,
    eoWriteOff: 0.8e6, eoRecoverable: 2.4e6, invValue: 19.8e6,
    stockoutRec: null },
  { id: 'IMM-003', name: 'Prostakin Tabs', bu: 'Immunology',  regions: ['Asia Pacific', 'Latin America'],
    abcClass: 'Class B', ipcStatus: 'in-band', otif: 88.4, otifTarget: 97.0,
    woc: 1.4, daysToBreach: 10, stockoutProb: 88, stockoutAtRisk: 3.4e6,
    eoWriteOff: 0,     eoRecoverable: 1.8e6, invValue: 8.2e6,
    stockoutRec: 'Trigger emergency reserve — demand surge ongoing' },
  // ── NEUROLOGY ─────────────────────────────────────────────────────────────
  { id: 'NEU-001', name: 'Nexovir Oral',   bu: 'Neurology',   regions: ['North America'],
    abcClass: 'Class B', ipcStatus: 'in-band', otif: 95.8, otifTarget: 97.0,
    woc: 4.2, daysToBreach: 29, stockoutProb: 44, stockoutAtRisk: 1.1e6,
    eoWriteOff: 0.2e6, eoRecoverable: 1.4e6, invValue: 6.4e6,
    stockoutRec: 'Monitor — demand signal improving, reassess W+2' },
  { id: 'NEU-002', name: 'Neurex IV',      bu: 'Neurology',   regions: ['Europe', 'North America'],
    abcClass: 'Class B', ipcStatus: 'above',   otif: 98.1, otifTarget: 97.0,
    woc: 9.2, daysToBreach: 0,  stockoutProb: 0,  stockoutAtRisk: 0,
    eoWriteOff: 0.4e6, eoRecoverable: 1.7e6, invValue: 5.8e6,
    stockoutRec: null },
  { id: 'NEU-003', name: 'Synaptex Caps',  bu: 'Neurology',   regions: ['Latin America', 'Asia Pacific'],
    abcClass: 'Class C', ipcStatus: 'in-band', otif: 93.2, otifTarget: 95.0,
    woc: 3.8, daysToBreach: 27, stockoutProb: 52, stockoutAtRisk: 1.0e6,
    eoWriteOff: 0,     eoRecoverable: 0,     invValue: 2.8e6,
    stockoutRec: 'Review demand plan before committing replenishment' },
  // ── RARE DISEASE ──────────────────────────────────────────────────────────
  { id: 'RAR-001', name: 'Helivex Plasma', bu: 'Rare Disease', regions: ['North America', 'Europe', 'Asia Pacific'],
    abcClass: 'Class A', ipcStatus: 'in-band', otif: 93.8, otifTarget: 98.5,
    woc: 1.8, daysToBreach: 12, stockoutProb: 91, stockoutAtRisk: 14.5e6,
    eoWriteOff: 1.2e6, eoRecoverable: 0.8e6, invValue: 14.2e6,
    stockoutRec: 'Trigger emergency reserve — patient criticality HIGH' },
  { id: 'RAR-002', name: 'Factor VII',     bu: 'Rare Disease', regions: ['North America', 'Europe'],
    abcClass: 'Class A', ipcStatus: 'in-band', otif: 95.6, otifTarget: 98.5,
    woc: 4.8, daysToBreach: 34, stockoutProb: 38, stockoutAtRisk: 1.2e6,
    eoWriteOff: 0.9e6, eoRecoverable: 1.1e6, invValue: 11.8e6,
    stockoutRec: 'No action required — within acceptable range' },
  { id: 'RAR-003', name: 'Albumin Frac',   bu: 'Rare Disease', regions: ['Latin America'],
    abcClass: 'Class B', ipcStatus: 'above',   otif: 96.8, otifTarget: 97.0,
    woc: 8.4, daysToBreach: 0,  stockoutProb: 0,  stockoutAtRisk: 0,
    eoWriteOff: 0,     eoRecoverable: 0,     invValue: 5.4e6,
    stockoutRec: null },
];

const SKU_OPTIONS = ['All SKUs', ...SKU_MASTER.map(s => s.id)];

/* ─────────────────────────────────────────────────────────────────────────────
   WEEK MULTIPLIERS — simulate metric variation across historical weeks
───────────────────────────────────────────────────────────────────────────── */
const WEEK_MULT = {
  'Current Week': { otif: 1.000, inv: 1.000, writeOff: 1.000, stockout: 1.000 },
  'W−1':          { otif: 1.004, inv: 0.998, writeOff: 0.962, stockout: 0.920 },
  'W−2':          { otif: 0.998, inv: 1.003, writeOff: 0.924, stockout: 0.840 },
  'W−3':          { otif: 1.008, inv: 0.995, writeOff: 0.886, stockout: 0.760 },
  'W−4':          { otif: 0.994, inv: 1.005, writeOff: 0.848, stockout: 0.680 },
};

/* ─────────────────────────────────────────────────────────────────────────────
   DECISIONS — tagged by BU + regions so filters can narrow them
───────────────────────────────────────────────────────────────────────────── */
const DECISIONS_DATA = [
  {
    id: 'd1', bu: 'Oncology', regions: ['North America', 'Europe'], priority: 'red',
    tag: 'Supply Allocation', due: 'Due Thu 10 Jul',
    issue: 'Insufficient supply to cover all markets for ONK-001 (Lumexia IV) — allocation decision required for Q3 batch',
    revenueAtRisk: 6.8e6, patientsAtRisk: 340, skusAffected: 1, marketsAffected: 5,
    agentRec: 'Prioritise NA and EU based on patient criticality and contract obligations; accept 14% shortfall in remaining markets.',
    ctaLabel: 'View Allocation Scenarios',
    deepDive: {
      title: 'ONK-001 (Lumexia IV) — Q3 Supply Allocation Analysis',
      description: `The Ireland CMO batch for Lumexia IV is running 2 weeks behind schedule, reducing available Q3 supply by approximately 14% across the portfolio. Five markets (NA, EU-West, EU-East, APAC, LATAM) have submitted demand that cannot all be fulfilled from the current confirmed batch. A binding allocation decision is required by Thursday 10 July to trigger downstream 3PL and distributor workflows.`,
      reasoning: `North America (340 patients, contract SLA 98.5%) and EU-West (contractual obligation, highest margin) are the clear prioritisation tier: combined they represent 72% of revenue and carry the highest regulatory and reputational risk if under-served. EU-East, APAC, and LATAM have longer days-of-supply buffers (6–9 weeks on-hand) and lower contractual penalties for short supply, making them the absorption markets for this cycle's shortfall.`,
      options: [
        {
          label: 'Option A — Prioritise NA + EU (Recommended)',
          outcome: 'NA and EU-West fully covered. 14% shortfall accepted across EU-East, APAC, LATAM.',
          revenueProtected: '$6.2M (91%)',
          serviceLevel: '98.5% in priority markets',
          risk: 'Low — absorption markets retain 6+ wks cover',
          tradeoff: 'APAC distributor may escalate; LATAM misses Q3 launch window by ~3 weeks.',
        },
        {
          label: 'Option B — Even distribution across all 5 markets',
          outcome: 'All markets receive 86% of requested volume. No market fully covered.',
          revenueProtected: '$5.8M (86%)',
          serviceLevel: '86% across portfolio',
          risk: 'Medium — breaches NA contract SLA; regulatory risk in EU-West.',
          tradeoff: 'Avoids distributor escalation short-term but triggers penalty clauses in NA and EU contracts.',
        },
        {
          label: 'Option C — Hold allocation, await emergency CMO slot',
          outcome: 'No allocation committed. Request emergency slot at secondary CMO.',
          revenueProtected: 'TBD — slot confirmation takes 5–7 days',
          serviceLevel: 'At risk across all markets',
          risk: 'High — secondary CMO has 60% probability of confirming; adds $2.1M in expedite costs.',
          tradeoff: 'Could avoid all shortfall if slot confirmed, but carries substantial probability of worse outcome.',
        },
      ],
    },
  },
  {
    id: 'd2', bu: 'Rare Disease', regions: ['North America'], priority: 'amber',
    tag: 'Budget Authorization', due: 'Due Mon 14 Jul',
    issue: 'Safety stock build for RAR-001 (Helivex Plasma) ahead of CMO-3 shutdown exceeds NWC budget by $12M — order deadline in 6 days',
    revenueAtRisk: 14.5e6, patientsAtRisk: null, skusAffected: 2, marketsAffected: 4,
    agentRec: 'Approve $12M incremental inventory build by 14 Jul to maintain 97% service level — cost of inaction: $14.5M revenue at risk.',
    ctaLabel: 'View Build Plan',
    deepDive: {
      title: 'RAR-001 (Helivex Plasma) — CMO-3 Shutdown Safety Stock Build Plan',
      description: `CMO-3 (primary manufacturer for Helivex Plasma) enters a planned 14-week GMP maintenance shutdown on 28 July. Current on-hand inventory of 4.8 weeks of cover is insufficient to bridge the shutdown period without stockouts across NA, EU, APAC, and LATAM. The MEIO model recommends a pre-build to 18.6 weeks of cover requiring $12M incremental NWC above the approved budget. Purchase order must be placed by 14 July to meet CMO fill slot deadline.`,
      reasoning: `Helivex Plasma serves a rare bleeding disorder patient population with no therapeutic substitute. A stockout carries direct patient safety risk and will trigger regulatory notifications in NA and EU. The $12M working capital cost compares favourably against $14.5M in revenue at risk and potential penalty payments under patient-access commitments. The build plan is structured in two tranches to allow partial approval if full budget cannot be released in one cycle.`,
      options: [
        {
          label: 'Option A — Full build: 18.6 weeks cover (Recommended)',
          outcome: 'Full bridge through CMO-3 shutdown with 2-week safety buffer.',
          revenueProtected: '$14.5M (100%)',
          serviceLevel: '97.0% across all markets',
          risk: 'Low — full patient continuity maintained',
          tradeoff: '$12M incremental NWC; cash released post-restart in Q4. Opportunity cost vs. alternative deployment.',
        },
        {
          label: 'Option B — Partial build: 14 weeks cover',
          outcome: 'Covers shutdown period with zero buffer. No safety margin.',
          revenueProtected: '$10.9M (75%)',
          serviceLevel: '92.4% — below Class A floor of 97%',
          risk: 'Medium-High — any demand spike or CMO restart delay triggers immediate stockout.',
          tradeoff: '$6M NWC outlay; saves $6M cash but materially raises patient safety exposure.',
        },
        {
          label: 'Option C — No build, manage through demand rationing',
          outcome: 'Accept stockout from week 10 of shutdown onwards.',
          revenueProtected: '$0 (markets go on allocation)',
          serviceLevel: '<80% during shutdown period',
          risk: 'Very High — patient safety events, regulatory escalation, contract penalties.',
          tradeoff: 'Saves $12M NWC but incurs $14.5M+ revenue impact and reputational cost that far exceeds savings.',
        },
      ],
    },
  },
  {
    id: 'd3', bu: 'Immunology', regions: ['Asia Pacific', 'Latin America'], priority: 'red',
    tag: 'Supply Allocation', due: 'Due Wed 9 Jul',
    issue: 'IMM-003 (Prostakin Tabs) stockout imminent in APAC — 10 days coverage remaining, no replenishment scheduled',
    revenueAtRisk: 3.4e6, patientsAtRisk: 180, skusAffected: 1, marketsAffected: 3,
    agentRec: 'Expedite air freight from EU hub — adds $0.4M freight cost vs $3.4M revenue impact avoided.',
    ctaLabel: 'View Expedite Options',
    deepDive: {
      title: 'IMM-003 (Prostakin Tabs) — APAC Stockout Expedite Analysis',
      description: `Prostakin Tabs APAC inventory stands at 1.4 weeks of cover (10 days) following an unplanned demand surge of +32% vs. forecast in Korea and Australia. Standard sea freight replenishment from the EU hub takes 24–28 days. No scheduled replenishment order is in place. Without intervention, stockout will occur by 18 July across 3 APAC markets (Korea, Australia, Singapore), affecting 180 patients on active therapy. An emergency expedite decision is required before 9 July to meet minimum logistics lead times.`,
      reasoning: `Air freight from the EU hub (Amsterdam) is the only option that arrives within the 10-day window. The EU hub holds 8.4 weeks of cover — releasing 4 weeks to APAC does not endanger EU supply continuity. The $0.4M air freight premium is 11.8% of the $3.4M revenue at risk, representing a straightforward cost-benefit case. Partial expedite covers the immediate breach but requires a follow-on sea freight order to rebuild APAC cover to policy levels.`,
      options: [
        {
          label: 'Option A — Full air freight expedite from EU hub (Recommended)',
          outcome: '4 weeks of APAC supply airfreighted. ETA: 7 days. Stockout avoided.',
          revenueProtected: '$3.4M (100%)',
          serviceLevel: '97.8% maintained across APAC markets',
          risk: 'Low — EU hub remains at 4.4 wks cover, above Class B floor.',
          tradeoff: '$0.4M freight premium; follow-on sea freight order needed to rebuild EU buffer within 6 weeks.',
        },
        {
          label: 'Option B — Partial air freight (2 weeks supply)',
          outcome: 'Korea and Australia covered. Singapore goes on allocation for 12 days.',
          revenueProtected: '$2.4M (72%)',
          serviceLevel: '88% — below Class B floor',
          risk: 'Medium — Singapore stockout still occurs; distributor penalty likely.',
          tradeoff: '$0.2M freight premium. Saves $0.2M vs Option A but leaves $1.0M revenue and 40 patients uncovered.',
        },
        {
          label: 'Option C — Wait for scheduled sea freight',
          outcome: 'Replenishment arrives 24–28 days from order. Stockout for 14–18 days.',
          revenueProtected: '$0',
          serviceLevel: '<70% for 3 APAC markets during gap period',
          risk: 'Very High — 180 patients without therapy; distributor escalation; regulatory notification required.',
          tradeoff: 'Saves $0.4M freight cost but incurs $3.4M revenue loss, patient safety risk, and market confidence damage.',
        },
      ],
    },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
const RAG = {
  green: { bg: '#F0FDF4', border: '#86EFAC', text: '#15803D', dot: '#22C55E' },
  amber: { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309', dot: '#F59E0B' },
  red:   { bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C', dot: '#EF4444' },
};

const fmt$ = (v, d = 1) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(d)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(d)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(d)}K`;
  return `$${v.toFixed(0)}`;
};

function generateWeeks(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i) * 7);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  });
}
const WEEKS_26 = generateWeeks(26);

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER FUNCTION
───────────────────────────────────────────────────────────────────────────── */
function filterSKUs(filters) {
  return SKU_MASTER.filter(s => {
    if (filters.bu     !== 'All BU / Franchise' && s.bu       !== filters.bu)                 return false;
    if (filters.region !== 'All Regions'         && !s.regions.includes(filters.region))       return false;
    if (filters.class  !== 'All Classes'          && s.abcClass !== filters.class)              return false;
    if (filters.sku    !== 'All SKUs'             && s.id       !== filters.sku)               return false;
    return true;
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   METRIC COMPUTATIONS  (all derived from filtered SKU set)
───────────────────────────────────────────────────────────────────────────── */
function computeIPC(skus) {
  if (!skus.length) return { pct: 0, below: 0, inBand: 0, above: 0, rag: 'red' };
  const total  = skus.length;
  const below  = skus.filter(s => s.ipcStatus === 'below').length;
  const inBand = skus.filter(s => s.ipcStatus === 'in-band').length;
  const above  = skus.filter(s => s.ipcStatus === 'above').length;
  const pct    = Math.round((inBand / total) * 100);
  return {
    pct,
    below:  Math.round((below  / total) * 100),
    inBand: Math.round((inBand / total) * 100),
    above:  Math.round((above  / total) * 100),
    rag:    pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red',
  };
}

function computeOTIF(skus, mult) {
  if (!skus.length) return { current: 0, target: 97, prior: 0, rag: 'red' };
  const avg     = skus.reduce((s, k) => s + k.otif, 0) / skus.length;
  const current = +Math.min(99.9, avg * mult.otif).toFixed(1);
  const prior   = +(current + (mult.otif > 1 ? -1.6 : 1.6)).toFixed(1);
  const target  = 97;
  return { current, target, prior, rag: current >= target ? 'green' : current >= 93 ? 'amber' : 'red' };
}

function computeStockout(skus, mult) {
  const atRisk = skus
    .filter(s => s.stockoutProb > 0 && s.daysToBreach > 0)
    .sort((a, b) => b.stockoutAtRisk - a.stockoutAtRisk);

  const h = horizon => atRisk.filter(s => s.daysToBreach <= horizon);
  const sumRisk = arr => arr.reduce((s, k) => s + k.stockoutAtRisk * mult.stockout, 0);

  return {
    tiles: [
      { horizon: '30d', atRisk: sumRisk(h(30)), skus: h(30).length, intensity: '#FCA5A5' },
      { horizon: '60d', atRisk: sumRisk(h(60)), skus: h(60).length, intensity: '#F87171' },
      { horizon: '90d', atRisk: sumRisk(h(90)), skus: h(90).length, intensity: '#DC2626' },
    ],
    watchlist: atRisk.slice(0, 8).map(s => ({
      name: `${s.id} · ${s.name}`,
      woc:  s.woc, daysToBreach: s.daysToBreach,
      prob: s.stockoutProb,
      atRisk: s.stockoutAtRisk * mult.stockout,
      rec:  s.stockoutRec ?? 'No action required this cycle',
    })),
  };
}

function computeEO(skus, mult) {
  const byBU = {};
  for (const s of skus) {
    const key = s.bu.replace('Rare Disease', 'Rare Dis.');
    if (!byBU[key]) byBU[key] = { bu: key, writeOff: 0, recoverable: 0 };
    byBU[key].writeOff    += s.eoWriteOff * mult.writeOff;
    byBU[key].recoverable += s.eoRecoverable;
  }
  return Object.values(byBU).filter(d => d.writeOff + d.recoverable > 0);
}

function computeInvValue(skus, mult) {
  const actual = skus.reduce((s, k) => s + k.invValue, 0) * mult.inv;
  const budget = actual * 0.947;
  const delta  = actual - budget;
  return {
    actual, budget, delta,
    rag: delta / budget > 0.08 ? 'red' : delta / budget > 0.03 ? 'amber' : 'green',
    attribution: [
      { driver: 'Demand forecast uplift — Q3',             impact: actual * 0.038 },
      { driver: 'Lead time buffer increase',               impact: actual * 0.024 },
      { driver: 'Excess inventory (above-band SKUs)',       impact: skus.filter(s => s.ipcStatus === 'above').reduce((s, k) => s + k.invValue * 0.14, 0) },
      { driver: 'Safety stock build (below-band SKUs)',     impact: -skus.filter(s => s.ipcStatus === 'below').reduce((s, k) => s + k.invValue * 0.06, 0) },
    ].filter(a => Math.abs(a.impact) > 100),
  };
}

function computeWriteOff(skus, mult) {
  const forecast = skus.reduce((s, k) => s + k.eoWriteOff, 0) * mult.writeOff * 1.8;
  const priorQ   = forecast * 0.73;
  return { forecast, priorQ, rag: forecast > priorQ * 1.15 ? 'red' : forecast > priorQ * 1.05 ? 'amber' : 'green' };
}

function computeTrends(skus, week) {
  const mult = WEEK_MULT[week] ?? WEEK_MULT['Current Week'];
  const baseOTIF = computeOTIF(skus, { otif: 1 }).current;
  const baseInv  = computeInvValue(skus, { inv: 1 }).actual / 1e6;
  const baseWO   = computeWriteOff(skus, { writeOff: 1 }).forecast / 1e6;

  // Deterministic trend: build 26-week history leading to current values
  const otif = WEEKS_26.map((w, i) => ({
    week: w,
    otif: +Math.max(85, Math.min(99.9,
      baseOTIF - (25 - i) * 0.04 + Math.sin(i * 0.48) * 1.4 + Math.cos(i * 0.31) * 0.7
    )).toFixed(1),
    target: 97,
  }));

  const inv = WEEKS_26.map((w, i) => ({
    week: w,
    actual: +Math.max(0,
      baseInv - (25 - i) * 0.6 + Math.sin(i * 0.29) * 3.1 + Math.cos(i * 0.19) * 1.6
    ).toFixed(1),
    budget: +(baseInv * 0.947 - (25 - i) * 0.05).toFixed(1),
  }));

  const wo = WEEKS_26.map((w, i) => ({
    week: w,
    forecast: +Math.max(0,
      baseWO - (25 - i) * 0.08 + Math.sin(i * 0.51) * 0.9 + Math.cos(i * 0.38) * 0.4
    ).toFixed(2),
  }));

  return { otif, inv, wo };
}

function filterDecisions(filters) {
  return DECISIONS_DATA.filter(d => {
    if (filters.bu     !== 'All BU / Franchise' && d.bu !== filters.bu)              return false;
    if (filters.region !== 'All Regions'         && !d.regions.includes(filters.region)) return false;
    return true;
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   UI PRIMITIVES
───────────────────────────────────────────────────────────────────────────── */
function Card({ children, className = '' }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>{children}</div>;
}
function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}
function RagDot({ rag }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: RAG[rag].dot, display: 'inline-block', marginRight: 5, flexShrink: 0 }} />;
}
const TICK_STYLE    = { fontSize: 9, fill: '#9CA3AF' };
const tickFmt4      = (v, i) => i % 4 === 0 ? v : '';

function EmptyState({ label }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-slate-400 italic">
      No data for current filter — {label}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER BAR
───────────────────────────────────────────────────────────────────────────── */
function FilterBar({ filters, setFilters }) {
  const sel = { padding: '5px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Filter</span>
      {[
        { k: 'bu',     opts: BU_OPTIONS     },
        { k: 'region', opts: REGION_OPTIONS },
        { k: 'class',  opts: CLASS_OPTIONS  },
        { k: 'sku',    opts: SKU_OPTIONS    },
        { k: 'week',   opts: WEEK_OPTIONS   },
      ].map(({ k, opts }) => (
        <select key={k} value={filters[k]} style={sel} onChange={e => {
          const val = e.target.value;
          setFilters(prev => ({ ...prev, [k]: val }));
        }}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
      {/* Active filter summary */}
      {Object.entries(filters).some(([k, v]) =>
        (k === 'bu' && v !== 'All BU / Franchise') || (k === 'region' && v !== 'All Regions') ||
        (k === 'class' && v !== 'All Classes') || (k === 'sku' && v !== 'All SKUs') || (k === 'week' && v !== 'Current Week')
      ) && (
        <button onClick={() => setFilters({ bu: 'All BU / Franchise', region: 'All Regions', class: 'All Classes', sku: 'All SKUs', week: 'Current Week' })}
          style={{ fontSize: 11, color: '#6366F1', background: '#EEF2FF', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   IPC CARD
───────────────────────────────────────────────────────────────────────────── */
function IPCCard({ ipc }) {
  const [hover, setHover] = useState(false);
  const pie = [
    { name: '% Below Min', value: ipc.below,  fill: '#EF4444' },
    { name: '% In-Band',   value: ipc.inBand, fill: '#22C55E' },
    { name: '% Above Max', value: ipc.above,  fill: '#F59E0B' },
  ];
  return (
    <Card className="relative flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Inventory Policy Compliance</div>
          <div className="text-[10px] text-slate-400 mt-0.5">% SKUs within MEIO optimised min/max band</div>
        </div>
        <div style={{ padding: '2px 8px', borderRadius: 20, background: RAG[ipc.rag].bg, border: `1px solid ${RAG[ipc.rag].border}` }}>
          <span style={{ color: RAG[ipc.rag].text, fontSize: 10, fontWeight: 700 }}>{ipc.rag.toUpperCase()}</span>
        </div>
      </div>
      <div className="flex items-end gap-3 mt-1" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="text-4xl font-black" style={{ color: RAG[ipc.rag].text }}>{ipc.pct}%</div>
        <div className="mb-1 text-[11px] text-slate-500 leading-snug">in-policy<br /><span className="text-slate-400">hover for breakdown</span></div>
      </div>
      {hover && (
        <div className="absolute left-0 top-full mt-2 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-4" style={{ width: 230 }}>
          <div className="text-[11px] font-semibold text-slate-600 mb-2">SKU Distribution</div>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={pie} cx="50%" cy="50%" outerRadius={50} dataKey="value" label={({ value }) => `${value}%`} labelLine={false} fontSize={9}>
                {pie.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={v => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          {pie.map(d => (
            <div key={d.name} className="flex items-center gap-2 text-[10px] text-slate-600 mt-0.5">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.fill, display: 'inline-block' }} />
              {d.name}: <strong>{d.value}%</strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   OTIF CARD
───────────────────────────────────────────────────────────────────────────── */
function OTIFCard({ otif }) {
  const delta = otif.current - otif.prior;
  return (
    <Card className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">OTIF <span className="normal-case font-normal text-slate-400">— On Time In Full</span></div>
      <div className="flex items-end gap-3 mt-1">
        <div className="text-4xl font-black" style={{ color: RAG[otif.rag].text }}>{otif.current}%</div>
        <div className="mb-1 flex flex-col gap-0.5">
          <div className="text-[10px] text-slate-500">Target: <strong>{otif.target}%</strong></div>
          <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: delta >= 0 ? '#15803D' : '#B91C1C' }}>
            {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(delta).toFixed(1)}pp vs. last period
          </div>
        </div>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div style={{ width: `${otif.current}%`, background: RAG[otif.rag].dot }} className="h-full rounded-full" />
      </div>
      <div className="flex justify-between text-[9px] text-slate-400"><span>0%</span><span>Target {otif.target}%</span><span>100%</span></div>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STOCK-OUT CARD
───────────────────────────────────────────────────────────────────────────── */
function StockOutCard({ data }) {
  const [open, setOpen] = useState(null);
  const rowRag = p => p >= 70 ? 'red' : p >= 40 ? 'amber' : 'green';
  const empty  = data.tiles.every(t => t.skus === 0);
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Future Stock-Out Exposure</div>
        <div className="text-[10px] text-slate-400 mt-0.5">Revenue impact at risk by time horizon — click a tile to view affected SKUs</div>
      </div>
      {empty ? <EmptyState label="no at-risk SKUs in this filter" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {data.tiles.map(d => (
              <button key={d.horizon} onClick={() => setOpen(open === d.horizon ? null : d.horizon)}
                style={{ background: open === d.horizon ? d.intensity : '#FFF5F5', border: `1.5px solid ${d.intensity}`, borderRadius: 10, padding: '10px 8px', cursor: 'pointer', textAlign: 'left' }}>
                <div className="text-[10px] font-bold text-slate-600">{d.horizon}</div>
                <div className="text-lg font-black mt-0.5" style={{ color: open === d.horizon ? '#fff' : '#B91C1C' }}>{d.atRisk > 0 ? fmt$(d.atRisk) : '—'}</div>
                <div className="text-[9px] mt-0.5" style={{ color: open === d.horizon ? '#fecaca' : '#9CA3AF' }}>{d.skus} SKUs flagged</div>
              </button>
            ))}
          </div>
          {open && (
            <div className="mt-1 border border-red-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between bg-red-50 px-3 py-2">
                <span className="text-[11px] font-bold text-red-800">Priority Watch List — {open} horizon</span>
                <button onClick={() => setOpen(null)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-left">
                    {['SKU', 'WoC', 'Days to Breach', 'Stockout Prob.', '$ At Risk', 'Agent Recommendation'].map(h => (
                      <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.watchlist.filter(s => s.daysToBreach <= parseInt(open)).map((s, i) => {
                    const rag = rowRag(s.prob);
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-700">{s.name}</td>
                        <td className="px-3 py-2" style={{ color: s.woc < 3 ? '#B91C1C' : '#15803D', fontWeight: 700 }}>{s.woc}w</td>
                        <td className="px-3 py-2 text-slate-600">{s.daysToBreach}d</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5"><RagDot rag={rag} /><span style={{ color: RAG[rag].text, fontWeight: 700 }}>{s.prob}%</span></div>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-700">{fmt$(s.atRisk)}</td>
                        <td className="px-3 py-2 text-slate-500 italic" style={{ maxWidth: 220 }}>{s.rec}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   E&O CARD
───────────────────────────────────────────────────────────────────────────── */
function EOCard({ data }) {
  const totalWO  = data.reduce((s, d) => s + d.writeOff, 0);
  const totalRec = data.reduce((s, d) => s + d.recoverable, 0);
  const maxBar   = Math.max(...data.map(d => d.writeOff + d.recoverable), 1);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Excess &amp; Obsolescence Exposure</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Inventory value at risk of write-off vs. recoverable excess</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400">Total exposure</div>
          <div className="text-base font-black text-red-700">{fmt$(totalWO + totalRec)}</div>
        </div>
      </div>
      {data.length === 0 ? <EmptyState label="no E&O in this filter" /> : (
        <>
          <div className="flex items-center gap-4 text-[10px] text-slate-500">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: '#EF4444', borderRadius: 2, display: 'inline-block' }} /><span className="font-semibold">Write-off risk</span></div>
              <div className="text-slate-400 pl-4">Stock expiring within 30 days with no viable redeployment — likely to be written off.</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: '#FCD34D', borderRadius: 2, display: 'inline-block' }} /><span className="font-semibold">Recoverable excess</span></div>
              <div className="text-slate-400 pl-4">Above-target stock that can be redeployed or returned before expiry — not yet a write-off.</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {data.map(d => (
              <div key={d.bu} className="flex items-center gap-2">
                <div className="text-[10px] font-semibold text-slate-600 w-20 shrink-0">{d.bu}</div>
                <div className="flex-1 h-5 flex rounded overflow-hidden gap-px">
                  <div style={{ width: `${(d.writeOff / maxBar) * 100}%`, background: '#EF4444', minWidth: d.writeOff > 0 ? 2 : 0 }} />
                  <div style={{ width: `${(d.recoverable / maxBar) * 100}%`, background: '#FCD34D', minWidth: d.recoverable > 0 ? 2 : 0 }} />
                </div>
                <div className="text-[10px] text-slate-500 w-12 text-right shrink-0">{fmt$(d.writeOff + d.recoverable)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-6 pt-1 border-t border-slate-100 text-[10px]">
            <div><span className="text-slate-400">Write-off at risk:</span> <strong className="text-red-700">{fmt$(totalWO)}</strong></div>
            <div><span className="text-slate-400">Recoverable:</span> <strong className="text-amber-600">{fmt$(totalRec)}</strong></div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   INVENTORY VALUE CARD
───────────────────────────────────────────────────────────────────────────── */
function InvValueCard({ inv }) {
  const [showAttr, setShowAttr] = useState(false);
  const sign = inv.delta >= 0 ? '+' : '';
  return (
    <Card className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Inventory Value</div>
      <div className="text-[10px] text-slate-400">Actual vs. budget with variance attribution</div>
      <div className="flex items-end gap-3 mt-1">
        <div className="text-3xl font-black text-slate-800">{fmt$(inv.actual)}</div>
        <div className="mb-1 flex flex-col gap-0.5">
          <div className="text-[10px] text-slate-500">Budget: {fmt$(inv.budget)}</div>
          <div className="text-[11px] font-bold" style={{ color: RAG[inv.rag].text }}>{sign}{fmt$(inv.delta)} vs. budget</div>
        </div>
      </div>
      <button onClick={() => setShowAttr(v => !v)} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold w-fit">
        <Info size={11} /> {showAttr ? 'Hide' : 'Show'} variance attribution
      </button>
      {showAttr && (
        <div className="mt-1 border border-slate-100 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-600 border-b border-slate-100">Why the variance?</div>
          {inv.attribution.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-50 text-[10px]">
              <span className="text-slate-600">{a.driver}</span>
              <span className="font-bold" style={{ color: a.impact >= 0 ? '#B45309' : '#15803D' }}>{a.impact >= 0 ? '+' : ''}{fmt$(a.impact)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   WRITE-OFF CARD
───────────────────────────────────────────────────────────────────────────── */
function WriteOffCard({ wo }) {
  const delta = wo.forecast - wo.priorQ;
  return (
    <Card className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Write-Off Forecast</div>
      <div className="text-[10px] text-slate-400">Projected E&amp;O P&amp;L impact this quarter</div>
      <div className="flex items-end gap-3 mt-1">
        <div className="text-3xl font-black" style={{ color: wo.forecast > 0 ? RAG[wo.rag].text : '#94A3B8' }}>
          {wo.forecast > 0 ? fmt$(wo.forecast) : '$0'}
        </div>
        {wo.priorQ > 0 && (
          <div className="mb-1 flex flex-col gap-0.5">
            <div className="text-[10px] text-slate-400">Prior Q: {fmt$(wo.priorQ)}</div>
            <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: RAG[wo.rag].text }}>
              {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {delta >= 0 ? '+' : ''}{fmt$(Math.abs(delta))} vs. last quarter
            </div>
          </div>
        )}
      </div>
      {wo.forecast > 0 && (
        <div style={{ padding: '4px 10px', borderRadius: 20, background: RAG[wo.rag].bg, border: `1px solid ${RAG[wo.rag].border}`, width: 'fit-content' }}>
          <span style={{ color: RAG[wo.rag].text }} className="text-[10px] font-bold">⚠ P&L impact — escalated to Finance</span>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TREND CHARTS
───────────────────────────────────────────────────────────────────────────── */
function TrendSection({ trends }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="6-Month Performance Trends" subtitle="Rolling 26-week view — reflects current filter selection" />
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-[11px] font-semibold text-slate-600 mb-3">OTIF (%) — rolling 6m</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={trends.otif} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="week" tick={TICK_STYLE} tickFormatter={tickFmt4} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} domain={[85, 100]} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              <ReferenceLine y={97} stroke="#22C55E" strokeDasharray="4 2" label={{ value: 'Target', fontSize: 8, fill: '#22C55E' }} />
              <Line type="monotone" dataKey="otif" stroke="#F59E0B" strokeWidth={2} dot={false} name="OTIF %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold text-slate-600 mb-3">Total Inventory ($M) — vs. budget</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={trends.inv} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="week" tick={TICK_STYLE} tickFormatter={tickFmt4} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => `$${v}M`} />
              <Line type="monotone" dataKey="actual" stroke="#6366F1" strokeWidth={2} dot={false} name="Actual ($M)" />
              <Line type="monotone" dataKey="budget" stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Budget ($M)" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1 text-[9px] text-slate-400">
            <span className="flex items-center gap-1"><span style={{ width: 14, height: 2, background: '#6366F1', display: 'inline-block' }} />Actual</span>
            <span className="flex items-center gap-1"><span style={{ width: 14, height: 2, background: '#D1D5DB', display: 'inline-block' }} />Budget</span>
          </div>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold text-slate-600 mb-3">Write-Off Forecast ($M) — P&amp;L impact</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={trends.wo} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="week" tick={TICK_STYLE} tickFormatter={tickFmt4} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => `$${v}M`} />
              <Line type="monotone" dataKey="forecast" stroke="#EF4444" strokeWidth={2} dot={false} name="Write-off ($M)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEEP-DIVE MODAL
───────────────────────────────────────────────────────────────────────────── */
function DeepDiveModal({ d, onClose }) {
  const dd = d.deepDive;
  const rag = d.priority;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.22)', maxWidth: 760, width: '94%', maxHeight: '88vh', overflowY: 'auto', padding: '28px 32px' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ background: RAG[rag].dot, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{d.tag}</span>
              <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>{d.due}</span>
            </div>
            <h2 className="text-base font-bold text-slate-800 leading-snug">{dd.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#64748B', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px' }}>
            <div className="text-[10px] text-slate-400 mb-0.5">Revenue at risk</div>
            <div className="text-lg font-black text-red-700">{fmt$(d.revenueAtRisk)}</div>
          </div>
          {d.patientsAtRisk && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 14px' }}>
              <div className="text-[10px] text-slate-400 mb-0.5">Patients at risk</div>
              <div className="text-lg font-black text-orange-700">{d.patientsAtRisk.toLocaleString()}</div>
            </div>
          )}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px' }}>
            <div className="text-[10px] text-slate-400 mb-0.5">Markets affected</div>
            <div className="text-lg font-black text-slate-700">{d.marketsAffected}</div>
          </div>
        </div>

        {/* Situation */}
        <div className="mb-5">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Situation</div>
          <p className="text-[12px] text-slate-700 leading-relaxed">{dd.description}</p>
        </div>

        {/* Reasoning */}
        <div className="mb-5">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Agent Reasoning</div>
          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: '12px 16px' }}>
            <p className="text-[12px] text-indigo-900 leading-relaxed italic">{dd.reasoning}</p>
          </div>
        </div>

        {/* Options */}
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Options &amp; Trade-offs</div>
          <div className="flex flex-col gap-3">
            {dd.options.map((opt, i) => {
              const isRec = i === 0;
              return (
                <div key={i} style={{ border: isRec ? '1.5px solid #6366F1' : '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', background: isRec ? '#FAFAFF' : '#FAFAFA' }}>
                  <div className="flex items-center gap-2 mb-2">
                    {isRec && <span style={{ background: '#6366F1', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 9, fontWeight: 800 }}>RECOMMENDED</span>}
                    <span className="text-[12px] font-bold text-slate-800">{opt.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2">{opt.outcome}</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div className="text-[10px]"><span className="text-slate-400">Revenue protected: </span><strong className="text-slate-700">{opt.revenueProtected}</strong></div>
                    <div className="text-[10px]"><span className="text-slate-400">Service level: </span><strong className="text-slate-700">{opt.serviceLevel}</strong></div>
                    <div className="text-[10px]"><span className="text-slate-400">Risk: </span><strong style={{ color: i === 0 ? '#15803D' : i === 1 ? '#B45309' : '#B91C1C' }}>{opt.risk}</strong></div>
                    <div className="text-[10px]"><span className="text-slate-400">Trade-off: </span><span className="text-slate-600 italic">{opt.tradeoff}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-center">
          For informational purposes only — no action is taken from this view.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DECISIONS SECTION
───────────────────────────────────────────────────────────────────────────── */
function DecisionCard({ d }) {
  const [showModal, setShowModal] = useState(false);
  const rag = d.priority;
  return (
    <>
      {showModal && <DeepDiveModal d={d} onClose={() => setShowModal(false)} />}
      <div style={{ border: `1.5px solid ${RAG[rag].border}`, borderRadius: 12, background: RAG[rag].bg, padding: '14px 16px' }} className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{rag === 'red' ? '🔴' : '🟡'}</span>
            <span style={{ background: RAG[rag].dot, color: '#fff', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>{d.tag}</span>
            <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>{d.due}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[9px] text-slate-400">Revenue at risk</div>
              <div className="text-sm font-black" style={{ color: RAG[rag].text }}>{fmt$(d.revenueAtRisk)}</div>
            </div>
            {d.patientsAtRisk && (
              <div className="text-right">
                <div className="text-[9px] text-slate-400">Patients</div>
                <div className="text-sm font-black text-red-700">{d.patientsAtRisk.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] font-semibold text-slate-700 leading-snug">{d.issue}</p>
        <div className="flex items-center gap-4 text-[10px] text-slate-400">
          <span>{d.skusAffected} SKU{d.skusAffected > 1 ? 's' : ''}</span>
          <span>{d.marketsAffected} markets</span>
          <span className="font-semibold text-slate-600">{d.bu} · {d.regions.join(', ')}</span>
        </div>
        <div className="flex items-start gap-2 bg-white bg-opacity-70 border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-[10px] font-bold text-indigo-600 shrink-0 mt-px">Agent</span>
          <p className="text-[10px] text-slate-600 leading-snug italic">{d.agentRec}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: RAG[rag].dot, color: '#fff', border: 'none', cursor: 'pointer', width: 'fit-content' }}>
          {d.ctaLabel}
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function OperationsDashboard() {
  const [filters, setFilters] = useState({
    bu: 'All BU / Franchise', region: 'All Regions',
    class: 'All Classes', sku: 'All SKUs', week: 'Current Week',
  });

  // Derive all data from the filtered SKU set + week multiplier
  const skus  = useMemo(() => filterSKUs(filters), [filters]);
  const mult  = WEEK_MULT[filters.week] ?? WEEK_MULT['Current Week'];

  const ipc       = useMemo(() => computeIPC(skus),               [skus]);
  const otif      = useMemo(() => computeOTIF(skus, mult),         [skus, mult]);
  const stockout  = useMemo(() => computeStockout(skus, mult),     [skus, mult]);
  const eoData    = useMemo(() => computeEO(skus, mult),           [skus, mult]);
  const inv       = useMemo(() => computeInvValue(skus, mult),     [skus, mult]);
  const wo        = useMemo(() => computeWriteOff(skus, mult),     [skus, mult]);
  const trends    = useMemo(() => computeTrends(skus, filters.week), [skus, filters.week]);
  const decisions = useMemo(() => filterDecisions(filters),        [filters]);

  const skuCount = skus.length;
  const activeFilterLabel = [
    filters.bu     !== 'All BU / Franchise' && filters.bu,
    filters.region !== 'All Regions'         && filters.region,
    filters.class  !== 'All Classes'          && filters.class,
    filters.sku    !== 'All SKUs'             && filters.sku,
    filters.week   !== 'Current Week'         && filters.week,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-5">

      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <h1 className="text-base font-bold text-slate-800">Ops Review — Executive Dashboard</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Inventory health and financial performance for leadership S&amp;OP review · Updated weekly
          {activeFilterLabel && <span className="ml-2 text-indigo-500 font-semibold">· Filtered: {activeFilterLabel} ({skuCount} SKU{skuCount !== 1 ? 's' : ''})</span>}
        </p>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} setFilters={setFilters} />

      {skuCount === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-12 text-center">
          <p className="text-sm font-semibold text-slate-400">No SKUs match the current filter combination.</p>
          <button onClick={() => setFilters({ bu: 'All BU / Franchise', region: 'All Regions', class: 'All Classes', sku: 'All SKUs', week: 'Current Week' })}
            className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Clear filters</button>
        </div>
      ) : (
        <>
          {/* Inventory Health */}
          <SectionHeader title="Inventory Health" subtitle="Key indicators of stock availability, policy compliance, and forward-looking risk" />
          <div className="grid grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <IPCCard ipc={ipc} />
              <OTIFCard otif={otif} />
            </div>
            <EOCard data={eoData} />
          </div>
          <StockOutCard data={stockout} />

          {/* Financial Impact */}
          <SectionHeader title="Financial Impact" subtitle="Inventory value, budget variance, and write-off exposure" />
          <div className="grid grid-cols-2 gap-4">
            <InvValueCard inv={inv} />
            <WriteOffCard wo={wo} />
          </div>

          {/* Trends */}
          <TrendSection trends={trends} />

          {/* Decisions */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Decisions Required</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Actions requiring executive authorisation — ranked by business impact</p>
              </div>
              {decisions.length > 0 && (
                <span style={{ padding: '2px 10px', borderRadius: 20, background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: 10, fontWeight: 700, color: '#B91C1C' }}>
                  {decisions.length} open
                </span>
              )}
            </div>
            {decisions.length === 0
              ? <EmptyState label="no decisions for this filter" />
              : decisions.map(d => <DecisionCard key={d.id} d={d} />)
            }
          </div>
        </>
      )}
    </div>
  );
}
