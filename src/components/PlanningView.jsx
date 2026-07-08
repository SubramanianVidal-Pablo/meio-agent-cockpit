import { useState, useRef } from 'react';
import {
  Target, Shield, TrendingDown, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, Info, Loader2, CheckCircle2, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
  ScatterChart, Scatter, ZAxis, Legend,
} from 'recharts';
import { runSimulation, getPortfolioSummary, optimizeInventory, SCENARIO_SS_MULT } from '../data/simulationEngine';
import { computeABCClass, ABC_META, ECHELON_META } from '../data/skuData';

const ECHELON_KEYS = Object.keys(ECHELON_META);

function fmt$(n) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(Math.abs(n));
}


const ABC_COLORS  = { A: '#0F766E', B: '#4F46E5', C: '#94A3B8' };

// ── ABC legend explanation ─────────────────────────────────────────────────────
function ABCLegend() {
  return (
    <div className="bg-white border border-border-light rounded-xl px-5 py-3 flex flex-col divide-y divide-border-light">
      {Object.entries(ABC_META).map(([cls, m]) => (
        <div key={cls} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
          <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-black" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>{cls}</span>
          <span className="font-semibold text-xs text-ink shrink-0 w-40">{m.label}</span>
          <span className="text-xs text-slate-500">{m.desc}</span>
        </div>
      ))}
    </div>
  );
}

// Decision colors — distinct from tier colors to avoid confusion
const DECISION_COLOR_MAP = { INCREASE: '#B45309', REDUCE: '#1D4ED8', MAINTAIN: '#166534' };

const SCENARIOS = [
  { id: 'baseline', label: 'Conservative', sub: 'Higher safety stock, risk-averse' },
  { id: 'reactive', label: 'Base',         sub: 'MEIO-recommended levels' },
  { id: 'proactive',label: 'Optimistic',   sub: 'Leaner inventory, stable assumptions' },
];

// ── Tooltip icon helper ───────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle">
      <Info
        className="w-3.5 h-3.5 text-muted cursor-pointer inline"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span className="absolute z-50 left-5 top-0 w-64 bg-ink text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

// ── MEIO Baseline section ─────────────────────────────────────────────────────
function MEIOBaseline({ skus, optimized, ssMultipliers }) {
  const [open, setOpen] = useState(false);

  const abcSkusBase  = computeABCClass(skus);
  const abcMapBase   = Object.fromEntries(abcSkusBase.map(s => [s.id, s.abcClass]));
  const tierSummary = ['A','B','C'].map(cls => {
    const group = abcSkusBase.filter(k => k.abcClass === cls);
    const totalMEIO    = group.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
    const totalCurrent = group.reduce((s, k) => s + k.onHand * k.unitCost, 0);
    const belowPct     = group.filter(k => k.currentSafetyStock < k.meioSafetyStock).length / (group.length || 1) * 100;
    const mult = typeof ssMultipliers === 'object' ? (ssMultipliers[cls] ?? 1.0) : (ssMultipliers ?? 1.0);
    return { cls, count: group.length, totalMEIO, totalCurrent, belowPct, mult };
  });

  // Inventory value: on-hand at cost vs MEIO target at cost — matches ToplineKPIs
  const totalMEIOVal  = skus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
  const totalCurrVal  = skus.reduce((s, k) => s + k.onHand * k.unitCost, 0);
  const gapVal        = totalMEIOVal - totalCurrVal;

  const chartData = [...abcSkusBase]
    .sort((a, b) => { const o = {A:0,B:1,C:2}; return (o[a.abcClass]??3)-(o[b.abcClass]??3); })
    .map(k => {
      const opt = optimized.find(o => o.id === k.id);
      return {
        id: k.id, name: k.name, tier: k.tier,
        current: k.currentSafetyStock, target: k.meioSafetyStock,
        decision: opt?.decision ?? 'MAINTAIN',
      };
    });

  const tooltipStyle = { contentStyle: { background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, fontSize:11 } };

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface transition-colors text-left">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-brand" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">
              MEIO Baseline — where do these targets come from?
            </div>
            <div className="text-xs text-muted mt-0.5">
              Multi-Echelon Inventory Optimisation · Z-score × demand σ × √lead-time · calibrated per SKU to service target
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex gap-4 text-xs">
            <span className="text-muted">Current inventory: <span className="font-semibold text-ink">{fmt$(totalCurrVal)}</span></span>
            <span className="text-muted">MEIO inventory target: <span className="font-semibold text-brand">{fmt$(totalMEIOVal)}</span></span>
            {gapVal > 0
              ? <span className="text-danger font-semibold">{fmt$(gapVal)} under target</span>
              : <span className="text-success font-semibold">{fmt$(Math.abs(gapVal))} over target</span>}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border-light px-5 pb-5 space-y-5">
          <div className="mt-4 bg-brand/5 border border-brand/20 rounded-xl px-4 py-3 flex gap-3">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-xs text-ink leading-relaxed">
              <span className="font-semibold">MEIO (Multi-Echelon Inventory Optimisation)</span> computes the statistically optimal
              safety stock for each SKU across the network. The formula is{' '}
              <span className="font-mono bg-white border border-border-light px-1 rounded">SS = Z × σ_demand × √lead-time</span>{' '}
              where Z is determined by the service target (e.g. Class A = 99.5% → Z = 2.58).
              Higher demand variability (CV) and longer lead times both increase the required buffer.
              The decisions — REDUCE, MAINTAIN, INCREASE — compare your <em>current</em> safety
              stock against these MEIO-derived targets, adjusted by your class multipliers.
            </div>
          </div>

          {/* Scenario selector within MEIO section */}
          <div className="bg-surface border border-border-light rounded-xl px-4 py-3">
            <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Risk Profile</div>
            <div className="flex gap-2 flex-wrap text-xs">
              {SCENARIOS.map(s => (
                <span key={s.id} className="flex flex-col px-3 py-1.5 rounded-lg bg-white border border-border-light">
                  <span className="font-bold text-ink">{s.label}</span>
                  <span className="text-faint text-[10px] mt-0.5">{s.sub}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {tierSummary.map(t => {
              const info  = ABC_META[t.cls];
              const color = ABC_COLORS[t.cls];
              return (
                <div key={t.cls} className="rounded-xl border p-3"
                  style={{ borderColor: info.border, background: info.bg }}>
                  <div className="text-xs font-bold mb-2" style={{ color }}>{info.label}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted">SKUs</span>
                      <span className="font-semibold text-ink">{t.count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">MEIO inv. target</span>
                      <span className="font-semibold text-ink">{fmt$(t.totalMEIO)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Current inventory</span>
                      <span className="font-semibold text-ink">{fmt$(t.totalCurrent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Below MEIO target</span>
                      <span className={`font-semibold ${t.belowPct > 50 ? 'text-danger' : t.belowPct > 25 ? 'text-warning' : 'text-success'}`}>
                        {t.belowPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">SS lever</span>
                      <span className="font-semibold" style={{ color }}>{t.mult.toFixed(1)}×</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-ink">Current Safety Stock vs MEIO Target — all SKUs by ABC Class</div>
                <div className="text-xs text-muted">Bar = current SS · pale overlay = MEIO target · colour = required action</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {Object.entries(DECISION_COLOR_MAP).map(([d, c]) => (
                  <span key={d} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="id" tick={{ fill: '#94A3B8', fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} />
                <Tooltip
                  {...tooltipStyle}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold text-ink">{d.id} — {d.name}</div>
                        <div className="text-muted mt-1">Current SS: <span className="font-semibold text-ink">{d.current.toLocaleString()}</span></div>
                        <div className="text-muted">MEIO target: <span className="font-semibold text-brand">{d.target.toLocaleString()}</span></div>
                        <div className="mt-1 font-semibold" style={{ color: DECISION_COLOR_MAP[d.decision] }}>→ {d.decision}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="current" radius={[3, 3, 0, 0]} name="Current SS">
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={DECISION_COLOR_MAP[entry.decision]} fillOpacity={0.75} />
                  ))}
                </Bar>
                <Bar dataKey="target" fill="#0F766E" fillOpacity={0.18} radius={[3, 3, 0, 0]} name="MEIO Target" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Controls bar ─────────────────────────────────────────────────────────────
function ControlBar({ scenario, setScenario }) {
  return (
    <div className="bg-white border border-border-light rounded-xl px-5 py-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide shrink-0 w-28">Risk Profile</div>
        <div className="flex gap-1.5 flex-wrap">
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setScenario(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                scenario === s.id
                  ? 'bg-brand text-white border-brand shadow-sm'
                  : 'bg-surface text-muted border-border-light hover:border-border-mid hover:text-ink'
              }`}>
              {s.label}
              <span className={`ml-1 text-[10px] font-normal ${scenario === s.id ? 'text-white/70' : 'text-faint'}`}>
                {s.sub}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Top-line KPI summary (6 cards, above all other content) ──────────────────

// Per-scenario KPI adjustment factors so all 6 cards shift directionally
// Conservative = higher buffers = more inventory held = more SKUs above lean thresholds
// Optimistic   = leaner targets = less inventory = more gap against those targets
const SCENARIO_KPI_ADJ = {
  baseline:  { inv: 1.12, doh: 1.12, instock: +2,  skusAboveDelta: +3, skusBelowDelta: -2 },
  reactive:  { inv: 1.0,  doh: 1.0,  instock:  0,  skusAboveDelta:  0, skusBelowDelta:  0 },
  proactive: { inv: 0.88, doh: 0.88, instock: -2,  skusAboveDelta: -3, skusBelowDelta: +2 },
};

function computeToplineKPIs(skus, scenario) {
  const ssMult = SCENARIO_SS_MULT[scenario] ?? 1.0;
  const target = k => k.meioSafetyStock * ssMult;

  const rawTotalInvValue = skus.reduce((s, k) => s + k.onHand * k.unitCost, 0);
  const wcOpportunity    = skus
    .filter(k => k.onHand > target(k))
    .reduce((s, k) => s + (k.onHand - target(k)) * k.unitCost, 0);
  const rawSkusAbove = skus.filter(k => k.onHand > target(k)).length;
  const rawSkusBelow = skus.filter(k => k.onHand < target(k)).length;

  // Weighted-average DoH (weight = onHand * unitCost), broken down by ABC class
  const abcSkus = computeABCClass(skus);
  let totalWeight = 0, weightedDoh = 0;
  const abcDoh = { A: { w: 0, d: 0 }, B: { w: 0, d: 0 }, C: { w: 0, d: 0 } };
  abcSkus.forEach(k => {
    const avgDailyDemand = k.monthlyDemand.reduce((a, b) => a + b, 0) / 12 / 30;
    const doh = avgDailyDemand > 0 ? k.onHand / avgDailyDemand : 0;
    const w   = k.onHand * k.unitCost;
    totalWeight  += w;
    weightedDoh  += doh * w;
    const cls = k.abcClass;
    if (abcDoh[cls]) { abcDoh[cls].w += w; abcDoh[cls].d += doh * w; }
  });
  const rawAvgDoh  = totalWeight > 0 ? weightedDoh / totalWeight : 0;
  const rawInStock = (skus.filter(k => k.onHand >= target(k)).length / skus.length) * 100;

  // Apply scenario adjustments so all 6 KPI cards shift directionally
  const adj = SCENARIO_KPI_ADJ[scenario] ?? SCENARIO_KPI_ADJ.reactive;
  const totalInvValue = rawTotalInvValue * adj.inv;
  const avgDoh        = rawAvgDoh * adj.doh;
  const inStockRate   = Math.min(100, Math.max(0, rawInStock + adj.instock));
  const skusAbove     = Math.max(0, rawSkusAbove + adj.skusAboveDelta);
  const skusBelow     = Math.max(0, rawSkusBelow + adj.skusBelowDelta);
  const tierAvgs = ['A','B','C'].map(c =>
    abcDoh[c].w > 0 ? Math.round(abcDoh[c].d / abcDoh[c].w * adj.doh) : 0
  );

  return { totalInvValue, wcOpportunity, skusAbove, skusBelow, avgDoh, tierAvgs, inStockRate };
}

function ToplineKPIs({ skus, scenario, lastRun }) {
  const m = computeToplineKPIs(skus, scenario);
  const total = skus.length;
  const IN_STOCK_TARGET = 98;

  const cards = [
    {
      id: 'inv',
      label: 'Total Inventory Value',
      value: `$${(m.totalInvValue / 1e6).toFixed(1)}M`,
      sub: 'Current on-hand at standard cost',
      color: '#0F172A',
      border: '#E2E8F0',
      bg: '#FFFFFF',
    },
    {
      id: 'wc',
      label: 'Working Capital Opportunity',
      value: `$${(m.wcOpportunity / 1e6).toFixed(1)}M`,
      sub: 'If all SKUs returned to MEIO target',
      color: '#166534',
      border: '#A7F3D0',
      bg: '#F0FDF4',
    },
    {
      id: 'above',
      label: 'SKUs Above Target',
      value: m.skusAbove,
      sub: `${m.skusAbove} SKUs — ${Math.round((m.skusAbove / total) * 100)}% of portfolio`,
      color: '#B45309',
      border: '#FDE68A',
      bg: '#FFFBEB',
    },
    {
      id: 'below',
      label: 'SKUs Below Target',
      value: m.skusBelow,
      sub: `${m.skusBelow} SKUs — ${Math.round((m.skusBelow / total) * 100)}% of portfolio`,
      color: '#DC2626',
      border: '#FCA5A5',
      bg: '#FEF2F2',
    },
    {
      id: 'doh',
      label: 'Avg. Days on Hand',
      value: `${Math.round(m.avgDoh)}d`,
      sub: `A: ${m.tierAvgs[0]}d · B: ${m.tierAvgs[1]}d · C: ${m.tierAvgs[2]}d`,
      color: '#4F46E5',
      border: '#C7D2FE',
      bg: '#EEF2FF',
    },
    {
      id: 'instock',
      label: 'In-Stock Rate',
      value: `${m.inStockRate.toFixed(1)}%`,
      sub: `vs. ${IN_STOCK_TARGET}% target`,
      color: m.inStockRate >= IN_STOCK_TARGET ? '#166534' : '#DC2626',
      border: m.inStockRate >= IN_STOCK_TARGET ? '#A7F3D0' : '#FCA5A5',
      bg:    m.inStockRate >= IN_STOCK_TARGET ? '#F0FDF4'  : '#FEF2F2',
    },
  ];

  return (
    <div className="bg-white border border-border-light rounded-xl p-4">
      {/* Card row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {cards.map(c => (
          <div
            key={c.id}
            className="rounded-xl border p-3 flex flex-col gap-1.5"
            style={{ background: c.bg, borderColor: c.border }}
          >
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">
              {c.label}
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-black leading-none" style={{ color: c.color }}>
                {c.value}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Timestamp row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">
          Based on MEIO run: <span className="font-semibold text-slate-500">{lastRun}</span>
        </span>
        <span className="text-[10px] text-slate-400 italic">
          All values update on Rerun MEIO
        </span>
      </div>
    </div>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────────
function KPIs({ summary, toReduce, toIncrease }) {
  const wcRelease = toReduce.reduce((s, x) => s + x.wcImpact, 0);
  const wcNeeded  = toIncrease.reduce((s, x) => s + Math.abs(x.wcImpact), 0);
  const net = wcRelease - wcNeeded;

  const tiles = [
    {
      label: 'SKUs at Risk',
      value: summary.skusAtRisk,
      sub: `worst month: ${summary.worstMonth}`,
      color: summary.skusAtRisk > 5 ? '#DC2626' : summary.skusAtRisk > 2 ? '#D97706' : '#059669',
      icon: AlertTriangle,
    },
    {
      label: 'Margin at Risk',
      value: fmt$(summary.totalMarginAtRisk),
      sub: `${summary.avgFulfillmentRate.toFixed(1)}% avg fulfillment`,
      color: summary.totalMarginAtRisk > 5e6 ? '#DC2626' : '#D97706',
      icon: TrendingDown,
    },
    {
      label: 'Working Capital Opportunity',
      value: fmt$(wcRelease),
      sub: `${toReduce.length} over-buffered SKUs`,
      color: '#059669',
      icon: TrendingUp,
      tooltip: 'Value of excess safety stock above MEIO target — inventory that can be converted back to cash by reducing stock levels',
    },
    {
      label: 'Net Working Capital Opportunity',
      value: fmt$(Math.abs(net)),
      sub: net >= 0 ? 'net saving after rebalance' : 'additional WC required',
      color: net >= 0 ? '#0F766E' : '#D97706',
      icon: Target,
      tooltip: 'Working capital release minus any investment needed to build up understocked SKUs — the net cash benefit across the portfolio',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="bg-white border border-border-light rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted flex items-center">
                {t.label}
                {t.tooltip && <InfoTip text={t.tooltip} />}
              </div>
              <Icon className="w-4 h-4" style={{ color: t.color }} />
            </div>
            <div className="text-2xl font-bold leading-none mb-1" style={{ color: t.color }}>{t.value}</div>
            <div className="text-xs text-faint">{t.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Model vs Actual Scatter Charts ────────────────────────────────────────────
function ModelVsActualCharts({ skus, optimized, onHighlight, echelonFilter, onEchelonChange }) {
  const abcSkus = computeABCClass(skus);
  const meta = ECHELON_META[echelonFilter];

  const allPoints = abcSkus.map(sku => {
    const avgMonthlyDemand = sku.monthlyDemand.reduce((a, b) => a + b, 0) / sku.monthlyDemand.length;
    const dailyDemand = avgMonthlyDemand / 30;
    const meioDoh    = dailyDemand > 0 ? sku.meioSafetyStock / dailyDemand : 0;
    const actualDoh  = dailyDemand > 0 ? sku.onHand / dailyDemand : 0;
    const annualRevenue = sku.unitRevenue * avgMonthlyDemand * 12;
    const invValue   = sku.onHand * sku.unitCost;
    const rawSize    = Math.sqrt(invValue / 50000);
    const dotSize    = Math.max(6, Math.min(20, rawSize));
    return {
      id: sku.id, name: sku.name, abcClass: sku.abcClass,
      echelon: sku.echelon ?? 'Fill-Finish',
      meioDoh:    Math.round(meioDoh * 10) / 10,
      actualDoh:  Math.round(actualDoh * 10) / 10,
      annualRevenue,
      invValue,
      demandVolCV: Math.round(sku.demandCV * 1000) / 10,
      dotSize,
      color: ABC_COLORS[sku.abcClass],
    };
  });

  // Filter to selected echelon
  const skuPoints = allPoints.filter(p => p.echelon === echelonFilter);

  const rawMaxDoh = Math.max(...skuPoints.map(p => Math.max(p.meioDoh, p.actualDoh)), 20);
  // Round up to nearest 20 to avoid fractional axis bounds
  const maxDoh = Math.ceil(rawMaxDoh / 20) * 20;

  // Group by ABC class for chart series
  const tierGroups = ['A','B','C'].map(cls => ({
    tier: cls,
    color: ABC_COLORS[cls],
    label: `Class ${cls}`,
    points: skuPoints.filter(p => p.abcClass === cls),
  }));

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    return (
      <circle
        cx={cx} cy={cy}
        r={payload.dotSize}
        fill={payload.color}
        fillOpacity={0.8}
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: 'pointer' }}
        onClick={() => onHighlight && onHighlight(payload.id)}
      />
    );
  };

  const CustomDot2 = (props) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    return (
      <circle
        cx={cx} cy={cy}
        r={payload.dotSize}
        fill={payload.color}
        fillOpacity={0.8}
        stroke="white"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Echelon tab header */}
      <div className="bg-white border border-border-light rounded-xl overflow-hidden">
        {/* Tab strip */}
        <div className="flex border-b border-border-light">
          {ECHELON_KEYS.map(key => {
            const m = ECHELON_META[key];
            const active = key === echelonFilter;
            return (
              <button
                key={key}
                onClick={() => onEchelonChange(key)}
                className={`flex-1 px-4 py-3 text-left transition-colors border-b-2 ${
                  active
                    ? 'border-b-2 bg-white'
                    : 'border-transparent hover:bg-surface'
                }`}
                style={{ borderBottomColor: active ? m.color : 'transparent' }}
              >
                <div className="text-xs font-bold" style={{ color: active ? m.color : '#64748B' }}>{m.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{m.sub}</div>
              </button>
            );
          })}
        </div>
        {/* Active echelon context note */}
        <div className="px-4 py-2.5 flex items-start gap-2" style={{ background: meta.bg }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
          <p className="text-xs leading-relaxed" style={{ color: meta.color }}>{meta.note}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Chart 1: MEIO Model vs Actual */}
        <div className="bg-white border border-border-light rounded-xl p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-ink">MEIO Model vs. Actual Inventory</div>
            <div className="text-xs text-muted mt-0.5 leading-relaxed">
              SKUs above the diagonal have excess inventory vs. MEIO target — working capital release opportunity. Below the line = at risk.
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis
                type="number" dataKey="meioDoh" name="MEIO Target (Days on Hand)"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                label={{ value: 'MEIO Target (Days on Hand)', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94A3B8' }}
                domain={[0, maxDoh]}
                tickCount={maxDoh / 20 + 1}
              />
              <YAxis
                type="number" dataKey="actualDoh" name="Actual Inventory (Days on Hand)"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                label={{ value: 'Actual (DoH)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94A3B8' }}
                domain={[0, maxDoh]}
              />
              <ZAxis range={[36, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const excess = d.actualDoh > d.meioDoh;
                  const inv = d.invValue >= 1e6
                    ? `$${(d.invValue/1e6).toFixed(1)}M`
                    : `$${(d.invValue/1e3).toFixed(0)}K`;
                  return (
                    <div className="bg-white border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
                      <div className="font-semibold text-ink">{d.id} — {d.name}</div>
                      <div className="text-slate-400 text-[10px] mb-1">Class {d.abcClass}</div>
                      <div className="text-muted">MEIO Target: <span className="font-semibold">{d.meioDoh} DoH</span></div>
                      <div className="text-muted">Actual: <span className="font-semibold">{d.actualDoh} DoH</span></div>
                      <div className="text-muted">Inventory Value: <span className="font-semibold">{inv}</span></div>
                      <div className={`mt-1 font-semibold ${excess ? 'text-amber-600' : 'text-danger'}`}>
                        {excess ? `+${(d.actualDoh - d.meioDoh).toFixed(1)} DoH excess` : `${(d.actualDoh - d.meioDoh).toFixed(1)} DoH shortfall`}
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: maxDoh, y: maxDoh }]}
                stroke="#94A3B8"
                strokeDasharray="6 4"
                label={{ value: 'On target', position: 'insideTopLeft', fontSize: 9, fill: '#94A3B8' }}
              />
              {tierGroups.map(tg => (
                <Scatter key={tg.tier} name={tg.label} data={tg.points} fill={tg.color} shape={<CustomDot />} />
              ))}
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>} />
            </ScatterChart>
          </ResponsiveContainer>
          {/* Bubble size legend */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <div className="flex gap-4 text-xs text-muted">
              <span className="text-amber-600 font-medium">↑ Above = excess</span>
              <span className="text-danger font-medium">↓ Below = at risk</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="flex items-center gap-1">
                <svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="#94A3B8" fillOpacity={0.6}/></svg>
                <svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="#94A3B8" fillOpacity={0.6}/></svg>
                Bubble size = Inventory Value ($)
              </span>
            </div>
          </div>
        </div>

        {/* Chart 2: Service Segmentation */}
        <div className="bg-white border border-border-light rounded-xl p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-ink">Service Segmentation — Differentiated Inventory Policy</div>
            <div className="text-xs text-muted mt-0.5 leading-relaxed">
              High-revenue, low-volatility SKUs warrant tighter safety stock. High-volatility SKUs need larger buffers regardless of revenue.
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis
                type="number" dataKey="demandVolCV" name="Demand Volatility (CV %)"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                label={{ value: 'Demand Volatility (CV %)', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94A3B8' }}
              />
              <YAxis
                type="number" dataKey="annualRevenue" name="Annual Revenue ($)"
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                tickFormatter={v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${(v/1e3).toFixed(0)}K`}
                label={{ value: 'Annual Revenue', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94A3B8' }}
              />
              <ZAxis range={[36, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const rev = d.annualRevenue >= 1e9 ? `$${(d.annualRevenue/1e9).toFixed(2)}B`
                    : d.annualRevenue >= 1e6 ? `$${(d.annualRevenue/1e6).toFixed(1)}M`
                    : `$${(d.annualRevenue/1e3).toFixed(0)}K`;
                  const inv = d.invValue >= 1e6
                    ? `$${(d.invValue/1e6).toFixed(1)}M`
                    : `$${(d.invValue/1e3).toFixed(0)}K`;
                  return (
                    <div className="bg-white border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
                      <div className="font-semibold text-ink">{d.id} — {d.name}</div>
                      <div className="text-slate-400 text-[10px] mb-1">Class {d.abcClass} · DoH {d.actualDoh}d</div>
                      <div className="text-muted">Demand CV: <span className="font-semibold">{d.demandVolCV}%</span></div>
                      <div className="text-muted">Annual Revenue: <span className="font-semibold">{rev}</span></div>
                      <div className="text-muted">Inventory Value: <span className="font-semibold">{inv}</span></div>
                    </div>
                  );
                }}
              />
              {tierGroups.map(tg => (
                <Scatter key={tg.tier} name={tg.label} data={tg.points} fill={tg.color} shape={<CustomDot2 />} />
              ))}
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-end mt-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="#94A3B8" fillOpacity={0.6}/></svg>
              <svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="#94A3B8" fillOpacity={0.6}/></svg>
              Bubble size = Inventory Value ($)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Action list ───────────────────────────────────────────────────────────────
function ActionList({ skus, optimized, scenario, summary }) {
  const abcOrder = { A: 0, B: 1, C: 2 };
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE').sort((a,b) => (abcOrder[a.abcClass]??3) - (abcOrder[b.abcClass]??3) || b.riskMonths - a.riskMonths);
  const toReduce   = optimized.filter(s => s.decision === 'REDUCE').sort((a,b) => b.wcImpact - a.wcImpact);
  const wcRelease  = toReduce.reduce((s,x) => s + x.wcImpact, 0);
  const wcNeeded   = toIncrease.reduce((s,x) => s + Math.abs(x.wcImpact), 0);
  const net = wcRelease - wcNeeded;

  const items = [];

  if (toIncrease.filter(s => s.abcClass === 'A').length > 0) {
    const t1 = toIncrease.filter(s => s.abcClass === 'A');
    items.push({
      color: '#0F766E', bg: '#F0FDFA', border: '#5EEAD4', Icon: Shield,
      title: `Protect ${t1.length} Class A SKU${t1.length > 1 ? 's' : ''}`,
      detail: t1.map(s => `${s.id}: +${Math.abs(s.delta).toLocaleString()} units`).join(' · '),
      impact: fmt$(t1.reduce((a,s) => a + Math.abs(s.wcImpact), 0)) + ' WC to add',
      owner: 'Supply Planning',
      dueBy: 'Immediate',
      action: 'Raise emergency PO with CMO; prioritise next available batch slot',
    });
  }

  if (toReduce.length > 0) {
    items.push({
      color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', Icon: TrendingDown,
      title: `Release ${fmt$(wcRelease)} from ${toReduce.length} over-buffered SKUs`,
      detail: toReduce.slice(0,3).map(s => `${s.id}: −${s.delta.toLocaleString()} units`).join(' · '),
      impact: 'Working capital freed for redeployment',
      owner: 'Finance / Planning',
      dueBy: 'This week',
      action: 'Submit stock reduction request to procurement; align with warehouse on drawdown schedule',
    });
  }

  if (net > 0) {
    items.push({
      color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', Icon: TrendingUp,
      title: `Net ${fmt$(net)} WC positive after rebalancing`,
      detail: 'Freed Class C SS funds Class A top-ups — no new budget needed',
      impact: 'Improved Class A coverage',
      owner: 'S&OP Lead',
      dueBy: 'Within 3–5 business days',
      action: 'Update S&OP model with rebalanced targets; reforecast and circulate to finance',
    });
  }

  if (scenario !== 'baseline') {
    const label = scenario === 'reactive' ? 'Base' : 'Optimistic';
    items.push({
      color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', Icon: AlertTriangle,
      title: scenario === 'reactive' ? `${label}: Review buffers against MEIO baseline` : `${label}: Validate lean buffers are sufficient`,
      detail: scenario === 'reactive'
        ? 'Base scenario uses MEIO-recommended levels — verify coverage before execution'
        : 'Optimistic assumes stable supply and demand — confirm with commercial team',
      impact: `${summary.skusAtRisk} SKUs at risk under this scenario`,
      owner: 'Procurement / CMO',
      dueBy: 'End of month',
      action: 'Review buffer levels with commercial team and validate demand/supply assumptions',
    });
  }

  items.push({
    color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', Icon: Target,
    title: `Short Class C first under capacity constraints`,
    detail: `${optimized.filter(s => s.abcClass === 'C' && s.riskMonths > 0).length} lower-revenue SKUs showing risk — accept partials to protect Class A`,
    impact: 'Frees CMO capacity for high-margin products',
    owner: 'Commercial Ops',
    dueBy: 'End of month',
    action: 'Activate shortage protocol; issue allocation guidance to customer service',
  });

  return (
    <div className="bg-white border border-border-light rounded-xl p-5 flex flex-col">
      <div className="text-sm font-semibold text-ink mb-0.5">This Cycle's Decisions</div>
      <div className="text-xs text-muted mb-4">Prioritised actions for the supply review</div>
      <div className="space-y-2.5 flex-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 rounded-xl border p-3.5" style={{ background: item.bg, borderColor: item.border }}>
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-black text-white text-xs"
              style={{ background: item.color }}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm text-ink leading-snug">{item.title}</div>
                <span className="shrink-0 text-[10px] text-muted bg-white border border-border-light rounded-full px-2 py-0.5 whitespace-nowrap">
                  {item.owner}
                </span>
              </div>
              <div className="text-xs text-muted mt-1 leading-relaxed">{item.detail}</div>
              <div className="text-xs font-semibold mt-1" style={{ color: item.color }}>→ {item.impact}</div>
              {/* Due By + Required Action */}
              <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-3" style={{ borderColor: item.border }}>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Due By</div>
                  <div className="text-xs font-semibold text-ink">{item.dueBy}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Required Action</div>
                  <div className="text-xs text-slate-600 leading-relaxed">{item.action}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Optimization table ────────────────────────────────────────────────────────
const DECISION_STYLE = {
  INCREASE: { bg: '#FFF7ED', text: '#B45309', label: '▲ INCREASE' },
  REDUCE:   { bg: '#EFF6FF', text: '#1D4ED8', label: '▼ REDUCE' },
  MAINTAIN: { bg: '#F0FDF4', text: '#166534', label: '◆ MAINTAIN' },
};

const PLANNER_ACTION_STYLE = {
  Expedite:  { bg: '#FEF2F2', text: '#DC2626', label: '🚨 Expedite' },
  Replenish: { bg: '#FFF7ED', text: '#B45309', label: '▲ Replenish' },
  Hold:      { bg: '#F0FDF4', text: '#166534', label: '◆ Hold' },
  Monitor:   { bg: '#EEF2FF', text: '#4F46E5', label: '◉ Monitor' },
  Reduce:    { bg: '#EFF6FF', text: '#1D4ED8', label: '▼ Reduce' },
};

function getPlannerAction(delta, meioSafetyStock) {
  const pct = meioSafetyStock > 0 ? delta / meioSafetyStock : 0;
  if (pct < -0.20) return 'Expedite';
  if (pct <  0)    return 'Replenish';
  if (pct <  0.05) return 'Hold';
  if (pct <  0.20) return 'Monitor';
  return 'Reduce';
}

function GapCell({ delta, meioSafetyStock, avgDailyDemand }) {
  const [show, setShow] = useState(false);
  const sign   = delta >= 0 ? '+' : '';
  const weeks  = avgDailyDemand > 0 ? Math.abs(delta) / (avgDailyDemand * 7) : 0;
  const wkStr  = weeks.toFixed(1);
  const color  = delta > 0 ? '#0F766E' : delta < 0 ? '#DC2626' : '#94A3B8';
  return (
    <td className="px-4 py-2.5 text-right relative"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="font-mono font-semibold cursor-help" style={{ color }}>
        {sign}{delta.toLocaleString()}
      </span>
      {show && (
        <div className="absolute z-50 right-full top-1/2 -translate-y-1/2 mr-2 w-48 bg-ink text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed whitespace-nowrap">
          <div className="font-semibold mb-1">Gap vs. MEIO Target</div>
          <div>{sign}{delta.toLocaleString()} units</div>
          <div>{delta >= 0 ? '+' : '−'}{wkStr} weeks of supply</div>
          <div className="text-slate-300 text-[10px] mt-1">
            {delta > 0 ? 'Above target — potential excess' : delta < 0 ? 'Below target — replenishment needed' : 'At target'}
          </div>
        </div>
      )}
    </td>
  );
}

const ACTION_SEVERITY = {
  Expedite:  { color: '#DC2626', label: 'EXPEDITE' },
  Replenish: { color: '#B45309', label: 'REPLENISH' },
  Reduce:    { color: '#1D4ED8', label: 'REDUCE' },
};

function OptimizationTable({ optimized, highlightedSku, onDecision }) {
  const [filter, setFilter] = useState('action');
  const [sort, setSort] = useState({ key: 'urgencyRank', dir: 1 });
  const [rowStates, setRowStates] = useState({});  // skuId → 'accepted' | 'deferred'
  const rowRefs = useRef({});

  function buildEntry(s, plannerAction, decision) {
    const sev  = ACTION_SEVERITY[plannerAction];
    const sign = s.delta >= 0 ? '+' : '';
    const wks  = s.avgDailyDemand > 0
      ? (Math.abs(s.delta) / (s.avgDailyDemand * 7)).toFixed(1)
      : '—';
    return {
      timestamp:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      decision,
      severity:       sev.label,
      severityColor:  decision === 'open' ? '#92400E' : sev.color,
      sigType:        decision === 'open' ? 'Inventory Decision Deferred' : 'Inventory Recommendation Accepted',
      affected:       `${s.id} — ${s.name}`,
      recommendation: `${plannerAction} ${Math.abs(s.delta).toLocaleString()} units (${sign}${wks} wks supply) to reach MEIO target · WC impact: ${s.wcImpact >= 0 ? '+' : ''}${fmt$(s.wcImpact)}`,
      openItem: {
        skuId:        s.id,
        skuName:      s.name,
        plannerAction,
        meioDelta:    s.delta,
        meioTarget:   s.meioSafetyStock,
        currentSS:    s.currentSafetyStock,
        wcImpact:     s.wcImpact,
        avgDailyDemand: s.avgDailyDemand ?? 0,
        resolved:     false,
      },
    };
  }

  function handleAccept(s) {
    if (rowStates[s.id]) return;
    const plannerAction = getPlannerAction(s.delta, s.meioSafetyStock);
    const sev = ACTION_SEVERITY[plannerAction];
    if (!sev || !onDecision) return;
    setRowStates(prev => ({ ...prev, [s.id]: 'accepted' }));
    onDecision(buildEntry(s, plannerAction, 'accepted'));
  }

  function handleDefer(s) {
    if (rowStates[s.id]) return;
    const plannerAction = getPlannerAction(s.delta, s.meioSafetyStock);
    const sev = ACTION_SEVERITY[plannerAction];
    if (!sev || !onDecision) return;
    setRowStates(prev => ({ ...prev, [s.id]: 'deferred' }));
    onDecision(buildEntry(s, plannerAction, 'open'));
  }

  const urgencyRank = { critical: 0, high: 1, medium: 2, low: 3 };

  const rows = optimized
    .filter(s => filter === 'all' || s.decision !== 'MAINTAIN')
    .map(s => ({ ...s, urgencyRank: urgencyRank[s.urgency] ?? 4 }))
    .sort((a, b) => {
      const v = sort.dir * (a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0);
      return v;
    });

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }

  function SortIcon({ col }) {
    if (sort.key !== col) return <span className="text-faint ml-0.5">↕</span>;
    return <span className="text-brand ml-0.5">{sort.dir === 1 ? '↑' : '↓'}</span>;
  }

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-light flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">SKU Inventory Optimization — Identify products where safety stock can be right-sized to release working capital</div>
          <div className="text-xs text-muted mt-0.5">MEIO-derived decisions · {rows.length} SKUs shown</div>
        </div>
        <div className="flex gap-1.5">
          {[['action', 'Actions only'], ['all', 'All SKUs']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors ${
                filter === id ? 'bg-brand text-white border-brand' : 'text-muted border-border-light hover:border-border-mid hover:text-ink'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface border-b border-border-light text-muted font-semibold">
              {[
                { label: 'Class',          key: 'abcClass' },
                { label: 'SKU',            key: 'id' },
                { label: 'Product',        key: 'name' },
                { label: 'Planner Action', key: 'decision' },
                { label: 'Current SS',     key: 'currentSafetyStock' },
                { label: 'MEIO Target',    key: 'meioSafetyStock' },
                { label: 'DoH',            key: 'doh' },
                { label: 'Gap vs. MEIO Target', key: 'delta' },
                { label: 'WC Impact',      key: 'wcImpact' },
                { label: '',              key: '_accept', noSort: true },
              ].map(col => (
                <th key={col.key}
                  onClick={() => !col.noSort && toggleSort(col.key)}
                  className={`px-4 py-2.5 text-left select-none whitespace-nowrap ${col.noSort ? '' : 'cursor-pointer hover:text-ink'}`}>
                  {col.label}{!col.noSort && <SortIcon col={col.key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const abcColor = ABC_COLORS[s.abcClass] ?? '#94A3B8';
              const isHighlighted = s.id === highlightedSku;
              const plannerAction = getPlannerAction(s.delta, s.meioSafetyStock);
              const pas = PLANNER_ACTION_STYLE[plannerAction];
              // Row color: green if onHand >= MEIO target, amber if below
              const isAboveTarget = (s.onHand ?? s.currentSafetyStock) >= s.meioSafetyStock;
              const rowBg = isHighlighted
                ? '#F0FDFA'
                : isAboveTarget ? '#F0FDF4' : '#FFFBEB';
              return (
                <tr
                  key={s.id}
                  ref={el => rowRefs.current[s.id] = el}
                  className="border-b border-border-light hover:brightness-95 transition-all"
                  style={Object.assign(
                    { background: rowBg },
                    isHighlighted ? { outline: '2px solid #0F766E', outlineOffset: -2 } : {}
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ color: abcColor, background: abcColor + '15', border: `1px solid ${abcColor}30` }}>{s.abcClass}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-ink">{s.id}</td>
                  <td className="px-4 py-2.5 text-ink">{s.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-bold text-[11px]" style={{ background: pas.bg, color: pas.text }}>{pas.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{s.currentSafetyStock.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted">{s.meioSafetyStock.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">
                    {s.doh != null && s.doh > 0 ? `${s.doh}d` : <span className="text-faint">—</span>}
                  </td>
                  <GapCell delta={s.delta} meioSafetyStock={s.meioSafetyStock} avgDailyDemand={s.avgDailyDemand ?? 0} />
                  <td className={`px-4 py-2.5 text-right font-semibold ${s.wcImpact > 0 ? 'text-success' : s.wcImpact < 0 ? 'text-danger' : 'text-muted'}`}>
                    {s.wcImpact > 0 ? '+' : ''}{fmt$(Math.abs(s.wcImpact))}
                  </td>
                  <td className="px-4 py-2.5">
                    {rowStates[s.id] === 'accepted' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" /> Accepted
                      </span>
                    ) : rowStates[s.id] === 'deferred' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                        <Clock className="w-3 h-3" /> Open Item
                      </span>
                    ) : ACTION_SEVERITY[plannerAction] ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleAccept(s)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap hover:opacity-80"
                          style={{ color: ACTION_SEVERITY[plannerAction].color, borderColor: ACTION_SEVERITY[plannerAction].color + '50', background: ACTION_SEVERITY[plannerAction].color + '10' }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDefer(s)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-amber-200 text-amber-700 bg-amber-50 transition-colors whitespace-nowrap hover:bg-amber-100"
                        >
                          Defer
                        </button>
                      </div>
                    ) : null}
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

// ── Root ─────────────────────────────────────────────────────────────────────
export default function PlanningView({ skus, scenario, setScenario, ssMultipliers, setSsMultipliers, onNavigate, onDecision }) {
  const [rerunState, setRerunState] = useState('idle'); // idle | running | done
  const [toast, setToast]           = useState('');
  const [highlightedSku, setHighlightedSku] = useState(null);
  const [echelonFilter, setEchelonFilter]   = useState('DS Manufacturing');
  const [lastRun, setLastRun] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  const tableRef = useRef(null);

  const simulated  = runSimulation(skus, scenario, ssMultipliers);
  const summary    = getPortfolioSummary(simulated);
  const abcSkus    = computeABCClass(skus);
  const abcMap     = Object.fromEntries(abcSkus.map(s => [s.id, s.abcClass]));
  const skuLookup  = Object.fromEntries(skus.map(k => [k.id, k]));

  // Augment optimized rows with DoH, onHand, and avgDailyDemand for the SKU table
  const optimized = optimizeInventory(skus, scenario, ssMultipliers).map(s => {
    const sku = skuLookup[s.id];
    const avgDailyDemand = sku
      ? sku.monthlyDemand.reduce((a, b) => a + b, 0) / 12 / 30
      : 0;
    const doh = avgDailyDemand > 0 ? Math.round((sku?.onHand ?? 0) / avgDailyDemand) : 0;
    return {
      ...s,
      abcClass: abcMap[s.id] ?? 'C',
      onHand: sku?.onHand ?? 0,
      doh,
      avgDailyDemand,
    };
  });

  const toReduce   = optimized.filter(s => s.decision === 'REDUCE');
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE');

  function handleRerunMEIO() {
    if (rerunState !== 'idle') return;
    setRerunState('running');
    setTimeout(() => {
      setRerunState('done');
      const now = new Date();
      setLastRun(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
      const nextQ = new Date(now);
      nextQ.setMonth(nextQ.getMonth() + 3);
      const opts = { year:'numeric', month:'long', day:'numeric' };
      setToast(`MEIO baseline updated — next quarterly run scheduled for ${nextQ.toLocaleDateString('en-US', opts)}`);
      setTimeout(() => { setRerunState('idle'); setToast(''); }, 4000);
    }, 1500);
  }

  function handleHighlight(skuId) {
    setHighlightedSku(skuId);
    // Scroll table into view
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  return (
    <div className="space-y-4 fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 bg-brand text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <span>✓</span> {toast}
        </div>
      )}

      {/* Page header */}
      <div className="bg-white border border-border-light rounded-xl px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-ink">Inventory Plan — MEIO-Driven Calculations</h1>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Baseline safety stock and inventory targets calculated by MEIO. Recalculate each quarter or after major demand/supply changes.
            </p>
          </div>
          <button
            onClick={handleRerunMEIO}
            disabled={rerunState === 'running'}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-semibold transition-opacity disabled:opacity-70"
            style={{ background: '#0F766E' }}
          >
            {rerunState === 'running' ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recalculating...</>
            ) : (
              <>⟳ Rerun MEIO</>
            )}
          </button>
        </div>
      </div>

      {/* Controls */}
      <ControlBar scenario={scenario} setScenario={setScenario} />

      {/* MEIO baseline — collapsible */}
      <MEIOBaseline skus={skus} optimized={optimized} ssMultipliers={ssMultipliers} />


      {/* Top-line KPI summary — 6 cards */}
      <ToplineKPIs skus={skus} scenario={scenario} lastRun={lastRun} />

      {/* ABC classification legend */}
      <ABCLegend />

      {/* Model vs Actual scatter charts — split by echelon */}
      <ModelVsActualCharts
        skus={skus}
        optimized={optimized}
        onHighlight={handleHighlight}
        echelonFilter={echelonFilter}
        onEchelonChange={setEchelonFilter}
      />

      {/* Full optimisation table */}
      <div ref={tableRef}>
        <OptimizationTable optimized={optimized} highlightedSku={highlightedSku} onDecision={onDecision} />
      </div>

    </div>
  );
}
