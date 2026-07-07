import { useState, useRef } from 'react';
import {
  AlertTriangle, TrendingUp, TrendingDown, Shield, CheckCircle2,
  ChevronRight, ChevronDown, Bot, XCircle, ArrowLeftRight,
  BarChart2, Activity, Zap, Target, Package, MessageSquare
} from 'lucide-react';
import AgentThinkingPulse from './common/AgentThinkingPulse';
import { callClaude, buildExceptionPrompt } from '../api/claude';
import { SKU_DATA, INITIAL_AGENT_MESSAGES } from '../data/mockData';

// ─── Data constants ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  CRITICAL_OOS:  { shortLabel: 'OOS Risk',     actionTag: 'BUILD',     actionColor: '#EF4444', color: '#EF4444', bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: AlertTriangle },
  EXCESS:        { shortLabel: 'Excess',        actionTag: 'REDUCE',    actionColor: '#F59E0B', color: '#F59E0B', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: TrendingUp    },
  AT_RISK:       { shortLabel: 'At Risk',       actionTag: 'BUILD',     actionColor: '#F59E0B', color: '#F59E0B', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: Shield        },
  HEALTHY:       { shortLabel: 'Healthy',       actionTag: 'ON TARGET', actionColor: '#00A651', color: '#00A651', bg: 'bg-bcg-green/10',  border: 'border-bcg-green/30',  icon: CheckCircle2  },
  POLICY_BREACH: { shortLabel: 'Policy',        actionTag: 'REDUCE',    actionColor: '#8B5CF6', color: '#8B5CF6', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: AlertTriangle },
};

const STATUS_LEGEND = [
  { color: '#EF4444', title: 'OOS Risk',      desc: 'Stock will run out before the next batch arrives — patient supply at immediate risk' },
  { color: '#F59E0B', title: 'At Risk',        desc: 'Buffer eroding — will breach safety stock within the planning horizon if not actioned' },
  { color: '#F59E0B', title: 'Excess',         desc: 'Holding above target DoS — write-off risk if shelf life expires before consumption' },
  { color: '#8B5CF6', title: 'Policy Breach',  desc: 'Exceeds approved GMP/GxP storage cap or regulatory holding limit' },
  { color: '#00A651', title: 'Healthy',        desc: 'Within target DoS and service level — no action required' },
];

const KPI_DATA = [
  { label: 'Net Gross Inventory',        value: '$47.2M', target: '$38.4M', gap: '−$8.8M', over: true,  color: '#EF4444', sub: 'vs MEIO-optimal target'       },
  { label: 'End-of-Care Service Level',  value: '94.1%',  target: '98.5%',  gap: '−4.4pp', over: false, color: '#EF4444', sub: 'patient-facing delivery'       },
  { label: 'Miss-Case Rate',             value: '0.12%',  target: '<0.10%', gap: '+0.02pp', over: true,  color: '#F59E0B', sub: 'procedures missed vs plan'     },
  { label: 'E&O Reserves',              value: '$3.2M',  target: '<$2.0M', gap: '+$1.2M',  over: true,  color: '#F59E0B', sub: 'excess & obsolescence'         },
];

const IBP_FORUMS = [
  { id: 'demand',         label: 'Demand Review',    status: 'complete', detail: '3 demand changes · Northeast uplift flagged',       date: '3d ago'    },
  { id: 'mbr',            label: 'Regional MBR',     status: 'complete', detail: '2 territories escalated to supply review',          date: 'Yesterday' },
  { id: 'supply',         label: 'Supply Review',    status: 'live',     detail: '4 supply constraints on agenda',                    date: 'Today 14:00'},
  { id: 'reconciliation', label: 'Reconciliation',   status: 'pending',  detail: 'S&OP gap analysis · 2 open decisions pending',      date: 'Thu'       },
  { id: 'corporate',      label: 'Corporate Review', status: 'pending',  detail: 'ExCo sign-off · CapEx request included',            date: 'Mon'       },
];

const AGENT_ACTIONS = [
  { id: 'aa-001', priority: 'CRITICAL', sku: 'BIO-K110',
    title: 'Miss-case risk — CAR-T patient slots',
    reasoning: 'Consignment snapshot (32 DoS) crossed with Haematology & BMT Unit procedure rate history (+40% QoQ) and 21-day vein-to-vein lead time. Available supply will be insufficient within 14 days.',
    query: 'Show CAR-T supply vs patient slot demand for the next 6 weeks and recommend action', impact: '$198K', daysToImpact: 14 },
  { id: 'aa-002', priority: 'CRITICAL', sku: 'BIO-A100',
    title: 'Supply–demand gap opening — Adalimumab DS',
    reasoning: 'Supply plan shows zero output from Plant A for 14 days (QC batch release hold). Demand plan: 280 units/wk. Uncovered gap: ~560 units before next confirmed batch release.',
    query: 'Analyse Adalimumab DS supply plan vs demand plan for next 8 weeks and size the bridging need', impact: '$487K', daysToImpact: 3 },
  { id: 'aa-003', priority: 'HIGH', sku: 'BIO-D400',
    title: 'Shelf life write-off window — Trastuzumab DS',
    reasoning: 'DC Central holds 142 DoS vs 18-month shelf life. At current consumption, 8,200 units will expire before drawdown. Lateral transfer to DC East eliminates exposure.',
    query: 'Model shelf life exposure and optimal transfer quantity for BIO-D400 from DC Central to DC East', impact: '$156K', daysToImpact: 90 },
  { id: 'aa-004', priority: 'HIGH', sku: 'BIO-E500',
    title: 'E&O reserve breach projected — Insulin Glargine',
    reasoning: 'Current excess ($89K) plus falling demand trend projects E&O reserve to $124K by cycle-end — above $100K policy threshold. Accelerated burn-down required.',
    query: 'Project E&O trajectory for BIO-E500 under three demand scenarios and recommend a burn-down plan', impact: '$89K', daysToImpact: 45 },
  { id: 'aa-005', priority: 'MEDIUM', sku: 'BIO-G700',
    title: 'Systematic forecast under-bias — mRNA Antigen DS',
    reasoning: 'PLAN.ai has under-forecast BIO-G700 demand for 3 consecutive planning cycles (avg bias +31%). Seasonal surge pattern not captured in baseline. Manual uplift needed before corporate review.',
    query: 'Show BIO-G700 forecast vs actuals trend, decompose bias sources, and recommend manual adjustment', impact: '$312K', daysToImpact: 18 },
];

const LEVERS = [
  { label: 'Field Turns',              realized: 12.4, target: 18.0, color: '#F59E0B' },
  { label: 'FG Overstock Burn',        realized: 8.1,  target: 12.0, color: '#F59E0B' },
  { label: 'E2E SS/CS Reset (MEIO)',   realized: 4.2,  target: 15.0, color: '#EF4444' },
  { label: 'RM / WIP Reduction',       realized: 6.8,  target: 8.0,  color: '#00A651' },
  { label: 'Headwinds (demand surge)',  realized: -3.2, target: 0,   color: '#EF4444' },
];

const HOT_SPOTS = [
  { rank: 1, driver: 'Batch release lead time excess', skus: 'BIO-A100 · BIO-L120', impact: '$4.8M',
    detail: 'QC testing averaging 34 days vs 21-day standard — adds 13 days of mandatory safety stock across two life-saving SKUs' },
  { rank: 2, driver: 'MOQ misalignment vs demand', skus: 'BIO-E500', impact: '$3.1M',
    detail: 'CMO minimum order: 5,000 units. Weekly demand: ~2,100 units. Every order is ~2.4× actual need, creating structural overstock' },
  { rank: 3, driver: 'Seasonal forecast bias', skus: 'BIO-G700', impact: '$2.4M',
    detail: 'Systematic under-forecast 3 consecutive cycles — reactive safety stock built manually each time, inflating working capital' },
  { rank: 4, driver: 'Cold chain DC capacity constraint', skus: 'DC Central 94%', impact: '$1.9M',
    detail: 'DC Central at 94% cold storage capacity — inventory pooling and lateral transfers blocked, forcing excess local holdings at other DCs' },
  { rank: 5, driver: 'Single-source API dependency', skus: 'BIO-B200', impact: '$1.6M',
    detail: 'No qualified secondary supplier — safety stock premium of +60% above MEIO-optimal level to cover sole-source supply risk' },
];

const FIELD_REQUESTS = [
  { id: 'cr-001', sku: 'BIO-C300', name: 'Pembrolizumab DP',
    requestor: 'J. Martinez — Oncology Infusion Centre West',
    reason: 'Unexpected patient starts — 3 new immunotherapy trial enrolments this week. Current vial stock insufficient to cover infusion schedule until next cold chain replenishment.',
    qty: 12, unit: 'vials (100 mg)', urgency: 'HIGH', submitted: '2h ago', status: 'pending' },
  { id: 'cr-002', sku: 'BIO-K110', name: 'CAR-T Cell Product DP',
    requestor: 'Dr. S. Patel — Haematology & BMT Unit East',
    reason: 'Two additional leukaemia patient slots approved by the clinical MDT for next month. Vein-to-vein timeline is 21 days — apheresis and manufacturing must be scheduled now.',
    qty: 2, unit: 'patient-specific doses', urgency: 'MEDIUM', submitted: '5h ago', status: 'pending' },
  { id: 'cr-003', sku: 'BIO-A100', name: 'Adalimumab mAb DS',
    requestor: 'A. Thompson — Biologics Supply Planning',
    reason: 'QC batch release hold at Biologics Plant A (failed sterility re-test). Requesting emergency bridging stock transfer from Cold Chain DC Central to cover the 14-day gap.',
    qty: 500, unit: 'vials (DS bulk)', urgency: 'IMMEDIATE', submitted: '30m ago', status: 'pending' },
];

const REBALANCING = [
  { id: 'rb-001', sku: 'BIO-D400', name: 'Trastuzumab DS',
    from: 'Cold Chain DC Central', to: 'Cold Chain DC East', qty: '8,000 units',
    reason: 'DC Central: 142 DoS (shelf life risk) · DC East: 28 DoS (at risk). Lateral transfer avoids $156K write-off.', saving: '$156K' },
  { id: 'rb-002', sku: 'BIO-E500', name: 'Insulin Glargine DP',
    from: 'Cold Chain DC East', to: 'Specialty DC West', qty: '15,000 units',
    reason: 'DC East: 118 DoS excess · DC West: 31 DoS. Shelf life: 12 months — must move within 30 days.', saving: '$89K' },
];

const URGENCY_COLOR  = { IMMEDIATE: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#3B82F6' };
const PRIORITY_COLOR = { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#3B82F6' };

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusLegend() {
  return (
    <div className="bg-slate-card border border-slate-border rounded-xl px-4 py-3 fade-slide-in">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Exception Status Guide</div>
      <div className="grid grid-cols-5 gap-2">
        {STATUS_LEGEND.map(s => (
          <div key={s.title} className="flex flex-col gap-1 p-2 rounded-lg" style={{ background: s.color + '10', border: `1px solid ${s.color}30` }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-xs font-semibold" style={{ color: s.color }}>{s.title}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPIStrip() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {KPI_DATA.map(k => (
        <div key={k.label} className="bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400 leading-tight">{k.label}</span>
            {k.over
              ? <TrendingUp className="w-3.5 h-3.5" style={{ color: k.color }} />
              : <TrendingDown className="w-3.5 h-3.5" style={{ color: k.color }} />}
          </div>
          <div className="text-2xl font-bold mb-1" style={{ color: k.color }}>{k.value}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: k.color + '20', color: k.color }}>{k.gap}</span>
            <span className="text-xs text-slate-500">target {k.target}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

function IBPCycleTracker() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="bg-slate-card border border-slate-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-bcg-green" />
        <span className="text-sm font-semibold text-white">IBP Cycle Position</span>
        <span className="text-xs text-slate-400 ml-1">Monthly planning rhythm</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium animate-pulse">
          ● LIVE — Supply Review in progress
        </span>
      </div>
      <div className="relative flex items-start justify-between">
        {IBP_FORUMS.map((forum, idx) => {
          const isComplete = forum.status === 'complete';
          const isLive     = forum.status === 'live';
          const nextComplete = idx < IBP_FORUMS.length - 1 && IBP_FORUMS[idx + 1].status === 'complete';
          const lineGreen = isComplete && nextComplete;

          return (
            <div key={forum.id} className="flex flex-col items-center flex-1 relative">
              {/* Connector line */}
              {idx < IBP_FORUMS.length - 1 && (
                <div className="absolute top-5 left-1/2 w-full h-0.5 z-0"
                  style={{ background: lineGreen ? '#00A651' : '#334155' }} />
              )}
              {/* Node */}
              <button
                onClick={() => setExpanded(expanded === forum.id ? null : forum.id)}
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                  isComplete ? 'bg-bcg-green border-bcg-green' :
                  isLive     ? 'bg-amber-500/20 border-amber-400' :
                               'bg-navy border-slate-600'
                } ${isLive ? 'ring-4 ring-amber-400/30' : ''}`}
              >
                {isComplete
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : isLive
                  ? <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                  : <span className="w-3 h-3 rounded-full bg-slate-600" />}
              </button>
              {/* Live badge */}
              {isLive && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold mt-1">LIVE</span>
              )}
              {/* Label */}
              <div className={`text-xs font-medium mt-1 text-center ${isLive ? 'text-amber-400' : isComplete ? 'text-bcg-green' : 'text-slate-400'}`}>
                {forum.label}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{forum.date}</div>
              {/* Expanded detail */}
              {expanded === forum.id && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 w-48 z-20 bg-navy border border-slate-border rounded-lg p-2 text-xs text-slate-300 shadow-xl fade-slide-in">
                  {forum.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MEIOTable({ onSelectSku }) {
  const sorted = [...SKU_DATA].sort((a, b) => {
    const order = { CRITICAL_OOS: 0, AT_RISK: 1, EXCESS: 2, POLICY_BREACH: 3, HEALTHY: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });
  const [hovered, setHovered] = useState(null);

  return (
    <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-border flex items-center gap-2">
        <Package className="w-4 h-4 text-bcg-green" />
        <span className="text-sm font-semibold text-white">MEIO Inventory Table</span>
        <span className="text-xs text-slate-400 ml-1">{SKU_DATA.length} biologics · exceptions first</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-navy z-10">
            <tr className="border-b border-slate-border">
              {['SKU', 'Name', 'Node', 'Curr SS', 'MEIO Target', 'Delta', 'Coverage', 'Action'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(sku => {
              const cfg = STATUS_CONFIG[sku.status] || STATUS_CONFIG.HEALTHY;
              const delta = sku.recommendedSafetyStock - sku.currentSafetyStock;
              const coverPct = Math.min(100, Math.round((sku.currentSafetyStock / sku.recommendedSafetyStock) * 100));
              return (
                <tr key={sku.id}
                  onMouseEnter={() => setHovered(sku.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="border-b border-slate-border/40 hover:bg-white/5 transition-colors relative">
                  <td className="px-3 py-2">
                    <span className="font-mono font-bold text-xs" style={{ color: cfg.color }}>{sku.id}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-300 max-w-[120px]">
                    <span className="truncate block">{sku.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{sku.echelon}</td>
                  <td className="px-3 py-2 text-white font-medium">{sku.currentSafetyStock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-300">{sku.recommendedSafetyStock.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold" style={{ color: delta > 0 ? '#00A651' : '#EF4444' }}>
                      {delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2 min-w-[80px]">
                    <div className="h-2 bg-navy rounded-full overflow-hidden w-20">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${coverPct}%`, background: cfg.color }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{coverPct}%</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold whitespace-nowrap"
                        style={{ background: cfg.actionColor + '20', color: cfg.actionColor }}>
                        {cfg.actionTag}
                      </span>
                      {hovered === sku.id && (
                        <button onClick={() => onSelectSku(sku)}
                          className="text-xs text-bcg-green hover:underline whitespace-nowrap fade-slide-in">
                          Deep Dive →
                        </button>
                      )}
                    </div>
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

function AgentActionQueue({ agentResponses, expandedAction, onExpand, onFire }) {
  return (
    <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-border flex items-center gap-2">
        <Bot className="w-4 h-4 text-bcg-green" />
        <span className="text-sm font-semibold text-white">Agent Action Queue</span>
        <span className="text-xs text-slate-400 ml-1">{AGENT_ACTIONS.length} items</span>
      </div>
      <div className="divide-y divide-slate-border/50 overflow-y-auto" style={{ maxHeight: 400 }}>
        {AGENT_ACTIONS.map(action => {
          const resp = agentResponses[action.id] || {};
          const isExpanded = expandedAction === action.id;
          const priorityColor = PRIORITY_COLOR[action.priority] || '#64748B';
          return (
            <div key={action.id} className="p-3">
              <div className="flex items-start gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0 mt-0.5"
                  style={{ background: priorityColor + '20', color: priorityColor }}>
                  {action.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-bcg-green font-bold">{action.sku}</span>
                    <span className="text-xs text-white font-medium truncate">{action.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="text-red-400 font-semibold">{action.impact}</span>
                    <span>·</span>
                    <span>{action.daysToImpact}d to impact</span>
                  </div>
                </div>
                <button onClick={() => onExpand(action.id)}
                  className="shrink-0 p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isExpanded && (
                <div className="mt-2 pl-2 border-l border-slate-border fade-slide-in">
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">{action.reasoning}</p>
                  <button onClick={() => onFire(action)}
                    disabled={resp.loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bcg-green/20 text-bcg-green hover:bg-bcg-green/30 transition-colors disabled:opacity-50">
                    <Zap className="w-3 h-3" />
                    {resp.loading ? 'Analysing…' : 'Fire Query →'}
                  </button>
                  {(resp.loading || resp.text) && (
                    <div className="mt-2 p-2 rounded-lg bg-navy text-xs text-slate-300 leading-relaxed">
                      {resp.text}
                      {resp.loading && <span className="inline-block w-1 h-3 bg-bcg-green ml-0.5 animate-pulse" />}
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

function LeverWaterfall() {
  const SCALE_MAX = 18;
  const totalRealized = LEVERS.filter(l => l.realized > 0).reduce((a, l) => a + l.realized, 0);
  const totalTarget   = LEVERS.filter(l => l.target > 0).reduce((a, l) => a + l.target, 0);

  return (
    <div className="bg-slate-card border border-slate-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4 text-bcg-green" />
        <span className="text-sm font-semibold text-white">Lever Waterfall — Inventory Reduction ($M)</span>
      </div>
      <div className="space-y-3">
        {LEVERS.map(l => {
          const realizedPct = Math.abs(l.realized) / SCALE_MAX * 100;
          const targetPct   = Math.abs(l.target)   / SCALE_MAX * 100;
          const isNeg = l.realized < 0;
          return (
            <div key={l.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium w-44 shrink-0">{l.label}</span>
                <span className="text-slate-400">
                  <span style={{ color: l.color }} className="font-semibold">${Math.abs(l.realized)}M</span>
                  {l.target !== 0 && <span className="text-slate-500"> / target ${l.target}M</span>}
                </span>
              </div>
              <div className="relative h-5 bg-navy rounded-full overflow-hidden">
                {/* Realized bar */}
                <div className="absolute left-0 top-0 h-full rounded-full flex items-center justify-end pr-1 transition-all duration-700"
                  style={{ width: `${realizedPct}%`, background: l.color + (isNeg ? '99' : 'CC') }}>
                  <span className="text-xs text-white font-bold">{isNeg ? '−' : ''}${Math.abs(l.realized)}M</span>
                </div>
                {/* Target marker */}
                {l.target > 0 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10"
                    style={{ left: `${targetPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-border flex items-center justify-between text-xs">
        <span className="text-slate-400">Total realized savings</span>
        <span>
          <span className="text-bcg-green font-bold text-sm">${totalRealized.toFixed(1)}M</span>
          <span className="text-slate-500"> / ${totalTarget.toFixed(1)}M target</span>
        </span>
      </div>
    </div>
  );
}

function HotSpotPanel() {
  const [expanded, setExpanded] = useState(null);
  const rankColors = { 1: '#EF4444', 2: '#F59E0B', 3: '#64748B', 4: '#64748B', 5: '#64748B' };

  return (
    <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-border flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-white">Inventory Hot Spots</span>
        <span className="text-xs text-slate-400 ml-1">Top 5 root causes</span>
      </div>
      <div className="divide-y divide-slate-border/50">
        {HOT_SPOTS.map(spot => {
          const rColor = rankColors[spot.rank] || '#64748B';
          const isExp = expanded === spot.rank;
          return (
            <div key={spot.rank} className="p-3">
              <div className="flex items-start gap-3">
                <span className="text-lg font-black shrink-0 leading-none mt-0.5" style={{ color: rColor }}>
                  {spot.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{spot.driver}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{spot.skus}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-red-500/15 text-red-400">{spot.impact}</span>
                      <button onClick={() => setExpanded(isExp ? null : spot.rank)}
                        className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors">
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {isExp && (
                    <div className="mt-2 fade-slide-in">
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{spot.detail}</p>
                      <button className="text-xs text-bcg-green hover:underline">Drill into root cause →</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperationalActions({ showOps, setShowOps, opsTab, setOpsTab, fieldRequests, setFieldRequests, rebalancing, setRebalancing }) {
  function approveRequest(id) { setFieldRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)); }
  function rejectRequest(id)  { setFieldRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r)); }
  function approveRebalancing(id) { setRebalancing(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)); }
  function rejectRebalancing(id)  { setRebalancing(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r)); }

  const pendingRequests = fieldRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
      <button onClick={() => setShowOps(s => !s)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-bcg-green" />
          <span className="text-sm font-semibold text-white">Operational Actions</span>
          {pendingRequests > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
              {pendingRequests} pending
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showOps ? 'rotate-180' : ''}`} />
      </button>

      {showOps && (
        <div className="border-t border-slate-border fade-slide-in">
          {/* Sub-tabs */}
          <div className="flex gap-1 px-4 pt-3 pb-0">
            {[['requests', 'Field Requests', pendingRequests], ['rebalancing', 'Rebalancing', rebalancing.filter(r => !r.status).length]].map(([id, label, count]) => (
              <button key={id} onClick={() => setOpsTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  opsTab === id ? 'bg-bcg-green/15 border-bcg-green/40 text-white' : 'bg-navy border-slate-border text-slate-400 hover:text-white'
                }`}>
                {label}
                {count > 0 && <span className={`text-xs px-1 py-0.5 rounded-full font-bold ${opsTab === id ? 'bg-bcg-green text-white' : 'bg-slate-border text-slate-400'}`}>{count}</span>}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3">
            {/* Field Requests */}
            {opsTab === 'requests' && (
              <>
                <div className="text-xs text-slate-500 bg-navy border border-slate-border rounded-lg px-3 py-2">
                  Field users — hospital pharmacists, account managers, and clinical teams — can raise custom order requests when replenishments are insufficient or new patient demand arises.
                </div>
                {fieldRequests.map(req => {
                  const urgencyColor = URGENCY_COLOR[req.urgency];
                  const isDone = req.status !== 'pending';
                  return (
                    <div key={req.id} className={`bg-navy border border-slate-border rounded-xl p-4 fade-slide-in ${isDone ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-bcg-green">{req.sku}</span>
                          <span className="text-xs text-white font-medium">{req.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: urgencyColor + '20', color: urgencyColor }}>{req.urgency}</span>
                        </div>
                        <span className="text-xs text-slate-500 shrink-0">{req.submitted}</span>
                      </div>
                      <div className="text-xs text-slate-400 mb-1"><span className="text-slate-300 font-medium">Requestor:</span> {req.requestor}</div>
                      <div className="text-xs text-slate-400 mb-3 leading-relaxed">{req.reason}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Qty requested: <span className="text-white font-medium">{req.qty} {req.unit}</span></span>
                        {req.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button onClick={() => approveRequest(req.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-bcg-green text-white hover:bg-green-500 transition-colors">
                              <CheckCircle2 className="w-3 h-3" /> Approve & Order
                            </button>
                            <button onClick={() => rejectRequest(req.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-slate-border text-slate-400 hover:text-white transition-colors">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className={`text-xs font-medium px-2 py-1 rounded-lg ${req.status === 'approved' ? 'bg-bcg-green/20 text-bcg-green' : 'bg-red-500/10 text-red-400'}`}>
                            {req.status === 'approved' ? '✓ Approved — order submitted' : '✗ Rejected'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Rebalancing */}
            {opsTab === 'rebalancing' && (
              <>
                <div className="text-xs text-slate-500 bg-navy border border-slate-border rounded-lg px-3 py-2">
                  Where replenishment and burn-down alone are insufficient, the AI engine recommends lateral transfers between Cold Chain DC nodes to optimise DoS distribution and avoid shelf life write-offs.
                </div>
                {rebalancing.map(rb => {
                  const isDone = !!rb.status;
                  return (
                    <div key={rb.id} className={`bg-navy border border-slate-border rounded-xl p-4 fade-slide-in ${isDone ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowLeftRight className="w-4 h-4 text-blue-400" />
                        <span className="font-mono text-xs text-bcg-green">{rb.sku}</span>
                        <span className="text-xs text-white font-medium">{rb.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-bcg-green/20 text-bcg-green font-medium">Saves {rb.saving}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs mb-2">
                        <span className="text-slate-400 px-2 py-1 rounded bg-slate-card">{rb.from}</span>
                        <ArrowLeftRight className="w-3 h-3 text-slate-500" />
                        <span className="text-white px-2 py-1 rounded bg-blue-500/20">{rb.to}</span>
                        <span className="text-slate-400 ml-1">· {rb.qty}</span>
                      </div>
                      <div className="text-xs text-slate-400 leading-relaxed mb-3">{rb.reason}</div>
                      {!rb.status ? (
                        <div className="flex gap-2">
                          <button onClick={() => approveRebalancing(rb.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-bcg-green text-white hover:bg-green-500 transition-colors">
                            <CheckCircle2 className="w-3 h-3" /> Approve Transfer
                          </button>
                          <button onClick={() => rejectRebalancing(rb.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-slate-border text-slate-400 hover:text-white transition-colors">
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-lg ${rb.status === 'approved' ? 'bg-bcg-green/20 text-bcg-green' : 'bg-red-500/10 text-red-400'}`}>
                          {rb.status === 'approved' ? '✓ Transfer approved — logistics notified' : '✗ Rejected'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default function ComOpsDashboard({ onSelectSku }) {
  const [agentResponses, setAgentResponses] = useState({});
  const [expandedAction, setExpandedAction] = useState(null);
  const [showOps, setShowOps] = useState(false);
  const [opsTab, setOpsTab] = useState('requests');
  const [fieldRequests, setFieldRequests] = useState(FIELD_REQUESTS);
  const [rebalancing, setRebalancing] = useState(REBALANCING);
  const [showLegend, setShowLegend] = useState(false);
  const abortRefs = useRef({});

  function handleExpand(id) {
    setExpandedAction(prev => prev === id ? null : id);
  }

  async function handleFire(action) {
    // Abort any existing call for this action
    if (abortRefs.current[action.id]) abortRefs.current[action.id].abort();
    const ctrl = new AbortController();
    abortRefs.current[action.id] = ctrl;

    setAgentResponses(prev => ({ ...prev, [action.id]: { loading: true, text: '' } }));
    try {
      await callClaude(
        action.query,
        (chunk) => setAgentResponses(prev => ({
          ...prev,
          [action.id]: { loading: true, text: (prev[action.id]?.text || '') + chunk }
        })),
        ctrl.signal,
        'You are a biopharma MEIO (Multi-Echelon Inventory Optimisation) expert. Analyse supply chain exceptions and provide concise, actionable recommendations.'
      );
    } catch (e) {
      if (e.name !== 'AbortError') {
        setAgentResponses(prev => ({
          ...prev,
          [action.id]: { loading: false, text: (prev[action.id]?.text || '') || '[Analysis unavailable — check API key]' }
        }));
        return;
      }
    }
    setAgentResponses(prev => ({ ...prev, [action.id]: { loading: false, text: prev[action.id]?.text || '' } }));
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Commercial Operations Review</h2>
          <p className="text-sm text-slate-400 mt-0.5">IBP cycle · MEIO recommendations · agent-surfaced decisions · daily planning dashboard</p>
        </div>
        <button onClick={() => setShowLegend(s => !s)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            showLegend ? 'bg-bcg-green/15 border-bcg-green/40 text-bcg-green' : 'bg-slate-card border-slate-border text-slate-400 hover:text-white'
          }`}>
          <Target className="w-3.5 h-3.5" />
          Status Guide
        </button>
      </div>

      {/* Legend (collapsible) */}
      {showLegend && <StatusLegend />}

      {/* KPI Strip */}
      <KPIStrip />

      {/* IBP Cycle */}
      <IBPCycleTracker />

      {/* Main grid */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <MEIOTable onSelectSku={onSelectSku} />
        </div>
        <div className="col-span-2">
          <AgentActionQueue
            agentResponses={agentResponses}
            expandedAction={expandedAction}
            onExpand={handleExpand}
            onFire={handleFire}
          />
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <LeverWaterfall />
        </div>
        <div className="col-span-2">
          <HotSpotPanel />
        </div>
      </div>

      {/* Operational Actions */}
      <OperationalActions
        showOps={showOps}
        setShowOps={setShowOps}
        opsTab={opsTab}
        setOpsTab={setOpsTab}
        fieldRequests={fieldRequests}
        setFieldRequests={setFieldRequests}
        rebalancing={rebalancing}
        setRebalancing={setRebalancing}
      />
    </div>
  );
}
