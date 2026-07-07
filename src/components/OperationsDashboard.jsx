import { useState, useRef } from 'react';
import {
  TrendingUp, TrendingDown, CheckCircle, Clock, ChevronDown, ChevronRight,
  ArrowRight, Zap, AlertTriangle, CheckSquare, XSquare, Target, Activity,
  RotateCcw, Info,
} from 'lucide-react';
import { callClaude } from '../api/claude';
import { runSimulation, getPortfolioSummary, optimizeInventory } from '../data/simulationEngine';
import { computeABCClass } from '../data/skuData';

/* ─────────────────────────── DATA ─────────────────────────── */

const IBP_FORUMS = [
  { id: 'demand',         label: 'Demand Review',    status: 'complete', detail: '3 demand changes · Northeast uplift flagged',                 date: '3d ago'     },
  { id: 'mbr',            label: 'Regional MBR',     status: 'complete', detail: '2 territories escalated to supply review',                    date: 'Yesterday'  },
  { id: 'supply',         label: 'Supply Review',    status: 'live',     detail: '4 supply constraints on agenda',                              date: 'Today 14:00'},
  { id: 'reconciliation', label: 'Reconciliation',   status: 'pending',  detail: 'S&OP gap analysis · 2 open decisions pending',                date: 'Thu'        },
  { id: 'corporate',      label: 'Corporate Review', status: 'pending',  detail: 'ExCo sign-off · CapEx request included',                      date: 'Mon'        },
];

const AGENT_ACTIONS = [
  { id:'aa-001', priority:'CRITICAL', sku:'BIO-K110', title:'Miss-case risk — CAR-T patient slots',
    reasoning:'Consignment snapshot (32 Days on Hand) crossed with Haematology & BMT procedure rate (+40% QoQ) and 21-day vein-to-vein lead time. Available supply will be insufficient within 14 days.',
    query:'Show CAR-T supply vs patient slot demand for next 6 weeks and recommend action', impact:'$198K', days:14 },
  { id:'aa-002', priority:'CRITICAL', sku:'BIO-A100', title:'Supply–demand gap — Adalimumab DS',
    reasoning:'Supply plan shows zero output from Plant A for 14 days (QC batch release hold). Demand: 280 units/wk. Uncovered gap: ~560 units before next confirmed batch release.',
    query:'Analyse Adalimumab DS supply plan vs demand for next 8 weeks and size the bridging need', impact:'$487K', days:3 },
  { id:'aa-003', priority:'HIGH',     sku:'BIO-D400', title:'Shelf life write-off — Trastuzumab DS',
    reasoning:'DC Central holds 142 Days on Hand vs 18-month shelf life. At current consumption 8,200 units expire. Lateral transfer to DC East eliminates exposure.',
    query:'Model shelf life exposure and optimal transfer for BIO-D400 from DC Central to DC East', impact:'$156K', days:90 },
  { id:'aa-004', priority:'HIGH',     sku:'BIO-E500', title:'E&O reserve breach — Insulin Glargine',
    reasoning:'Current excess ($89K) plus falling demand projects E&O to $124K — above $100K policy cap. Accelerated burn-down required.',
    query:'Project E&O trajectory for BIO-E500 under three demand scenarios and recommend burn-down', impact:'$89K', days:45 },
  { id:'aa-005', priority:'MEDIUM',   sku:'BIO-G700', title:'Forecast under-bias — mRNA Antigen DS',
    reasoning:'Under-forecast 3 consecutive cycles (avg bias +31%). Seasonal surge not in baseline. Manual uplift needed before corporate review.',
    query:'Show BIO-G700 forecast vs actuals, decompose bias, and recommend manual adjustment', impact:'$312K', days:18 },
];

const LEVERS = [
  { label:'Field Turns',             realized:12.4, target:18.0, color:'#D97706' },
  { label:'FG Overstock Burn',       realized:8.1,  target:12.0, color:'#D97706' },
  { label:'E2E SS/CS Reset (MEIO)',  realized:4.2,  target:15.0, color:'#DC2626' },
  { label:'RM / WIP Reduction',      realized:6.8,  target:8.0,  color:'#059669' },
  { label:'Headwinds (demand surge)', realized:-3.2, target:0,   color:'#DC2626' },
];

const HOT_SPOTS = [
  { rank:1, driver:'Batch release lead time excess',   skus:'BIO-A100 · BIO-L120', impact:'$4.8M',
    detail:'QC testing averaging 34 days vs 21-day standard — adds 13 days mandatory safety stock across two life-saving SKUs' },
  { rank:2, driver:'MOQ misalignment vs demand',       skus:'BIO-E500',            impact:'$3.1M',
    detail:'CMO minimum order 5,000 units. Weekly demand ~2,100. Every order is ~2.4× actual need — structural overstock' },
  { rank:3, driver:'Seasonal forecast bias',            skus:'BIO-G700',            impact:'$2.4M',
    detail:'Systematic under-forecast 3 consecutive cycles — reactive SS built manually each time, inflating WC' },
  { rank:4, driver:'Cold chain DC capacity constraint', skus:'DC Central 94%',      impact:'$1.9M',
    detail:'DC Central at 94% cold storage — inventory pooling blocked, forcing excess local holdings at other DCs' },
  { rank:5, driver:'Single-source API dependency',     skus:'BIO-B200',            impact:'$1.6M',
    detail:'No qualified secondary supplier — SS premium +60% above MEIO-optimal to cover sole-source risk' },
];

const FIELD_REQUESTS = [
  { id:'cr-001', sku:'BIO-C300', name:'Pembrolizumab DP',
    requestor:'J. Martinez — Oncology Infusion Centre West',
    reason:'3 new immunotherapy trial enrolments. Current vial stock insufficient until next cold chain replenishment.',
    qty:12, unit:'vials (100 mg)', urgency:'HIGH', submitted:'2h ago', status:'pending' },
  { id:'cr-002', sku:'BIO-K110', name:'CAR-T Cell Product DP',
    requestor:'Dr. S. Patel — Haematology & BMT Unit East',
    reason:'Two additional leukaemia patient slots approved. Vein-to-vein 21 days — apheresis must be scheduled now.',
    qty:2, unit:'patient-specific doses', urgency:'MEDIUM', submitted:'5h ago', status:'pending' },
  { id:'cr-003', sku:'BIO-A100', name:'Adalimumab mAb DS',
    requestor:'A. Thompson — Biologics Supply Planning',
    reason:'QC batch release hold at Plant A (failed sterility re-test). Emergency bridging stock transfer requested.',
    qty:500, unit:'vials (DS bulk)', urgency:'IMMEDIATE', submitted:'30m ago', status:'pending' },
];

const REBALANCING = [
  { id:'rb-001', sku:'BIO-D400', name:'Trastuzumab DS',
    from:'DC Central', to:'DC East', qty:'8,000 units',
    reason:'DC Central: 142 Days on Hand (shelf life risk) · DC East: 28 Days on Hand (at risk). Transfer avoids $156K write-off.', saving:'$156K' },
  { id:'rb-002', sku:'BIO-E500', name:'Insulin Glargine DP',
    from:'DC East', to:'DC West', qty:'15,000 units',
    reason:'DC East: 118 Days on Hand excess · DC West: 31 Days on Hand. Shelf life 12 months — must move within 30 days.', saving:'$89K' },
];

/* ─────────────────────────── HELPERS ─────────────────────────── */

function priorityBadge(priority) {
  const map = {
    CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
    HIGH:     'bg-amber-100 text-amber-700 border border-amber-200',
    MEDIUM:   'bg-blue-100 text-blue-700 border border-blue-200',
  };
  return map[priority] || 'bg-gray-100 text-gray-600';
}

function urgencyBadge(urgency) {
  const map = {
    IMMEDIATE: 'bg-red-100 text-red-700 border border-red-200',
    HIGH:      'bg-amber-100 text-amber-700 border border-amber-200',
    MEDIUM:    'bg-blue-100 text-blue-700 border border-blue-200',
  };
  return map[urgency] || 'bg-gray-100 text-gray-600';
}

function fmt$(n) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

/* ─────────────────────────── SCENARIO TARGET HELPERS ─────────────────────── */

/**
 * Returns true if this SKU is within the adopted scenario's product scope.
 * affectedSkus is a free-text string like "A-001 (Lumexia mAb, Class A)" or
 * empty/undefined when no specific scope was set (= all products in scope).
 */
function isSkuInScope(skuId, affectedSkus) {
  if (!affectedSkus || affectedSkus.trim() === '' || /all/i.test(affectedSkus)) return true;
  return affectedSkus.includes(skuId);
}

/**
 * Computes the scenario-adjusted MEIO target safety stock for a single SKU.
 * Scales the baseline meioSafetyStock by the ratio of scenario SS weeks to
 * the baseline 6.2 weeks reference. Other params (LT, SL) do not directly
 * change the SS unit count in this simplified model — they affect the Why label.
 */
function scenarioTarget(baselineSS, params) {
  const ssRatio = params?.safetyStockWeeks != null ? params.safetyStockWeeks / 6.2 : 1;
  return Math.round(baselineSS * ssRatio);
}

/**
 * Returns a short label explaining what drives the action for a given SKU
 * in scenario mode. Used to populate the "Why" column in MEIOTable.
 */
function getWhyLabel(params, inScope) {
  if (!inScope) return 'Baseline target';
  const reasons = [];
  if (params?.safetyStockWeeks != null) reasons.push('Safety stock: scenario target');
  if (params?.leadTimeAdjWeeks   != null && params.leadTimeAdjWeeks !== 0)
    reasons.push(`Lead time buffer: +${params.leadTimeAdjWeeks} wks`);
  if (params?.serviceLevel       != null) reasons.push(`Service level: ${params.serviceLevel}% target`);
  if (params?.wcCapM             != null) reasons.push('Working capital cap: constrained');
  return reasons.length > 0 ? reasons.join(' · ') : 'Baseline target';
}

/* ─────────────────────────── ACTIVE TARGET BANNER ─────────────────────────── */

function ActiveTargetBanner({ appliedScenario, appliedDecision, onRevert }) {
  const isBaseline = !appliedScenario;

  if (isBaseline) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
        <Target className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-600">
          Reflecting: <span className="text-ink">Baseline MEIO Plan</span>
        </span>
        <span className="text-xs text-slate-400">— no scenario adopted</span>
      </div>
    );
  }

  // Parse metadata from decision log entry if available
  const kpi      = appliedScenario.params?.kpiPriority ?? null;
  const products = appliedScenario.params?.affectedSkus
    ? appliedScenario.params.affectedSkus
    : 'All products';
  const adoptedAt = appliedScenario.updatedAt
    ? `Adopted ${appliedScenario.updatedAt}`
    : appliedDecision?.timestamp
      ? `Adopted at ${appliedDecision.timestamp}`
      : 'Recently adopted';

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
      <div className="flex items-start gap-3 min-w-0">
        <Activity className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-amber-800">Reflecting:</span>
            <span className="text-xs font-bold text-ink truncate">{appliedScenario.name}</span>
            <span className="text-xs text-amber-600">·</span>
            <span className="text-xs text-amber-700">{adoptedAt}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {kpi && (
              <span className="text-[11px] text-amber-700">
                Optimized for: <span className="font-semibold">{kpi}</span>
              </span>
            )}
            {kpi && <span className="text-amber-400">·</span>}
            <span className="text-[11px] text-amber-700">
              Products: <span className="font-semibold">{products}</span>
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onRevert}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors shrink-0 whitespace-nowrap"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Revert to Baseline
      </button>
    </div>
  );
}

/* ─────────────────────────── MODULE 1: KPI Strip (S&OP-focused) ─────────────── */

function KPIStrip() {
  // S&OP / IBP-specific KPIs only — not duplicating SKUs-at-risk or avg fulfillment
  const kpis = [
    {
      label: 'Net Gross Inventory',
      value: '$47.2M',
      sub: 'vs MEIO-optimal target',
      gap: '−$8.8M vs $38.4M target',
      color: '#DC2626',
      Icon: TrendingDown,
    },
    {
      label: 'End-of-Care Service Level',
      value: '94.1%',
      sub: 'patient-facing delivery',
      gap: '−4.4pp vs 98.5% target',
      color: '#DC2626',
      Icon: TrendingDown,
    },
    {
      label: 'Miss-Case Rate',
      value: '0.12%',
      sub: 'procedures missed vs plan',
      gap: '+0.02pp above <0.10% target',
      color: '#D97706',
      Icon: AlertTriangle,
    },
    {
      label: 'E&O Reserves',
      value: '$3.2M',
      sub: 'excess & obsolescence',
      gap: '+$1.2M above <$2.0M target',
      color: '#D97706',
      Icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white shadow-card border border-border-light rounded-xl p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">{kpi.label}</span>
              <div className="text-[10px] text-faint mt-0.5">For leadership reporting</div>
            </div>
            <kpi.Icon className="w-4 h-4 shrink-0" style={{ color: kpi.color }} />
          </div>
          <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ color: kpi.color, backgroundColor: kpi.color + '15', border: `1px solid ${kpi.color}40` }}>
              {kpi.gap}
            </span>
          </div>
          <div className="text-xs text-faint">{kpi.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── MODULE 2: IBP Cycle Tracker ─────────────────────────── */

function IBPCycleTracker() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-ink">IBP Cycle Tracker</h3>
          <p className="text-xs text-muted mt-0.5">S&OP / IBP forum progress — current cycle</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />
          <span className="text-xs font-semibold text-amber-700">LIVE — Supply Review in progress</span>
        </div>
      </div>

      <div className="flex items-start gap-0 relative">
        {IBP_FORUMS.map((forum, idx) => {
          const isComplete = forum.status === 'complete';
          const isLive = forum.status === 'live';
          const isLast = idx === IBP_FORUMS.length - 1;
          const isOpen = expanded === forum.id;

          return (
            <div key={forum.id} className="flex-1 flex flex-col items-center relative">
              {idx > 0 && (
                <div className="absolute top-4 right-1/2 w-1/2 h-0.5"
                  style={{ backgroundColor: IBP_FORUMS[idx - 1].status === 'complete' ? '#0F766E' : '#CBD5E1' }} />
              )}
              {!isLast && (
                <div className="absolute top-4 left-1/2 w-1/2 h-0.5"
                  style={{ backgroundColor: isComplete ? '#0F766E' : '#CBD5E1' }} />
              )}

              <button
                onClick={() => setExpanded(isOpen ? null : forum.id)}
                className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: isComplete ? '#0F766E' : isLive ? '#D97706' : '#F1F5F9',
                  borderColor: isComplete ? '#0F766E' : isLive ? '#D97706' : '#CBD5E1',
                }}>
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-white" />
                ) : isLive ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-400" />
                )}
              </button>

              <div className="mt-2 text-center">
                <div className={`text-xs font-semibold ${isComplete ? 'text-brand' : isLive ? 'text-amber-600' : 'text-muted'}`}>
                  {forum.label}
                </div>
                <div className="text-[10px] text-faint mt-0.5">{forum.date}</div>
                {isLive && (
                  <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">LIVE</span>
                )}
              </div>

              {isOpen && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 w-52 bg-white border border-border-light shadow-lg rounded-lg p-3 text-xs text-ink">
                  <div className="font-semibold mb-1">{forum.label}</div>
                  <div className="text-muted">{forum.detail}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── MODULE 3: MEIO Table (dynamic) ─────────────── */

const DECISION_CFG = {
  INCREASE: { label: 'BUILD',     color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
  REDUCE:   { label: 'REDUCE',    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  MAINTAIN: { label: 'ON TARGET', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
};
const ABC_COLORS_OPS = { A:'#0F766E', B:'#4F46E5', C:'#94A3B8' };

function MEIOTable({ optimized, onNavigate, appliedScenario }) {
  const scenarioActive = !!appliedScenario;
  const scenarioParams = appliedScenario?.params ?? {};

  // Augment each SKU with effective target and why label for this render
  const augmented = optimized.map(sku => {
    const inScope    = isSkuInScope(sku.id, scenarioParams.affectedSkus);
    const effectiveTarget = scenarioActive && inScope
      ? scenarioTarget(sku.meioSafetyStock, scenarioParams)
      : sku.meioSafetyStock;
    const delta      = sku.currentSS - effectiveTarget;
    const decision   = delta < -10 ? 'INCREASE' : delta > 10 ? 'REDUCE' : 'MAINTAIN';
    const whyLabel   = scenarioActive ? getWhyLabel(scenarioParams, inScope) : null;
    return { ...sku, effectiveTarget, decision, delta, inScope, whyLabel };
  });

  const sorted = [...augmented].sort((a, b) => {
    const order = { INCREASE: 0, REDUCE: 1, MAINTAIN: 2 };
    if (order[a.decision] !== order[b.decision]) return order[a.decision] - order[b.decision];
    return b.riskMonths - a.riskMonths;
  });

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">MEIO Safety Stock Status</h3>
          <p className="text-xs text-muted mt-0.5">
            {scenarioActive
              ? `Targets reflect adopted scenario · in-scope: ${scenarioParams.affectedSkus || 'all products'}`
              : 'Live — from current scenario & SS levers · sorted by urgency'}
          </p>
        </div>
        <button onClick={() => onNavigate('plan')}
          className="text-xs text-brand font-medium hover:underline flex items-center gap-1">
          Adjust levers → Plan tab
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left">
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">SKU</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">Name</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">Class</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px] text-right">Curr SS</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px] text-right">
                {scenarioActive ? 'Target' : 'MEIO Target'}
              </th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px] text-right">Gap</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">Coverage</th>
              <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">Action</th>
              {scenarioActive && (
                <th className="pb-2 pr-3 text-muted font-semibold uppercase tracking-wide text-[10px]">Why</th>
              )}
              <th className="pb-2 text-muted font-semibold uppercase tracking-wide text-[10px] text-right">Risk Months</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {sorted.map((sku) => {
              const cfg        = DECISION_CFG[sku.decision];
              const deltaStr   = sku.delta >= 0 ? `+${sku.delta.toLocaleString()}` : sku.delta.toLocaleString();
              const deltaColor = sku.decision === 'INCREASE' ? '#DC2626' : sku.decision === 'REDUCE' ? '#D97706' : '#059669';
              const coverage   = Math.min(150, Math.round((sku.currentSS / sku.effectiveTarget) * 100));
              const tierColor  = ABC_COLORS_OPS[sku.abcClass] ?? '#94A3B8';
              // Dim rows for out-of-scope SKUs when a scenario is active
              const rowOpacity = scenarioActive && !sku.inScope ? 'opacity-60' : '';

              return (
                <tr key={sku.id} className={`group hover:bg-surface transition-colors ${rowOpacity}`}>
                  <td className="py-2.5 pr-3"><span className="font-mono font-semibold text-ink">{sku.id}</span></td>
                  <td className="py-2.5 pr-3 text-ink">{sku.name}</td>
                  <td className="py-2.5 pr-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: tierColor, background: tierColor + '18' }}>{sku.abcClass}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-ink">{sku.currentSS.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-muted">
                    {sku.effectiveTarget.toLocaleString()}
                    {scenarioActive && sku.inScope && sku.effectiveTarget !== sku.meioSafetyStock && (
                      <span className="ml-1 text-[9px] text-amber-600 font-semibold">(scen.)</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold" style={{ color: deltaColor }}>{deltaStr}</td>
                  <td className="py-2.5 pr-3">
                    <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(coverage, 100)}%`, backgroundColor: cfg.color }} />
                    </div>
                    <span className="text-[10px] text-faint">{coverage}%</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      {cfg.label}
                    </span>
                  </td>
                  {scenarioActive && (
                    <td className="py-2.5 pr-3 max-w-[160px]">
                      <span className={`text-[10px] leading-tight ${sku.inScope ? 'text-amber-700 font-medium' : 'text-slate-400'}`}>
                        {sku.whyLabel}
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 text-right">
                    {sku.riskMonths > 0
                      ? <span className="font-bold text-danger">{sku.riskMonths}mo</span>
                      : <span className="text-faint">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── MODULE 4: Agent Action Queue ─────────────────────────── */

function AgentActionQueue() {
  const [expanded, setExpanded] = useState(null);
  const [streaming, setStreaming] = useState({});
  const [outputs, setOutputs] = useState({});
  const abortRefs = useRef({});

  async function fireQuery(action) {
    if (streaming[action.id]) {
      abortRefs.current[action.id]?.abort();
      return;
    }
    const controller = new AbortController();
    abortRefs.current[action.id] = controller;
    setStreaming(s => ({ ...s, [action.id]: true }));
    setOutputs(o => ({ ...o, [action.id]: '' }));

    try {
      await callClaude(
        action.query,
        (chunk) => setOutputs(o => ({ ...o, [action.id]: (o[action.id] || '') + chunk })),
        controller.signal
      );
    } catch (e) {
      if (e.name !== 'AbortError') {
        setOutputs(o => ({ ...o, [action.id]: (o[action.id] || '') + '\n[Error: ' + e.message + ']' }));
      }
    } finally {
      setStreaming(s => ({ ...s, [action.id]: false }));
    }
  }

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Agent Action Queue</h3>
        <p className="text-xs text-muted mt-0.5">AI-generated supply chain interventions</p>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1" style={{ maxHeight: 380 }}>
        {AGENT_ACTIONS.map((action) => {
          const isOpen = expanded === action.id;
          return (
            <div key={action.id} className="border border-border-light rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : action.id)}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${priorityBadge(action.priority)}`}>
                  {action.priority}
                </span>
                <span className="font-mono text-xs text-brand shrink-0">{action.sku}</span>
                <span className="text-xs text-ink font-medium flex-1 truncate">{action.title}</span>
                <span className="text-[10px] text-muted shrink-0">{action.impact}</span>
                <span className="text-[10px] text-faint shrink-0">{action.days}d</span>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 bg-surface border-t border-border-light">
                  <p className="text-xs text-muted mt-2 leading-relaxed">{action.reasoning}</p>
                  <button
                    onClick={() => fireQuery(action)}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                    <Zap className="w-3.5 h-3.5" />
                    {streaming[action.id] ? 'Streaming… (click to stop)' : 'Fire Query →'}
                  </button>
                  {outputs[action.id] && (
                    <div className="mt-2 p-3 rounded-lg bg-white border border-border-light text-xs text-ink whitespace-pre-wrap leading-relaxed font-mono max-h-48 overflow-y-auto">
                      {outputs[action.id]}
                      {streaming[action.id] && <span className="animate-pulse">▌</span>}
                    </div>
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

/* ─────────────────────────── MODULE 5: Lever Waterfall ─────────────────────────── */

function LeverWaterfall() {
  const totalRealized = LEVERS.reduce((s, l) => s + l.realized, 0).toFixed(1);
  const totalTarget = LEVERS.reduce((s, l) => s + Math.abs(l.target), 0).toFixed(1);
  const maxAbs = Math.max(...LEVERS.map(l => Math.max(Math.abs(l.realized), Math.abs(l.target))));

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Inventory Reduction Levers</h3>
        <p className="text-xs text-muted mt-0.5">Realized vs target savings ($M)</p>
      </div>
      <div className="flex flex-col gap-3">
        {LEVERS.map((lever) => {
          const realizedPct = Math.abs(lever.realized) / maxAbs * 100;
          const targetPct = Math.abs(lever.target) / maxAbs * 100;
          const isNegative = lever.realized < 0;

          return (
            <div key={lever.label} className="flex items-center gap-3">
              <div className="w-44 text-xs text-muted shrink-0 text-right">{lever.label}</div>
              <div className="flex-1 h-6 bg-surface rounded relative">
                <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10" style={{ left: `${targetPct}%` }} />
                <div className="h-full rounded flex items-center justify-end pr-1.5 transition-all"
                  style={{ width: `${realizedPct}%`, backgroundColor: lever.color, opacity: isNegative ? 0.7 : 1 }}>
                  <span className="text-[10px] font-bold text-white whitespace-nowrap">
                    {lever.realized > 0 ? `+${lever.realized}` : lever.realized}M
                  </span>
                </div>
              </div>
              <div className="w-12 text-[10px] text-faint shrink-0">/ {lever.target}M</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border-light flex items-center gap-2">
        <span className="text-xs text-muted">Total realized:</span>
        <span className="text-sm font-bold text-ink">${totalRealized}M</span>
        <span className="text-xs text-muted">/ ${totalTarget}M target</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── MODULE 6: Hot Spot Panel ─────────────────────────── */

function HotSpotPanel() {
  const [expanded, setExpanded] = useState(null);
  const rankColors = { 1: '#DC2626', 2: '#D97706' };

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Inventory Hot Spots</h3>
        <p className="text-xs text-muted mt-0.5">Top structural drivers of excess inventory</p>
      </div>
      <div className="flex flex-col gap-2">
        {HOT_SPOTS.map((spot) => {
          const isOpen = expanded === spot.rank;
          const rankColor = rankColors[spot.rank] || '#94A3B8';

          return (
            <div key={spot.rank} className="border border-border-light rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : spot.rank)}>
                <span className="text-lg font-black w-6 shrink-0 text-center leading-none" style={{ color: rankColor }}>{spot.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-ink truncate">{spot.driver}</div>
                  <div className="text-[10px] font-mono text-muted">{spot.skus}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                  style={{ color: '#DC2626', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                  {spot.impact}
                </span>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-border-light bg-surface">
                  <p className="text-xs text-muted mt-2 leading-relaxed">{spot.detail}</p>
                  <button className="mt-2 text-xs text-brand font-medium hover:underline">Drill into root cause →</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── MODULE 7: Operational Actions ─────────────────────────── */

function OperationalActions() {
  const [open, setOpen] = useState(true);
  const [subTab, setSubTab] = useState('requests');
  const [requestStatuses, setRequestStatuses] = useState(
    Object.fromEntries(FIELD_REQUESTS.map(r => [r.id, r.status]))
  );
  const [rebalanceStatuses, setRebalanceStatuses] = useState(
    Object.fromEntries(REBALANCING.map(r => [r.id, 'pending']))
  );

  function setReqStatus(id, status) { setRequestStatuses(s => ({ ...s, [id]: status })); }
  function setRebStatus(id, status) { setRebalanceStatuses(s => ({ ...s, [id]: status })); }

  return (
    <div className="bg-white shadow-card border border-border-light rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface transition-colors text-left"
        onClick={() => setOpen(o => !o)}>
        <div>
          <h3 className="text-sm font-semibold text-ink">Operational Actions</h3>
          <p className="text-xs text-muted mt-0.5">Field requests and inventory rebalancing decisions</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
      </button>

      {open && (
        <div className="border-t border-border-light">
          <div className="flex border-b border-border-light px-5">
            {[['requests', 'Field Requests'], ['rebalancing', 'Rebalancing']].map(([id, label]) => (
              <button key={id} onClick={() => setSubTab(id)}
                className={`py-2.5 px-4 text-xs font-semibold border-b-2 -mb-[1px] transition-colors ${
                  subTab === id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {subTab === 'requests' && (
              <div className="grid grid-cols-1 gap-3">
                {FIELD_REQUESTS.map((req) => {
                  const status = requestStatuses[req.id];
                  return (
                    <div key={req.id} className="border border-border-light rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-xs font-bold text-brand">{req.sku}</span>
                            <span className="text-xs font-semibold text-ink">{req.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyBadge(req.urgency)}`}>{req.urgency}</span>
                            <span className="text-[10px] text-faint">{req.submitted}</span>
                          </div>
                          <div className="text-xs text-muted mb-1">{req.requestor}</div>
                          <div className="text-xs text-ink">{req.reason}</div>
                          <div className="text-xs text-muted mt-1">Qty: <span className="font-semibold text-ink">{req.qty} {req.unit}</span></div>
                        </div>
                        <div className="shrink-0">
                          {status === 'pending' ? (
                            <div className="flex flex-col gap-1.5">
                              <button onClick={() => setReqStatus(req.id, 'approved')}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                                <CheckSquare className="w-3.5 h-3.5" /> Approve & Order
                              </button>
                              <button onClick={() => setReqStatus(req.id, 'rejected')}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-mid text-xs font-semibold text-muted hover:text-ink transition-colors">
                                <XSquare className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${status === 'approved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                              {status === 'approved' ? 'Approved' : 'Rejected'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {subTab === 'rebalancing' && (
              <div className="grid grid-cols-1 gap-3">
                {REBALANCING.map((rb) => {
                  const status = rebalanceStatuses[rb.id];
                  return (
                    <div key={rb.id} className="border border-border-light rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-mono text-xs font-bold text-brand">{rb.sku}</span>
                            <span className="text-xs font-semibold text-ink">{rb.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{ color: '#059669', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                              Save {rb.saving}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs mb-2">
                            <span className="font-semibold text-ink">{rb.from}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-brand" />
                            <span className="font-semibold text-ink">{rb.to}</span>
                            <span className="text-muted">· {rb.qty}</span>
                          </div>
                          <div className="text-xs text-muted">{rb.reason}</div>
                        </div>
                        <div className="shrink-0">
                          {status === 'pending' ? (
                            <div className="flex flex-col gap-1.5">
                              <button onClick={() => setRebStatus(rb.id, 'approved')}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                                <CheckSquare className="w-3.5 h-3.5" /> Approve Transfer
                              </button>
                              <button onClick={() => setRebStatus(rb.id, 'rejected')}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-mid text-xs font-semibold text-muted hover:text-ink transition-colors">
                                <XSquare className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${status === 'approved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                              {status === 'approved' ? 'Approved' : 'Rejected'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── ROOT COMPONENT ─────────────────────────── */

export default function OperationsDashboard({
  skus, scenario, ssMultipliers, onNavigate,
  scenarios = [], decisions = [], onRevertToBaseline,
}) {
  const simulated = skus ? runSimulation(skus, scenario ?? 'baseline', ssMultipliers ?? 1.0) : [];
  const summary   = skus ? getPortfolioSummary(simulated) : { skusAtRisk:0, avgFulfillmentRate:100, totalMarginAtRisk:0, worstMonth:'—' };
  const abcMap     = skus ? Object.fromEntries(computeABCClass(skus).map(s => [s.id, s.abcClass])) : {};
  const optimized  = skus ? optimizeInventory(skus, scenario ?? 'baseline', ssMultipliers ?? 1.0).map(s => ({ ...s, abcClass: abcMap[s.id] ?? 'C' })) : [];

  // Derive adopted scenario — the one with status 'applied' in the scenario library
  const appliedScenario = scenarios.find(s => s.status === 'applied') ?? null;
  // Find the matching decision log entry (used for adoption timestamp metadata)
  const appliedDecision = appliedScenario
    ? decisions.find(d => d.sigType === 'Scenario Applied to Plan' && d.affected?.includes(appliedScenario.name))
    : null;

  return (
    <div className="flex flex-col gap-5">

      {/* Page header */}
      <div className="bg-white border border-border-light rounded-xl px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-base font-bold text-ink">Ops Review — Post-Intervention Health Report</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                S&OP | Leadership View
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              This report reflects inventory health after planner interventions have been applied. Use for S&OP reviews, leadership updates, and tracking progress against working capital targets. Updated after each planning cycle.
            </p>
          </div>
        </div>
      </div>

      {/* Active target banner — always visible */}
      <ActiveTargetBanner
        appliedScenario={appliedScenario}
        appliedDecision={appliedDecision}
        onRevert={onRevertToBaseline}
      />

      {/* Row 1: S&OP KPI Strip */}
      <KPIStrip />

      {/* Row 2: IBP Cycle Tracker */}
      <IBPCycleTracker />

      {/* Row 3: MEIO Table (live) + Agent Action Queue */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <MEIOTable
            optimized={optimized}
            onNavigate={onNavigate}
            appliedScenario={appliedScenario}
          />
        </div>
        <div className="col-span-2">
          <AgentActionQueue />
        </div>
      </div>

      {/* Row 4: Lever Waterfall + Hot Spot Panel */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3"><LeverWaterfall /></div>
        <div className="col-span-2"><HotSpotPanel /></div>
      </div>

      {/* Row 5: Operational Actions */}
      <OperationalActions />
    </div>
  );
}
