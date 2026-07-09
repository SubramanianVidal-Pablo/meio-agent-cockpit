import { useState, useMemo } from 'react';
import { X, TrendingDown, TrendingUp, Minus } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════════
   NODE DEFINITIONS
══════════════════════════════════════════════════════════════════════════════ */
const ALL_NODES = {
  'factory-1': { id: 'factory-1', label: 'Factory 1',           sub: 'DS Manufacturing',      type: 'factory' },
  'factory-2': { id: 'factory-2', label: 'Factory 2',           sub: 'DS Manufacturing',      type: 'factory' },
  'factory-3': { id: 'factory-3', label: 'Factory 3',           sub: 'Dedicated Biologics',   type: 'factory' },
  'plant-1':   { id: 'plant-1',   label: 'Plant 1',             sub: 'Fill & Finish',         type: 'plant'   },
  'plant-2':   { id: 'plant-2',   label: 'Plant 2',             sub: 'Fill & Finish (Biol.)', type: 'plant'   },
  'dc':        { id: 'dc',        label: 'Distribution Center', sub: '3PL / Cold Chain',      type: 'dc'      },
};

const NODE_POS = {
  'factory-1': { cx: 85,  cy: 42  },
  'factory-2': { cx: 230, cy: 42  },
  'factory-3': { cx: 375, cy: 42  },
  'plant-1':   { cx: 157, cy: 148 },
  'plant-2':   { cx: 375, cy: 148 },
  'dc':        { cx: 230, cy: 238 },
};
const NODE_W = 110, NODE_H = 46, HALF_H = 23;
const SVG_W  = 460, SVG_H  = 272;

/* ══════════════════════════════════════════════════════════════════════════════
   PRODUCT NETWORK CONFIGS  (no "All Products" — meaningless for disruption view)
══════════════════════════════════════════════════════════════════════════════ */
export const NETWORK_CONFIGS = {
  'full-network': {
    label:       'Lumexia & Protazen',
    productDesc: 'High-volume multi-site biologics (A-001, A-004). Load distributed across three factories into two plants.',
    products:    ['A-001', 'A-004'],
    nodes:       ['factory-1', 'factory-2', 'factory-3', 'plant-1', 'plant-2', 'dc'],
    edges:       [['factory-1','plant-1'],['factory-2','plant-1'],['factory-3','plant-2'],['plant-1','dc'],['plant-2','dc']],
  },
  'dual-factory': {
    label:       'Velazan & Nexovir',
    productDesc: 'Mid-volume gene therapies (A-002, A-003). Two factories consolidated at Plant 1.',
    products:    ['A-002', 'A-003'],
    nodes:       ['factory-1', 'factory-2', 'plant-1', 'dc'],
    edges:       [['factory-1','plant-1'],['factory-2','plant-1'],['plant-1','dc']],
  },
  'single-source': {
    label:       'Helivex Plasma',
    productDesc: 'Low-volume dedicated plasma line (B-003). Single path, no alternate sourcing — safety stock elevated throughout.',
    products:    ['B-003'],
    nodes:       ['factory-3', 'plant-2', 'dc'],
    edges:       [['factory-3','plant-2'],['plant-2','dc']],
  },
  'dc-only': {
    label:       'Factor VII',
    productDesc: 'External CMO product (C-001). Arrives at DC as finished goods — no plant tier. Inbound LT reflects CMO lead time.',
    products:    ['C-001'],
    nodes:       ['factory-2', 'dc'],
    edges:       [['factory-2','dc']],
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   BASELINE NODE KPI DATA
══════════════════════════════════════════════════════════════════════════════ */
const NODE_KPI_DATA = {
  'full-network': {
    'factory-1': { inventoryOnHand: { units: 8400, weeks: 6.2 }, safetyStock: { weeks: 6.2 }, leadTime: { weeks: 2 }, batchSize: { units: 1200 }, capacityUtil: { pct: 68 }, throughput: { unitsPerWeek: 1200 }, stockoutRisk: { pct: 2.4 } },
    'factory-2': { inventoryOnHand: { units: 6800, weeks: 5.8 }, safetyStock: { weeks: 5.8 }, leadTime: { weeks: 2 }, batchSize: { units: 960  }, capacityUtil: { pct: 64 }, throughput: { unitsPerWeek: 960  }, stockoutRisk: { pct: 2.8 } },
    'factory-3': { inventoryOnHand: { units: 4200, weeks: 8.4 }, safetyStock: { weeks: 8.4 }, leadTime: { weeks: 3 }, batchSize: { units: 480  }, capacityUtil: { pct: 52 }, throughput: { unitsPerWeek: 480  }, stockoutRisk: { pct: 3.6 } },
    'plant-1':   { inventoryOnHand: { units: 4800, weeks: 7.2 }, safetyStock: { weeks: 7.2 }, reorderPoint: { units: 1800 }, leadTime: { weeks: 6 }, batchSize: { units: 600 }, capacityUtil: { pct: 72 }, throughput: { unitsPerWeek: 600 }, fillRate: { pct: 96.8 }, stockoutRisk: { pct: 3.2 } },
    'plant-2':   { inventoryOnHand: { units: 2400, weeks: 9.1 }, safetyStock: { weeks: 9.1 }, reorderPoint: { units: 880  }, leadTime: { weeks: 8 }, batchSize: { units: 300 }, capacityUtil: { pct: 58 }, throughput: { unitsPerWeek: 300 }, fillRate: { pct: 95.4 }, stockoutRisk: { pct: 4.6 } },
    'dc':        { inventoryOnHand: { units: 7200, weeks: 8.4  }, safetyStock: { weeks: 8.4  }, reorderPoint: { units: 2400 }, leadTime: { weeks: 10 }, fillRate: { pct: 94.8 }, stockoutRisk: { pct: 1.8 }, daysOfCoverage: { days: 59 } },
  },
  'dual-factory': {
    'factory-1': { inventoryOnHand: { units: 3600, weeks: 6.8 }, safetyStock: { weeks: 6.8 }, leadTime: { weeks: 2 }, batchSize: { units: 600 }, capacityUtil: { pct: 76 }, throughput: { unitsPerWeek: 600 }, stockoutRisk: { pct: 3.2 } },
    'factory-2': { inventoryOnHand: { units: 2800, weeks: 6.2 }, safetyStock: { weeks: 6.2 }, leadTime: { weeks: 2 }, batchSize: { units: 480 }, capacityUtil: { pct: 71 }, throughput: { unitsPerWeek: 480 }, stockoutRisk: { pct: 3.6 } },
    'plant-1':   { inventoryOnHand: { units: 3200, weeks: 7.8 }, safetyStock: { weeks: 7.8 }, reorderPoint: { units: 1200 }, leadTime: { weeks: 6 }, batchSize: { units: 480 }, capacityUtil: { pct: 88 }, throughput: { unitsPerWeek: 1080 }, fillRate: { pct: 95.2 }, stockoutRisk: { pct: 4.2 } },
    'dc':        { inventoryOnHand: { units: 5600, weeks: 8.8 }, safetyStock: { weeks: 8.8 }, reorderPoint: { units: 1800 }, leadTime: { weeks: 10 }, fillRate: { pct: 93.8 }, stockoutRisk: { pct: 2.4 }, daysOfCoverage: { days: 62 } },
  },
  'single-source': {
    'factory-3': { inventoryOnHand: { units: 2800, weeks: 10.2 }, safetyStock: { weeks: 10.2 }, leadTime: { weeks: 3 }, batchSize: { units: 360 }, capacityUtil: { pct: 62 }, throughput: { unitsPerWeek: 360 }, stockoutRisk: { pct: 5.8 } },
    'plant-2':   { inventoryOnHand: { units: 1800, weeks: 11.4 }, safetyStock: { weeks: 11.4 }, reorderPoint: { units: 720 }, leadTime: { weeks: 8 }, batchSize: { units: 240 }, capacityUtil: { pct: 54 }, throughput: { unitsPerWeek: 240 }, fillRate: { pct: 93.6 }, stockoutRisk: { pct: 6.2 } },
    'dc':        { inventoryOnHand: { units: 2400, weeks: 12.6 }, safetyStock: { weeks: 12.6 }, reorderPoint: { units: 960 }, leadTime: { weeks: 13 }, fillRate: { pct: 92.8 }, stockoutRisk: { pct: 3.4 }, daysOfCoverage: { days: 88 } },
  },
  'dc-only': {
    'factory-2': { inventoryOnHand: { units: 1200, weeks: 6.2 }, safetyStock: { weeks: 6.2 }, leadTime: { weeks: 2 }, batchSize: { units: 240 }, capacityUtil: { pct: 45 }, throughput: { unitsPerWeek: 240 }, stockoutRisk: { pct: 4.8 } },
    'dc':        { inventoryOnHand: { units: 3600, weeks: 14.4 }, safetyStock: { weeks: 14.4 }, reorderPoint: { units: 1200 }, leadTime: { weeks: 16 }, fillRate: { pct: 91.2 }, stockoutRisk: { pct: 2.8 }, daysOfCoverage: { days: 101 } },
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   KPI DISPLAY DEFINITIONS
══════════════════════════════════════════════════════════════════════════════ */
const KPI_DEFS = {
  inventoryOnHand: { label: 'Inventory on Hand',      nodeTypes: ['factory','plant','dc'], format: k => `${k.units.toLocaleString()} units · ${k.weeks} wks`, goodDir: null,   deltaKey: 'weeks',       deltaUnit: 'wks'  },
  safetyStock:     { label: 'Safety Stock',            nodeTypes: ['factory','plant','dc'], format: k => `${k.weeks} wks`,                                       goodDir: null,   deltaKey: 'weeks',       deltaUnit: 'wks'  },
  reorderPoint:    { label: 'Reorder Point',           nodeTypes: ['plant','dc'],           format: k => `${k.units.toLocaleString()} units`,                    goodDir: null,   deltaKey: 'units',       deltaUnit: 'units'},
  leadTime:        { label: 'Lead Time (Inbound)',     nodeTypes: ['factory','plant','dc'], format: k => `${k.weeks} wks`,                                       goodDir: 'down', deltaKey: 'weeks',       deltaUnit: 'wks'  },
  batchSize:       { label: 'Batch / Lot Size',        nodeTypes: ['factory','plant'],      format: k => `${k.units.toLocaleString()} units`,                    goodDir: null,   deltaKey: 'units',       deltaUnit: 'units'},
  capacityUtil:    { label: 'Capacity Utilization',    nodeTypes: ['factory','plant'],      format: k => `${k.pct}%`,                                            goodDir: null,   deltaKey: 'pct',         deltaUnit: 'pp'   },
  throughput:      { label: 'Throughput',              nodeTypes: ['factory','plant'],      format: k => `${k.unitsPerWeek.toLocaleString()} units/wk`,           goodDir: 'up',   deltaKey: 'unitsPerWeek',deltaUnit: 'u/wk' },
  fillRate:        { label: 'Fill Rate (Outbound)',    nodeTypes: ['plant','dc'],           format: k => `${k.pct}%`,                                            goodDir: 'up',   deltaKey: 'pct',         deltaUnit: 'pp'   },
  stockoutRisk:    { label: 'Stockout Risk',           nodeTypes: ['factory','plant','dc'], format: k => `${k.pct}%`,                                            goodDir: 'down', deltaKey: 'pct',         deltaUnit: 'pp'   },
  daysOfCoverage:  { label: 'Days of Coverage',       nodeTypes: ['dc'],                   format: k => `${k.days} days`,                                       goodDir: 'up',   deltaKey: 'days',        deltaUnit: 'd'    },
};

/* ══════════════════════════════════════════════════════════════════════════════
   AI RECOMMENDATION PARSER
   Reads the TRADE-OFFS section from the last AI message and extracts per-product
   changes: ssFrom, ssTo, slFrom, slTo, stockoutDeltaPp, demandPct, invDeltaM
══════════════════════════════════════════════════════════════════════════════ */
function parseAITradeOffs(chatHistory) {
  if (!chatHistory?.length) return {};

  // Find last assistant message that has a TRADE-OFFS section
  const msg = [...chatHistory].reverse().find(
    m => m.role === 'assistant' && m.content.includes('TRADE-OFFS')
  );
  if (!msg) return {};

  const text = msg.content;
  const tradeStart = text.indexOf('TRADE-OFFS');
  const tradeEnd   = text.indexOf('ALTERNATIVE APPROACHES');
  const tradeBlock = text.slice(tradeStart, tradeEnd > -1 ? tradeEnd : undefined);

  // Split into per-product blocks: a block starts with a non-indented line that
  // doesn't start with "Net" or "Risk" and isn't empty.
  const lines   = tradeBlock.split('\n');
  const products = {};
  let current   = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'TRADE-OFFS') continue;

    // Detect product header: non-indented, no colon near start, not a footer line
    const isHeader = !line.startsWith(' ') && !line.startsWith('\t') &&
      !trimmed.startsWith('Net ') && !trimmed.startsWith('Risk ') &&
      !/^\d+\./.test(trimmed);

    if (isHeader) {
      current = trimmed;
      products[current] = {};
      continue;
    }

    if (!current) continue;
    const p = products[current];

    // Safety stock: "8 weeks → 5 weeks" or "8 wks → 5 wks"
    const ssMatch = trimmed.match(/Safety stock[^:]*:\s*([\d.]+)\s*w(?:eeks?|ks)?\s*→\s*([\d.]+)/i);
    if (ssMatch) { p.ssFrom = parseFloat(ssMatch[1]); p.ssTo = parseFloat(ssMatch[2]); }

    // Service level: "97.5% → 94.8%"
    const slMatch = trimmed.match(/Service level[^:]*:\s*([\d.]+)%\s*→\s*([\d.]+)%/i);
    if (slMatch) { p.slFrom = parseFloat(slMatch[1]); p.slTo = parseFloat(slMatch[2]); }

    // Stockout risk delta: "+4.2pp" or "–1.8pp"
    const soMatch = trimmed.match(/Stockout risk[^:]*:\s*([+\-–]?\s*[\d.]+)\s*pp/i);
    if (soMatch) { p.stockoutDeltaPp = parseFloat(soMatch[1].replace('–', '-').replace(/\s/g, '')); }

    // Demand fulfillment: "+18%"
    const demMatch = trimmed.match(/Demand fulfillment[^:]*:\s*\+?([\d.]+)%/i);
    if (demMatch) { p.demandPct = parseFloat(demMatch[1]); }

    // Inventory required: "+$3.2M"
    const invMatch = trimmed.match(/Inventory required[^:]*:\s*\+?\$([\d.]+)M/i);
    if (invMatch) { p.invDeltaM = parseFloat(invMatch[1]); }

    // Status: "Within policy bounds" / "Outside" / "Fully covered"
    const stMatch = trimmed.match(/Status[^:]*:\s*(.+)/i);
    if (stMatch) { p.status = stMatch[1].trim(); }
  }

  return products;
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAP AI PRODUCT NAMES → CONFIG KEYS
   Convention: products are mentioned in order in TRADE-OFFS.
   First SS-reduced product → first config tab.
   First demand-surge product → second config tab.
   (Handles generic "Product A / Product B" naming from the AI.)
══════════════════════════════════════════════════════════════════════════════ */
function mapProductsToConfigs(tradeOffs) {
  const configKeys = Object.keys(NETWORK_CONFIGS);
  const productNames = Object.keys(tradeOffs);
  const mapping = {}; // configKey → tradeOff object
  productNames.forEach((name, i) => {
    if (configKeys[i]) mapping[configKeys[i]] = tradeOffs[name];
  });
  return mapping;
}

/* ══════════════════════════════════════════════════════════════════════════════
   APPLY AI RECOMMENDATION TO NODE KPIs
   Returns post-recommendation KPI object for a given node.
══════════════════════════════════════════════════════════════════════════════ */
function applyAIRec(baseKpis, nodeType, rec) {
  if (!rec || !baseKpis) return null;

  const hasChange = rec.ssFrom != null || rec.demandPct != null || rec.invDeltaM != null;
  if (!hasChange) return null;

  // Safety stock ratio (e.g., 5/8 = 0.625 if drawn down)
  const ssRatio   = rec.ssFrom != null && rec.ssFrom > 0 ? rec.ssTo / rec.ssFrom : 1;
  // Demand factor (e.g., 1.18 if +18% demand)
  const demFactor = rec.demandPct != null ? 1 + rec.demandPct / 100 : 1;
  // Inventory scale factor from dollar delta (rough proportional increase)
  const invFactor = rec.invDeltaM != null
    ? 1 + rec.invDeltaM / 20 // 20M is approximate baseline — scales inventory up
    : 1;

  const out = {};

  if (baseKpis.inventoryOnHand) {
    const scaleFactor = ssRatio !== 1 ? ssRatio : invFactor;
    out.inventoryOnHand = {
      units: Math.round(baseKpis.inventoryOnHand.units * scaleFactor),
      weeks: +((baseKpis.inventoryOnHand.weeks * scaleFactor) / demFactor).toFixed(1),
    };
  }
  if (baseKpis.safetyStock) {
    const scaleFactor = ssRatio !== 1 ? ssRatio : invFactor;
    out.safetyStock = { weeks: +(baseKpis.safetyStock.weeks * scaleFactor).toFixed(1) };
  }
  if (baseKpis.reorderPoint) {
    out.reorderPoint = { units: Math.round(baseKpis.reorderPoint.units * ssRatio) };
  }
  if (baseKpis.leadTime) {
    out.leadTime = { weeks: baseKpis.leadTime.weeks }; // LT unchanged by AI rec in this scenario
  }
  if (baseKpis.batchSize) {
    out.batchSize = { units: baseKpis.batchSize.units };
  }
  if (baseKpis.capacityUtil) {
    out.capacityUtil = { pct: +Math.min(99, baseKpis.capacityUtil.pct * demFactor).toFixed(1) };
  }
  if (baseKpis.throughput) {
    out.throughput = { unitsPerWeek: Math.round(baseKpis.throughput.unitsPerWeek * demFactor) };
  }
  if (baseKpis.fillRate) {
    // Service level improvement for demand-surge product, slight degradation for SS draw-down
    const slDelta = rec.slFrom != null ? rec.slTo - rec.slFrom : (rec.demandPct ? +0.8 : 0);
    out.fillRate = { pct: +Math.min(99.5, Math.max(80, baseKpis.fillRate.pct + slDelta * 0.5)).toFixed(1) };
  }
  if (baseKpis.stockoutRisk) {
    if (rec.stockoutDeltaPp != null) {
      // Use the AI-stated delta, distributed across nodes (factory gets full, plant 80%, DC 60%)
      const nodeShare = nodeType === 'factory' ? 1.0 : nodeType === 'plant' ? 0.8 : 0.6;
      out.stockoutRisk = { pct: +Math.max(0.2, baseKpis.stockoutRisk.pct + rec.stockoutDeltaPp * nodeShare).toFixed(1) };
    } else {
      // Derive from SS change
      const riskMult = ssRatio !== 1 ? (1 / ssRatio) : Math.max(0.8, demFactor);
      out.stockoutRisk = { pct: +Math.max(0.2, (baseKpis.stockoutRisk.pct * riskMult)).toFixed(1) };
    }
  }
  if (baseKpis.daysOfCoverage) {
    const scaleFactor = ssRatio !== 1 ? ssRatio : invFactor;
    out.daysOfCoverage = { days: Math.round((baseKpis.daysOfCoverage.days * scaleFactor) / demFactor) };
  }

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
   DELTA CHIP
══════════════════════════════════════════════════════════════════════════════ */
function getDelta(base, rec, def) {
  if (!base || !rec) return null;
  const bv = base[def.deltaKey], sv = rec[def.deltaKey];
  if (bv == null || sv == null) return null;
  const diff = sv - bv;
  if (Math.abs(diff) < 0.005) return { kind: 'neutral', label: '—', diff: 0 };
  const sign   = diff > 0 ? '+' : '';
  const diffStr = `${sign}${Number.isInteger(diff) ? diff : diff.toFixed(1)} ${def.deltaUnit}`;
  const better  = def.goodDir === 'up' ? diff > 0 : def.goodDir === 'down' ? diff < 0 : null;
  return { kind: better === null ? 'neutral' : better ? 'better' : 'worse', label: diffStr, diff };
}

/* ══════════════════════════════════════════════════════════════════════════════
   NETWORK DIAGRAM
══════════════════════════════════════════════════════════════════════════════ */
function NetworkDiagram({ configKey, selectedNode, onSelectNode }) {
  const config    = NETWORK_CONFIGS[configKey];
  const activeSet = new Set(config.nodes);

  return (
    <div className="relative shrink-0" style={{ width: SVG_W, height: SVG_H }}>
      <svg className="absolute inset-0 pointer-events-none" width={SVG_W} height={SVG_H}>
        <defs>
          <marker id="sc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 8 3, 0 6" fill="#94A3B8" />
          </marker>
        </defs>
        {config.edges.map(([fromId, toId], i) => {
          const fp = NODE_POS[fromId], tp = NODE_POS[toId];
          const x1 = fp.cx, y1 = fp.cy + HALF_H;
          const dx = tp.cx - fp.cx, dy = (tp.cy - HALF_H) - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const x2 = tp.cx - (dx / len) * 10, y2 = (tp.cy - HALF_H) - (dy / len) * 10;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#sc-arrow)" />;
        })}
      </svg>
      {Object.values(ALL_NODES).filter(n => activeSet.has(n.id)).map(node => {
        const pos = NODE_POS[node.id];
        const sel = selectedNode === node.id;
        return (
          <button key={node.id} onClick={() => onSelectNode(node.id)}
            style={{ position: 'absolute', left: pos.cx - NODE_W / 2, top: pos.cy - HALF_H, width: NODE_W, height: NODE_H }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 transition-all text-center px-1 ${sel ? 'border-teal-500 bg-teal-50 shadow-md' : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40'}`}>
            <span className={`text-[10px] font-bold leading-tight ${sel ? 'text-teal-700' : 'text-slate-700'}`}>{node.label}</span>
            <span className={`text-[9px] leading-none mt-0.5 ${sel ? 'text-teal-500' : 'text-slate-400'}`}>{node.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   KPI PANEL — shows Baseline vs Post-Recommendation side by side
══════════════════════════════════════════════════════════════════════════════ */
function KpiPanel({ nodeId, configKey, recForConfig }) {
  if (!nodeId) return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400 italic">Select a node to view KPIs</div>
  );

  const node     = ALL_NODES[nodeId];
  const baseKpis = NODE_KPI_DATA[configKey]?.[nodeId];
  if (!baseKpis) return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400 italic">No data for this node</div>
  );

  const recKpis  = applyAIRec(baseKpis, node.type, recForConfig);
  const hasRec   = !!recKpis;

  const visibleKpis = Object.entries(KPI_DEFS).filter(
    ([kpiId, def]) => def.nodeTypes.includes(node.type) && kpiId in baseKpis
  );

  return (
    <div>
      {/* Node header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
        <p className="text-sm font-bold text-slate-800">{node.label}</p>
        <span className="text-xs text-slate-400">{node.sub}</span>
        {hasRec && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
            Recommendation applied
          </span>
        )}
      </div>

      {/* Column headers if rec active */}
      {hasRec && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-1">Current</div>
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide px-1">Post-Recommendation</div>
        </div>
      )}

      {/* KPI rows */}
      <div className="flex flex-col gap-2">
        {visibleKpis.map(([kpiId, def]) => {
          const base  = baseKpis[kpiId];
          const rec   = recKpis?.[kpiId];
          const delta = rec ? getDelta(base, rec, def) : null;
          const changed = delta && delta.kind !== 'neutral';

          return (
            <div key={kpiId} style={{
              background: changed ? (delta.kind === 'better' ? '#F0FDF4' : delta.kind === 'worse' ? '#FEF2F2' : '#F8FAFC') : '#F8FAFC',
              border: changed ? `1px solid ${delta.kind === 'better' ? '#86EFAC' : '#FCA5A5'}` : '1px solid #F1F5F9',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <p className="text-[10px] text-slate-500 font-medium mb-1.5">{def.label}</p>
              {hasRec ? (
                <div className="grid grid-cols-2 gap-3 items-center">
                  {/* Baseline */}
                  <div>
                    <p className="text-sm font-bold text-slate-600">{def.format(base)}</p>
                  </div>
                  {/* Post-rec */}
                  <div>
                    {rec ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold" style={{ color: !changed ? '#374151' : delta.kind === 'better' ? '#15803D' : '#B91C1C' }}>
                          {def.format(rec)}
                        </p>
                        {changed && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                            background: delta.kind === 'better' ? '#DCFCE7' : '#FEE2E2',
                            color: delta.kind === 'better' ? '#15803D' : '#B91C1C',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            {delta.diff > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {delta.label}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No change</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-800">{def.format(base)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   NODE TOGGLES
══════════════════════════════════════════════════════════════════════════════ */
function NodeToggles({ configKey, selectedNode, onSelectNode }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {NETWORK_CONFIGS[configKey].nodes.map(nodeId => {
        const sel = selectedNode === nodeId;
        return (
          <button key={nodeId} onClick={() => onSelectNode(nodeId)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${sel ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50'}`}>
            {ALL_NODES[nodeId].label}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════════════════ */
export default function SupplyChainNodeView({ scenario, onClose }) {
  // Parse AI recommendation from chat history
  const tradeOffs       = useMemo(() => parseAITradeOffs(scenario?.chatHistory), [scenario?.chatHistory]);
  const productRecMap   = useMemo(() => mapProductsToConfigs(tradeOffs), [tradeOffs]);
  const hasAIRec        = Object.keys(tradeOffs).length > 0;

  const firstConfig     = Object.keys(NETWORK_CONFIGS)[0];
  const [configKey,    setConfigKey]    = useState(firstConfig);
  const [selectedNode, setSelectedNode] = useState(NETWORK_CONFIGS[firstConfig].nodes[0]);

  function handleConfigChange(key) {
    setConfigKey(key);
    setSelectedNode(NETWORK_CONFIGS[key].nodes[0]);
  }

  const config     = NETWORK_CONFIGS[configKey];
  const recForThis = productRecMap[configKey] ?? null;

  // Product-level summary: which products are affected by the recommendation
  const affectedConfigs = new Set(Object.keys(productRecMap));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">{scenario?.name ?? 'Supply Chain Network'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inventory at each site · {hasAIRec ? 'Current vs. post-recommendation shown side by side' : 'Click a node to inspect KPIs'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"><X size={18} /></button>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-4">

          {/* AI recommendation banner */}
          {hasAIRec && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px' }}>
              <div className="flex items-start gap-2">
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 10, color: '#fff', fontWeight: 800 }}>AI</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-indigo-800 mb-1">Recommendation impact across the network</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(tradeOffs).map(([name, rec], i) => {
                      const configK = Object.keys(NETWORK_CONFIGS)[i];
                      const configLabel = configK ? NETWORK_CONFIGS[configK]?.label : '—';
                      return (
                        <div key={name} className="text-[11px] text-indigo-700">
                          <span className="font-bold">{name}</span>
                          <span className="text-indigo-400"> ({configLabel})</span>
                          {rec.ssFrom != null && <span className="ml-1">— SS {rec.ssFrom}→{rec.ssTo} wks</span>}
                          {rec.demandPct != null && <span className="ml-1">— demand +{rec.demandPct}%</span>}
                          {rec.status && <span className="ml-1 font-semibold" style={{ color: rec.status.toLowerCase().includes('within') || rec.status.toLowerCase().includes('full') ? '#15803D' : '#B91C1C' }}>· {rec.status}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Product:</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(NETWORK_CONFIGS).map(([key, cfg]) => {
                const isAffected = affectedConfigs.has(key);
                const isSel      = configKey === key;
                return (
                  <button key={key} onClick={() => handleConfigChange(key)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all flex items-center gap-1.5 ${
                      isSel ? 'bg-teal-600 text-white border-teal-600'
                             : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700'
                    }`}>
                    {cfg.label}
                    {isAffected && !isSel && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} title="Affected by recommendation" />
                    )}
                    {isAffected && isSel && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product description */}
          <p className="text-xs text-slate-400 italic leading-relaxed">{config.productDesc}</p>

          {/* Diagram + KPI panel */}
          <div className="flex gap-6 items-start">
            <div className="shrink-0">
              <NetworkDiagram configKey={configKey} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
              <NodeToggles configKey={configKey} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
            </div>
            <div className="flex-1 min-w-0 pt-1 overflow-y-auto" style={{ maxHeight: 420 }}>
              <KpiPanel nodeId={selectedNode} configKey={configKey} recForConfig={recForThis} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
