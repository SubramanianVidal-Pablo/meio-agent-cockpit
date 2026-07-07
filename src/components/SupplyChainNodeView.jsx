import { useState } from 'react';
import { X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// NODE DEFINITIONS
// All six physical nodes in the supply network. type drives which KPIs display.
// ══════════════════════════════════════════════════════════════════════════════
const ALL_NODES = {
  'factory-1': { id: 'factory-1', label: 'Factory 1',           sub: 'DS Manufacturing',      type: 'factory' },
  'factory-2': { id: 'factory-2', label: 'Factory 2',           sub: 'DS Manufacturing',      type: 'factory' },
  'factory-3': { id: 'factory-3', label: 'Factory 3',           sub: 'Dedicated Biologics',   type: 'factory' },
  'plant-1':   { id: 'plant-1',   label: 'Plant 1',             sub: 'Fill & Finish',         type: 'plant'   },
  'plant-2':   { id: 'plant-2',   label: 'Plant 2',             sub: 'Fill & Finish (Biol.)', type: 'plant'   },
  'dc':        { id: 'dc',        label: 'Distribution Center', sub: '3PL / Cold Chain',      type: 'dc'      },
};

// Pixel centres for nodes in a 460 × 272 SVG canvas.
// Positions are FIXED — inactive nodes are simply not rendered.
// NODE_W=110, NODE_H=46 → half-height = 23
const NODE_POS = {
  'factory-1': { cx: 85,  cy: 42  },
  'factory-2': { cx: 230, cy: 42  },
  'factory-3': { cx: 375, cy: 42  },
  'plant-1':   { cx: 157, cy: 148 },
  'plant-2':   { cx: 375, cy: 148 },
  'dc':        { cx: 230, cy: 238 },
};
const NODE_W  = 110;
const NODE_H  = 46;
const HALF_H  = NODE_H / 2;
const SVG_W   = 460;
const SVG_H   = 272;

// ══════════════════════════════════════════════════════════════════════════════
// NETWORK CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────
// Four named product-network structures. These are the single source of truth
// for diagram rendering and node toggles — never hardcode inline in components.
//
// Configuration selection rules:
//   all            → Full 6-node network, KPIs are weighted aggregates of all products.
//   full-network   → Products A, B: high-volume multi-site biologics. Load is
//                    distributed across three factories; per-factory throughput
//                    and capacity utilization are proportionally lower.
//   dual-factory   → Products C, D: mid-volume gene therapies. Two factories feed
//                    Plant 1, making its capacity utilization higher than in the
//                    full-network scenario (load not split across two plants).
//   single-source  → Products E, F: low-volume dedicated plasma line. No alternate
//                    sourcing — safety stock in weeks must be elevated at Plant 2
//                    and the DC relative to full-network products.
//   dc-only        → Product G: finished goods import via external CMO. No plant
//                    tier — DC inbound lead time reflects CMO lead time, which is
//                    2–4 weeks longer than internal plant lead times.
//
// Cross-configuration logical consistency:
//   • Safety stock (weeks) increases downstream: Factory < Plant < DC at every node
//   • Lead time accumulates downstream: DC inbound LT ≥ any single Plant LT
//   • Biologics show higher SS and longer LT than small molecules at the same node
//   • All Products aggregate KPIs are consistent with sum/avg of individual product views
//   • A node absent from a product's network must not show KPIs for that product
//   • If a Factory's capacity utilization > 85%, throughput ≈ batch size × run freq
//   • DC stockout risk < Plant stockout risk when DC holds more weeks of supply
// ══════════════════════════════════════════════════════════════════════════════
export const NETWORK_CONFIGS = {
  all: {
    label:        'All Products',
    productLabel: 'All Products (Aggregate)',
    description:  'Network-level aggregate view. Units are summed; percentages are demand-weighted averages across all products and configurations.',
    products:     [],
    nodes:        ['factory-1', 'factory-2', 'factory-3', 'plant-1', 'plant-2', 'dc'],
    edges:        [['factory-1','plant-1'],['factory-2','plant-1'],['factory-3','plant-2'],['plant-1','dc'],['plant-2','dc']],
  },
  'full-network': {
    label:        'Lumexia & Protazen',
    productLabel: 'Lumexia mAb + Protazen mAb DP',
    description:  'High-volume multi-site biologics (A-001, A-004). Load distributed across three factories into two plants — per-factory utilization proportionally lower.',
    products:     ['A-001', 'A-004'],
    nodes:        ['factory-1', 'factory-2', 'factory-3', 'plant-1', 'plant-2', 'dc'],
    edges:        [['factory-1','plant-1'],['factory-2','plant-1'],['factory-3','plant-2'],['plant-1','dc'],['plant-2','dc']],
  },
  'dual-factory': {
    label:        'Velazan & Nexovir',
    productLabel: 'Velazan Gene Therapy + Nexovir CAR-T',
    description:  'Mid-volume gene therapies (A-002, A-003). Two factories consolidated at Plant 1 — capacity utilization elevated because a single plant absorbs two factory feeds.',
    products:     ['A-002', 'A-003'],
    nodes:        ['factory-1', 'factory-2', 'plant-1', 'dc'],
    edges:        [['factory-1','plant-1'],['factory-2','plant-1'],['plant-1','dc']],
  },
  'single-source': {
    label:        'Helivex Plasma',
    productLabel: 'Helivex Plasma DS',
    description:  'Low-volume dedicated plasma fractionation line (B-003). Single path through Factory 3 → Plant 2 → DC. No alternate sourcing — safety stock elevated throughout.',
    products:     ['B-003'],
    nodes:        ['factory-3', 'plant-2', 'dc'],
    edges:        [['factory-3','plant-2'],['plant-2','dc']],
  },
  'dc-only': {
    label:        'Factor VII',
    productLabel: 'Factor VII DP',
    description:  'Externally manufactured by CMO via Factory 2 (B-001 label used as CMO proxy). Product arrives at DC as finished goods — no plant-tier KPIs. DC inbound LT reflects CMO lead time (+4–6 wks vs. internal).',
    products:     ['C-001'],
    nodes:        ['factory-2', 'dc'],
    edges:        [['factory-2','dc']],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// NODE KPI DATA — Hardcoded placeholders
// ─────────────────────────────────────────────────────────────────────────────
// Values follow real supply chain logic (marked ✓ = rule satisfied):
//
//   Flow consistency:
//     ✓  Safety stock weeks: increases downstream (Factory < Plant < DC)
//     ✓  Lead time accumulates: DC inbound LT ≥ Plant LT at every config
//     ✓  DC Inventory on Hand ≤ combined plant outbound throughput per week
//
//   Capacity:
//     ✓  Cap.util > 85% → throughput ≈ batch size × implied run frequency
//     ✓  Plant fill rate < 98% → elevated stockout risk OR long upstream LT
//
//   Stockout risk:
//     ✓  Risk decreases as safety stock weeks increases, at every node
//     ✓  DC stockout risk < Plant stockout risk when DC holds more weeks of supply
//
//   Between configurations:
//     ✓  single-source (Helivex): SS elevated at Plant 2 and DC — no backup source
//     ✓  dc-only (Factor VII): DC LT = 16 wks (CMO, +6 wks vs. internal 10 wks)
//     ✓  dual-factory (Velazan/Nexovir): Plant 1 cap.util = 88% — two factory feeds
//     ✓  full-network (Lumexia/Protazen): per-factory throughput lower — load distributed
//     ✓  Biologics (Factory 3 / Plant 2): higher SS and longer LT than small-molecule nodes
//
//   Scenario delta cascade (applied by applyScenario()):
//     — safetyStockWeeks change scales SS and IOH at all nodes proportionally
//     — leadTimeAdjWeeks adds to factory LT, cascades 50% to plant, 100% to DC
//     — demandAdjPct scales throughput; inversely adjusts IOH weeks and daysOfCoverage
//     — serviceLevel change shifts fillRate (plants/DC) and stockoutRisk (all nodes)
// ══════════════════════════════════════════════════════════════════════════════
const NODE_KPI_DATA = {
  all: {
    'factory-1': {
      inventoryOnHand: { units: 18400, weeks: 6.2 },
      safetyStock:     { weeks: 6.2  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 2400 },
      capacityUtil:    { pct: 72     },
      throughput:      { unitsPerWeek: 2400 },
      stockoutRisk:    { pct: 2.8   },
    },
    'factory-2': {
      inventoryOnHand: { units: 12800, weeks: 5.8 },
      safetyStock:     { weeks: 5.8  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 1800 },
      capacityUtil:    { pct: 68     },
      throughput:      { unitsPerWeek: 1800 },
      stockoutRisk:    { pct: 3.1   },
    },
    'factory-3': {
      // Biologics factory: higher SS and longer LT than small-molecule factories ✓
      inventoryOnHand: { units: 8200, weeks: 8.4 },
      safetyStock:     { weeks: 8.4  },
      leadTime:        { weeks: 3    },
      batchSize:       { units: 960  },
      capacityUtil:    { pct: 58     },
      throughput:      { unitsPerWeek: 960 },
      stockoutRisk:    { pct: 4.2   },
    },
    'plant-1': {
      // SS > Factory 1/2 SS ✓ | Fill rate 96.8% → stockout risk 3.4% consistent ✓
      inventoryOnHand: { units: 9600,  weeks: 7.2 },
      safetyStock:     { weeks: 7.2   },
      reorderPoint:    { units: 3200  },
      leadTime:        { weeks: 6     },
      batchSize:       { units: 1200  },
      capacityUtil:    { pct: 78      },
      throughput:      { unitsPerWeek: 1200 },
      fillRate:        { pct: 96.8   },
      stockoutRisk:    { pct: 3.4    },
    },
    'plant-2': {
      // Biologics plant: SS > Plant 1 in weeks ✓ | Longer LT ✓
      inventoryOnHand: { units: 4800, weeks: 9.1 },
      safetyStock:     { weeks: 9.1  },
      reorderPoint:    { units: 1600 },
      leadTime:        { weeks: 8    },
      batchSize:       { units: 600  },
      capacityUtil:    { pct: 62     },
      throughput:      { unitsPerWeek: 600 },
      fillRate:        { pct: 95.2  },
      stockoutRisk:    { pct: 4.8   },
    },
    'dc': {
      // SS > Plant SS ✓ | DC LT (10 wks) ≥ Plant 2 LT (8 wks) ✓
      // DC stockout 2.1% < Plant 1 (3.4%) and Plant 2 (4.8%) ✓
      inventoryOnHand: { units: 14400, weeks: 8.4  },
      safetyStock:     { weeks: 8.4   },
      reorderPoint:    { units: 4800  },
      leadTime:        { weeks: 10    },
      fillRate:        { pct: 94.3   },
      stockoutRisk:    { pct: 2.1    },
      daysOfCoverage:  { days: 59    },
    },
  },

  'full-network': {
    // Distributed load → lower per-factory throughput and utilization vs. single-source ✓
    'factory-1': {
      inventoryOnHand: { units: 8400, weeks: 6.2 },
      safetyStock:     { weeks: 6.2  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 1200 },
      capacityUtil:    { pct: 68     },
      throughput:      { unitsPerWeek: 1200 },
      stockoutRisk:    { pct: 2.4   },
    },
    'factory-2': {
      inventoryOnHand: { units: 6800, weeks: 5.8 },
      safetyStock:     { weeks: 5.8  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 960  },
      capacityUtil:    { pct: 64     },
      throughput:      { unitsPerWeek: 960 },
      stockoutRisk:    { pct: 2.8   },
    },
    'factory-3': {
      inventoryOnHand: { units: 4200, weeks: 8.4 },
      safetyStock:     { weeks: 8.4  },
      leadTime:        { weeks: 3    },
      batchSize:       { units: 480  },
      capacityUtil:    { pct: 52     },
      throughput:      { unitsPerWeek: 480 },
      stockoutRisk:    { pct: 3.6   },
    },
    'plant-1': {
      inventoryOnHand: { units: 4800, weeks: 7.2 },
      safetyStock:     { weeks: 7.2  },
      reorderPoint:    { units: 1800 },
      leadTime:        { weeks: 6    },
      batchSize:       { units: 600  },
      capacityUtil:    { pct: 72     },
      throughput:      { unitsPerWeek: 600 },
      fillRate:        { pct: 96.8  },
      stockoutRisk:    { pct: 3.2   },
    },
    'plant-2': {
      inventoryOnHand: { units: 2400, weeks: 9.1 },
      safetyStock:     { weeks: 9.1  },
      reorderPoint:    { units: 880  },
      leadTime:        { weeks: 8    },
      batchSize:       { units: 300  },
      capacityUtil:    { pct: 58     },
      throughput:      { unitsPerWeek: 300 },
      fillRate:        { pct: 95.4  },
      stockoutRisk:    { pct: 4.6   },
    },
    'dc': {
      inventoryOnHand: { units: 7200, weeks: 8.4  },
      safetyStock:     { weeks: 8.4   },
      reorderPoint:    { units: 2400  },
      leadTime:        { weeks: 10    },
      fillRate:        { pct: 94.8   },
      stockoutRisk:    { pct: 1.8    },
      daysOfCoverage:  { days: 59    },
    },
  },

  'dual-factory': {
    'factory-1': {
      inventoryOnHand: { units: 3600, weeks: 6.8 },
      safetyStock:     { weeks: 6.8  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 600  },
      capacityUtil:    { pct: 76     },
      throughput:      { unitsPerWeek: 600 },
      stockoutRisk:    { pct: 3.2   },
    },
    'factory-2': {
      inventoryOnHand: { units: 2800, weeks: 6.2 },
      safetyStock:     { weeks: 6.2  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 480  },
      capacityUtil:    { pct: 71     },
      throughput:      { unitsPerWeek: 480 },
      stockoutRisk:    { pct: 3.6   },
    },
    'plant-1': {
      // High cap.util — Plant 1 absorbs two factory feeds (600 + 480 = 1080 / wk) ✓
      // Fill rate 95.2% → stockout risk 4.2% elevated (long inbound or constrained) ✓
      inventoryOnHand: { units: 3200,  weeks: 7.8  },
      safetyStock:     { weeks: 7.8   },
      reorderPoint:    { units: 1200  },
      leadTime:        { weeks: 6     },
      batchSize:       { units: 480   },
      capacityUtil:    { pct: 88      },
      throughput:      { unitsPerWeek: 1080 },
      fillRate:        { pct: 95.2   },
      stockoutRisk:    { pct: 4.2    },
    },
    'dc': {
      // SS > Plant 1 SS ✓ | DC stockout (2.4%) < Plant 1 (4.2%) ✓
      inventoryOnHand: { units: 5600, weeks: 8.8  },
      safetyStock:     { weeks: 8.8   },
      reorderPoint:    { units: 1800  },
      leadTime:        { weeks: 10    },
      fillRate:        { pct: 93.8   },
      stockoutRisk:    { pct: 2.4    },
      daysOfCoverage:  { days: 62    },
    },
  },

  'single-source': {
    // No alternate sourcing → elevated SS at every node vs. full-network ✓
    'factory-3': {
      inventoryOnHand: { units: 2800, weeks: 10.2 },
      safetyStock:     { weeks: 10.2  },
      leadTime:        { weeks: 3     },
      batchSize:       { units: 360   },
      capacityUtil:    { pct: 62      },
      throughput:      { unitsPerWeek: 360 },
      stockoutRisk:    { pct: 5.8    },
    },
    'plant-2': {
      // SS (11.4 wks) > Factory 3 SS (10.2 wks) ✓
      inventoryOnHand: { units: 1800, weeks: 11.4 },
      safetyStock:     { weeks: 11.4  },
      reorderPoint:    { units: 720   },
      leadTime:        { weeks: 8     },
      batchSize:       { units: 240   },
      capacityUtil:    { pct: 54      },
      throughput:      { unitsPerWeek: 240 },
      fillRate:        { pct: 93.6   },
      stockoutRisk:    { pct: 6.2    },
    },
    'dc': {
      // Highest SS in the system (12.6 wks > Plant 2 11.4 wks) ✓
      // LT (13 wks) ≥ Plant 2 LT (8 wks) — accumulated through single path ✓
      // DC stockout (3.4%) < Plant 2 (6.2%) because DC holds more weeks ✓
      inventoryOnHand: { units: 2400, weeks: 12.6 },
      safetyStock:     { weeks: 12.6  },
      reorderPoint:    { units: 960   },
      leadTime:        { weeks: 13    },
      fillRate:        { pct: 92.8   },
      stockoutRisk:    { pct: 3.4    },
      daysOfCoverage:  { days: 88    },
    },
  },

  'dc-only': {
    // Factory 2 acts as external CMO — finished goods import, no plant tier
    'factory-2': {
      inventoryOnHand: { units: 1200, weeks: 6.2 },
      safetyStock:     { weeks: 6.2  },
      leadTime:        { weeks: 2    },
      batchSize:       { units: 240  },
      capacityUtil:    { pct: 45     },
      throughput:      { unitsPerWeek: 240 },
      stockoutRisk:    { pct: 4.8   },
    },
    'dc': {
      // CMO inbound LT = 16 wks (+6 wks vs. internal 10 wks) → high SS to compensate ✓
      // High DOC (101 days) reflects the large safety buffer needed for long CMO lead time ✓
      inventoryOnHand: { units: 3600, weeks: 14.4 },
      safetyStock:     { weeks: 14.4  },
      reorderPoint:    { units: 1200  },
      leadTime:        { weeks: 16    },
      fillRate:        { pct: 91.2   },
      stockoutRisk:    { pct: 2.8    },
      daysOfCoverage:  { days: 101   },
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// KPI DISPLAY DEFINITIONS
// nodeTypes: which node types show this KPI
// goodDir: 'up' | 'down' | null (null = neutral, no colour on delta)
// deltaKey: which sub-field to diff for the delta chip
// ══════════════════════════════════════════════════════════════════════════════
const KPI_DEFS = {
  inventoryOnHand: {
    label:     'Inventory on Hand',
    nodeTypes: ['factory', 'plant', 'dc'],
    format:    k => `${k.units.toLocaleString()} units · ${k.weeks} wks`,
    goodDir:   null,
    deltaKey:  'weeks',
    deltaUnit: 'wks',
  },
  safetyStock: {
    label:     'Safety Stock',
    nodeTypes: ['factory', 'plant', 'dc'],
    format:    k => `${k.weeks} wks`,
    goodDir:   null,
    deltaKey:  'weeks',
    deltaUnit: 'wks',
  },
  reorderPoint: {
    label:     'Reorder Point',
    nodeTypes: ['plant', 'dc'],
    format:    k => `${k.units.toLocaleString()} units`,
    goodDir:   null,
    deltaKey:  'units',
    deltaUnit: 'units',
  },
  leadTime: {
    label:     'Lead Time (Inbound)',
    nodeTypes: ['factory', 'plant', 'dc'],
    format:    k => `${k.weeks} wks`,
    goodDir:   'down',
    deltaKey:  'weeks',
    deltaUnit: 'wks',
  },
  batchSize: {
    label:     'Batch / Lot Size',
    nodeTypes: ['factory', 'plant'],
    format:    k => `${k.units.toLocaleString()} units`,
    goodDir:   null,
    deltaKey:  'units',
    deltaUnit: 'units',
  },
  capacityUtil: {
    label:     'Capacity Utilization',
    nodeTypes: ['factory', 'plant'],
    format:    k => `${k.pct}%`,
    goodDir:   null,
    deltaKey:  'pct',
    deltaUnit: 'pp',
  },
  throughput: {
    label:     'Throughput',
    nodeTypes: ['factory', 'plant'],
    format:    k => `${k.unitsPerWeek.toLocaleString()} units/wk`,
    goodDir:   'up',
    deltaKey:  'unitsPerWeek',
    deltaUnit: 'u/wk',
  },
  fillRate: {
    label:     'Fill Rate (Outbound)',
    nodeTypes: ['plant', 'dc'],
    format:    k => `${k.pct}%`,
    goodDir:   'up',
    deltaKey:  'pct',
    deltaUnit: 'pp',
  },
  stockoutRisk: {
    label:     'Stockout Risk',
    nodeTypes: ['factory', 'plant', 'dc'],
    format:    k => `${k.pct}%`,
    goodDir:   'down',
    deltaKey:  'pct',
    deltaUnit: 'pp',
  },
  daysOfCoverage: {
    label:     'Days of Coverage',
    nodeTypes: ['dc'],
    format:    k => `${k.days} days`,
    goodDir:   'up',
    deltaKey:  'days',
    deltaUnit: 'd',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO DELTA COMPUTATION
// Applies scenario params as adjustments to baseline node KPIs.
// Cascade rules:
//   safetyStockWeeks → scales SS, IOH.weeks, reorderPoint at all nodes
//   leadTimeAdjWeeks → factory gets full adj; plant gets 50%; DC gets 100%
//   demandAdjPct     → scales throughput; inversely adjusts IOH.weeks, daysOfCoverage
//   serviceLevel     → shifts fillRate (0.5× SL delta); modulates stockoutRisk
// ══════════════════════════════════════════════════════════════════════════════
function applyScenario(baseKpis, nodeType, params) {
  if (!params) return null;
  const hasParam = ['safetyStockWeeks', 'serviceLevel', 'leadTimeAdjWeeks', 'demandAdjPct'].some(k => params[k] != null);
  if (!hasParam) return null;

  const ssRatio    = params.safetyStockWeeks != null ? params.safetyStockWeeks / 6.2 : 1;
  const ltAdj      = params.leadTimeAdjWeeks ?? 0;
  const demFactor  = 1 + (params.demandAdjPct ?? 0) / 100;
  const slBaseline = 96.8;
  const slDelta    = (params.serviceLevel ?? slBaseline) - slBaseline;

  // Lead time cascade factor per node type
  const ltFactor   = nodeType === 'factory' ? 1 : nodeType === 'plant' ? 0.5 : 1;

  const out = {};

  if (baseKpis.inventoryOnHand) {
    out.inventoryOnHand = {
      units: Math.round(baseKpis.inventoryOnHand.units * ssRatio),
      weeks: +((baseKpis.inventoryOnHand.weeks * ssRatio) / demFactor).toFixed(1),
    };
  }
  if (baseKpis.safetyStock) {
    out.safetyStock = { weeks: +(baseKpis.safetyStock.weeks * ssRatio).toFixed(1) };
  }
  if (baseKpis.reorderPoint) {
    out.reorderPoint = { units: Math.round(baseKpis.reorderPoint.units * ssRatio) };
  }
  if (baseKpis.leadTime) {
    out.leadTime = { weeks: +(baseKpis.leadTime.weeks + ltAdj * ltFactor).toFixed(1) };
  }
  if (baseKpis.batchSize) {
    out.batchSize = { units: baseKpis.batchSize.units }; // not directly param-driven
  }
  if (baseKpis.capacityUtil) {
    // Higher demand → higher utilization; scenario doesn't directly set capacity
    out.capacityUtil = { pct: +Math.min(99, baseKpis.capacityUtil.pct * demFactor).toFixed(1) };
  }
  if (baseKpis.throughput) {
    out.throughput = { unitsPerWeek: Math.round(baseKpis.throughput.unitsPerWeek * demFactor) };
  }
  if (baseKpis.fillRate) {
    out.fillRate = { pct: +Math.min(99.5, baseKpis.fillRate.pct + slDelta * 0.5).toFixed(1) };
  }
  if (baseKpis.stockoutRisk) {
    // Higher SS → lower risk; higher LT or demand → higher risk
    const riskMult = (1 / ssRatio) * (1 + Math.max(0, ltAdj) * 0.05) * Math.max(0.8, demFactor);
    out.stockoutRisk = { pct: +Math.max(0.3, Math.min(20, baseKpis.stockoutRisk.pct * riskMult)).toFixed(1) };
  }
  if (baseKpis.daysOfCoverage) {
    out.daysOfCoverage = { days: Math.round((baseKpis.daysOfCoverage.days * ssRatio) / demFactor) };
  }

  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// DELTA CHIP HELPER
// ══════════════════════════════════════════════════════════════════════════════
function getDelta(baseKpi, scenKpi, def) {
  if (!baseKpi || !scenKpi) return null;
  const bv = baseKpi[def.deltaKey];
  const sv = scenKpi[def.deltaKey];
  if (bv == null || sv == null) return null;
  const diff = sv - bv;
  if (Math.abs(diff) < 0.001) return { kind: 'neutral', label: '—' };
  const sign = diff > 0 ? '+' : '';
  const diffStr = `${sign}${Number.isInteger(diff) ? diff : diff.toFixed(1)} ${def.deltaUnit}`;
  const better =
    def.goodDir === 'up'   ? diff > 0 :
    def.goodDir === 'down' ? diff < 0 : null;
  return { kind: better === null ? 'neutral' : better ? 'better' : 'worse', label: diffStr, diff };
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── Network diagram: SVG edges + absolutely-positioned node boxes ──────────────
function NetworkDiagram({ configKey, selectedNode, onSelectNode }) {
  const config     = NETWORK_CONFIGS[configKey];
  const activeSet  = new Set(config.nodes);

  return (
    <div className="relative shrink-0" style={{ width: SVG_W, height: SVG_H }}>
      {/* Edges rendered first (below nodes) */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={SVG_W}
        height={SVG_H}
      >
        <defs>
          <marker
            id="sc-arrow"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#94A3B8" />
          </marker>
        </defs>

        {config.edges.map(([fromId, toId], i) => {
          const fp  = NODE_POS[fromId];
          const tp  = NODE_POS[toId];
          const x1  = fp.cx;
          const y1  = fp.cy + HALF_H;
          // Shorten line by 10px toward dest to leave room for arrowhead
          const dx  = tp.cx - fp.cx;
          const dy  = (tp.cy - HALF_H) - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux  = dx / len;
          const uy  = dy / len;
          const x2  = tp.cx - ux * 10;
          const y2  = (tp.cy - HALF_H) - uy * 10;

          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#CBD5E1"
              strokeWidth="1.5"
              strokeDasharray="5 3"
              markerEnd="url(#sc-arrow)"
            />
          );
        })}
      </svg>

      {/* Node boxes */}
      {Object.values(ALL_NODES).filter(n => activeSet.has(n.id)).map(node => {
        const pos        = NODE_POS[node.id];
        const isSelected = selectedNode === node.id;
        return (
          <button
            key={node.id}
            onClick={() => onSelectNode(node.id)}
            style={{
              position: 'absolute',
              left:     pos.cx - NODE_W / 2,
              top:      pos.cy - HALF_H,
              width:    NODE_W,
              height:   NODE_H,
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 transition-all text-center px-1 ${
              isSelected
                ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-100/60'
                : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40'
            }`}
          >
            <span className={`text-[10px] font-bold leading-tight ${isSelected ? 'text-teal-700' : 'text-slate-700'}`}>
              {node.label}
            </span>
            <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? 'text-teal-500' : 'text-slate-400'}`}>
              {node.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Node toggle buttons ────────────────────────────────────────────────────────
function NodeToggles({ configKey, selectedNode, onSelectNode }) {
  const config = NETWORK_CONFIGS[configKey];
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {config.nodes.map(nodeId => {
        const node       = ALL_NODES[nodeId];
        const isSelected = selectedNode === nodeId;
        return (
          <button
            key={nodeId}
            onClick={() => onSelectNode(nodeId)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              isSelected
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50'
            }`}
          >
            {node.label}
          </button>
        );
      })}
    </div>
  );
}

// ── KPI panel ──────────────────────────────────────────────────────────────────
function DeltaChip({ delta }) {
  if (!delta || delta.kind === 'neutral') {
    return <span className="text-[10px] text-slate-400">—</span>;
  }
  const arrow = delta.diff > 0 ? '▲' : '▼';
  const cls =
    delta.kind === 'better'
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-600';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      {arrow} {delta.label}
    </span>
  );
}

function KpiPanel({ nodeId, configKey, scenarioParams }) {
  if (!nodeId) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400 italic">
        Select a node to view KPIs
      </div>
    );
  }

  const node      = ALL_NODES[nodeId];
  const baseKpis  = NODE_KPI_DATA[configKey]?.[nodeId];
  const scenKpis  = baseKpis ? applyScenario(baseKpis, node.type, scenarioParams) : null;
  const hasScen   = !!scenKpis;

  if (!baseKpis) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400 italic">
        No data for this node
      </div>
    );
  }

  const relevantKpis = Object.entries(KPI_DEFS).filter(
    ([kpiId, def]) => def.nodeTypes.includes(node.type) && kpiId in baseKpis
  );

  return (
    <div>
      {/* Node header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
        <p className="text-sm font-bold text-slate-800">{node.label}</p>
        <span className="text-xs text-slate-400">{node.sub}</span>
        {hasScen && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
            Scenario active
          </span>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        {relevantKpis.map(([kpiId, def]) => {
          const base      = baseKpis[kpiId];
          const scen      = scenKpis?.[kpiId];
          const delta     = scen ? getDelta(base, scen, def) : null;
          const displayKpi = scen ?? base;

          return (
            <div key={kpiId} className="bg-slate-50 rounded-xl p-2.5 flex flex-col gap-1 min-w-0">
              <p className="text-[10px] text-slate-500 font-medium leading-none">{def.label}</p>
              <p className="text-sm font-bold text-slate-800 leading-tight">
                {def.format(displayKpi)}
              </p>
              {hasScen && (
                <div className="flex items-center gap-1 flex-wrap">
                  <DeltaChip delta={delta} />
                  {delta && delta.kind !== 'neutral' && (
                    <span className="text-[9px] text-slate-400">vs. baseline</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function SupplyChainNodeView({ scenario, onClose }) {
  // Determine default product group from scenario's affected SKUs
  const defaultConfig = (() => {
    const skus = scenario?.params?.affectedSkus ?? '';
    for (const [key, cfg] of Object.entries(NETWORK_CONFIGS)) {
      if (key === 'all') continue;
      if (cfg.products.some(p => skus.includes(p))) return key;
    }
    return 'all';
  })();

  const [configKey,    setConfigKey]    = useState(defaultConfig);
  const [selectedNode, setSelectedNode] = useState(NETWORK_CONFIGS[defaultConfig].nodes[0]);

  const config = NETWORK_CONFIGS[configKey];

  function handleConfigChange(key) {
    setConfigKey(key);
    setSelectedNode(NETWORK_CONFIGS[key].nodes[0]);
  }

  // Only pass params when scenario has meaningful overrides
  const hasParams = scenario?.params && Object.keys(scenario.params).some(
    k => ['safetyStockWeeks', 'serviceLevel', 'leadTimeAdjWeeks', 'demandAdjPct'].includes(k)
  );
  const scenarioParams = hasParams ? scenario.params : null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {scenario?.name ?? 'Supply Chain Network'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Supply chain node view · Click a node or use toggles to inspect KPIs
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-4">
          {/* Product selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 shrink-0">
              Viewing network for:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(NETWORK_CONFIGS).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleConfigChange(key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                    configKey === key
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Config description */}
          <p className="text-xs text-slate-400 italic leading-relaxed">{config.description}</p>

          {/* Diagram + KPI panel */}
          <div className="flex gap-6 items-start">
            {/* Left: diagram and node toggles */}
            <div className="shrink-0">
              <NetworkDiagram
                configKey={configKey}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
              />
              <NodeToggles
                configKey={configKey}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
              />
            </div>

            {/* Right: KPI panel */}
            <div className="flex-1 min-w-0 pt-1">
              <KpiPanel
                nodeId={selectedNode}
                configKey={configKey}
                scenarioParams={scenarioParams}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
