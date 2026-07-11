import { useState, useRef } from 'react';
import {
  Target, Shield, TrendingDown, TrendingUp, AlertTriangle, Activity,
  ChevronDown, ChevronUp, Info, Loader2, CheckCircle2, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
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
const DECISION_COLOR_MAP = { INCREASE: '#B45309', REDUCE: '#1D4ED8' };

const SCENARIOS = [
  { id: 'baseline', label: 'Conservative', sub: 'Higher safety stock, risk-averse' },
  { id: 'reactive', label: 'Base',         sub: 'MEIO-recommended levels' },
  { id: 'proactive',label: 'Optimistic',   sub: 'Leaner inventory, stable assumptions' },
];

// ── MEIO range multipliers ────────────────────────────────────────────────────
const MEIO_RANGE_MIN_MULT = 0.80;
const MEIO_RANGE_MAX_MULT = 1.30;

// ── MEIO Range Bar ────────────────────────────────────────────────────────────
// Renders a horizontal min–max range bar with a ▲ current marker.
// compact = true → smaller version for table cells
function MeioRangeBar({ meioTarget, current, compact = false }) {
  const rangeMin = meioTarget * MEIO_RANGE_MIN_MULT;
  const rangeMax = meioTarget * MEIO_RANGE_MAX_MULT;
  const inRange  = current >= rangeMin && current <= rangeMax;
  const markerColor = inRange ? '#15803D' : '#DC2626';

  // Clamp marker position [0–100%] within the displayed window
  const totalWindow = rangeMax * 1.15; // add 15% right padding
  const clamp = v => Math.max(0, Math.min(100, (v / totalWindow) * 100));
  const markerPct = clamp(current);
  const barLeft   = clamp(rangeMin);
  const barWidth  = clamp(rangeMax) - barLeft;

  const height = compact ? 'h-3' : 'h-4';
  const textSz = compact ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className={`flex flex-col gap-0.5 ${compact ? 'w-28' : 'w-40'}`}>
      {/* Track */}
      <div className={`relative w-full ${height} bg-slate-100 rounded-full overflow-visible`}>
        {/* Range band */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-brand/20 border border-brand/30"
          style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
        />
        {/* Current marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[8px] font-black leading-none select-none"
          style={{ left: `${markerPct}%`, color: markerColor }}
          title={`Current: ${current.toLocaleString()} | Range: ${Math.round(rangeMin).toLocaleString()} – ${Math.round(rangeMax).toLocaleString()}`}
        >▲</div>
      </div>
      {/* Labels */}
      <div className={`flex justify-between ${textSz} text-slate-400 font-mono leading-none`}>
        <span>{Math.round(rangeMin).toLocaleString()}</span>
        <span className={`font-semibold ${inRange ? 'text-green-700' : 'text-red-600'}`}>
          {current.toLocaleString()}
        </span>
        <span>{Math.round(rangeMax).toLocaleString()}</span>
      </div>
    </div>
  );
}

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
function MEIOBaseline({ skus, optimized, ssMultipliers, scenario }) {
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

  // Inventory value: on-hand at cost vs MEIO range
  const totalMEIOVal  = skus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
  const totalCurrVal  = skus.reduce((s, k) => s + k.onHand * k.unitCost, 0);
  const gapVal        = totalMEIOVal - totalCurrVal;

  const chartData = [...abcSkusBase]
    .sort((a, b) => { const o = {A:0,B:1,C:2}; return (o[a.abcClass]??3)-(o[b.abcClass]??3); })
    .map(k => {
      const opt = optimized.find(o => o.id === k.id);
      const rangeMin = Math.round(k.meioSafetyStock * MEIO_RANGE_MIN_MULT);
      const rangeMax = Math.round(k.meioSafetyStock * MEIO_RANGE_MAX_MULT);
      return {
        id: k.id, name: k.name, tier: k.tier,
        current: k.currentSafetyStock,
        onHand: k.onHand ?? k.currentSafetyStock,
        rangeMin, rangeBand: rangeMax - rangeMin,
        rangeMax,
        decision: opt?.decision ?? 'INCREASE',
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
              The decisions — REDUCE, INCREASE — compare your <em>current</em> safety
              stock against these MEIO-derived targets, adjusted by your class multipliers.
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
                      <span className="text-muted">MEIO range</span>
                      <span className="font-semibold text-ink">{fmt$(t.totalMEIO * MEIO_RANGE_MIN_MULT)}–{fmt$(t.totalMEIO * MEIO_RANGE_MAX_MULT)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Current inventory</span>
                      <span className="font-semibold text-ink">{fmt$(t.totalCurrent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Below MEIO range</span>
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
                <div className="text-sm font-semibold text-ink">Current Safety Stock vs MEIO Range — all SKUs by ABC Class</div>
                <div className="text-xs text-muted">Bar = current SS · teal band = MEIO range (−20% / +30%) · colour = required action</div>
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
                        <div className="text-muted">MEIO range: <span className="font-semibold text-brand">{d.rangeMin.toLocaleString()} – {d.rangeMax.toLocaleString()}</span></div>
                        <div className="mt-1 font-semibold" style={{ color: DECISION_COLOR_MAP[d.decision] }}>→ {d.decision}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="current" radius={[3, 3, 0, 0]} name="Current SS" zIndex={2}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={DECISION_COLOR_MAP[entry.decision]} fillOpacity={0.75} />
                  ))}
                </Bar>
                <Bar dataKey="rangeMin" stackId="range" fill="transparent" name="" legendType="none" />
                <Bar dataKey="rangeBand" stackId="range" fill="#0F766E" fillOpacity={0.18} radius={[3, 3, 0, 0]} name="MEIO Range" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top-line KPI summary (6 cards, above all other content) ──────────────────

function computeToplineKPIs(skus) {
  // MEIO range multipliers (same as MeioRangeBar)
  const MIN_M = MEIO_RANGE_MIN_MULT;   // 0.80
  const MAX_M = MEIO_RANGE_MAX_MULT;   // 1.30

  const abcSkus = computeABCClass(skus);

  // --- Inventory value ---
  const totalInvValue   = skus.reduce((s, k) => s + k.onHand * k.unitCost, 0);
  const meioInvValue    = skus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
  const invRangeMin     = meioInvValue * MIN_M;
  const invRangeMax     = meioInvValue * MAX_M;

  // --- Working Capital Opportunity (excess above MEIO range max) ---
  const wcOpportunity   = skus
    .filter(k => k.onHand > k.meioSafetyStock * MAX_M)
    .reduce((s, k) => s + (k.onHand - k.meioSafetyStock * MAX_M) * k.unitCost, 0);
  // WC target = $0 (ideal); range = [0, meioInvValue * (MAX_M - 1)]
  const wcRangeMin = 0;
  const wcRangeMax = meioInvValue * (MAX_M - 1);   // ~30% of MEIO value = theoretical max release

  // --- SKUs outside MEIO range ---
  const skusAbove = skus.filter(k => k.onHand > k.meioSafetyStock * MAX_M).length;
  const skusBelow = skus.filter(k => k.onHand < k.meioSafetyStock * MIN_M).length;
  const skusInRange = skus.length - skusAbove - skusBelow;

  // --- Avg DoH (weighted by inv value) ---
  let totalWeight = 0, weightedDoh = 0, meioWeightedDoh = 0;
  const abcDoh = { A: { w: 0, d: 0 }, B: { w: 0, d: 0 }, C: { w: 0, d: 0 } };
  abcSkus.forEach(k => {
    const avgDailyDemand = k.monthlyDemand.reduce((a, b) => a + b, 0) / 12 / 30;
    const doh     = avgDailyDemand > 0 ? k.onHand           / avgDailyDemand : 0;
    const meioDoh = avgDailyDemand > 0 ? k.meioSafetyStock  / avgDailyDemand : 0;
    const w = k.onHand * k.unitCost;
    totalWeight     += w;
    weightedDoh     += doh * w;
    meioWeightedDoh += meioDoh * w;
    const cls = k.abcClass;
    if (abcDoh[cls]) { abcDoh[cls].w += w; abcDoh[cls].d += doh * w; }
  });
  const avgDoh      = totalWeight > 0 ? weightedDoh / totalWeight : 0;
  const meioAvgDoh  = totalWeight > 0 ? meioWeightedDoh / totalWeight : 0;
  const dohRangeMin = meioAvgDoh * MIN_M;
  const dohRangeMax = meioAvgDoh * MAX_M;
  const tierAvgs = ['A','B','C'].map(c =>
    abcDoh[c].w > 0 ? Math.round(abcDoh[c].d / abcDoh[c].w) : 0
  );

  // --- In-stock rate (SKUs where onHand >= meioSS × MIN_M) ---
  const inStockRate  = (skus.filter(k => k.onHand >= k.meioSafetyStock * MIN_M).length / skus.length) * 100;
  // Target: 98%; range floor = 95%, ceiling = 100%
  const isrRangeMin  = 95;
  const isrRangeMax  = 100;

  return {
    totalInvValue, meioInvValue, invRangeMin, invRangeMax,
    wcOpportunity, wcRangeMin, wcRangeMax,
    skusAbove, skusBelow, skusInRange,
    avgDoh, meioAvgDoh, dohRangeMin, dohRangeMax, tierAvgs,
    inStockRate, isrRangeMin, isrRangeMax,
  };
}

// Inline KPI range bar used inside each summary card
function KpiRangeBar({ current, rangeMin, rangeMax, formatFn, lowerBetter = false }) {
  const inRange = current >= rangeMin && current <= rangeMax;
  const markerColor = inRange ? '#15803D' : '#DC2626';

  // Window: extend 10% beyond range for visual breathing room
  const window = rangeMax * 1.1;
  const clamp  = v => Math.max(0, Math.min(100, (v / window) * 100));
  const bandLeft  = clamp(rangeMin);
  const bandWidth = clamp(rangeMax) - bandLeft;
  const markerPct = clamp(current);

  const f = formatFn ?? (v => v.toLocaleString());

  let statusText = 'within range';
  if (current > rangeMax) {
    const over = current - rangeMax;
    statusText = `${f(over)} ${lowerBetter ? 'above target' : 'above range'}`;
  } else if (current < rangeMin) {
    const under = rangeMin - current;
    statusText = `${f(under)} below range`;
  }

  const tooltipText = `MEIO range: ${f(rangeMin)} – ${f(rangeMax)}\nCurrent: ${f(current)} — ${statusText}`;

  return (
    <div className="w-full mt-2" title={tooltipText}>
      {/* Track */}
      <div className="relative w-full h-3 bg-slate-100 rounded-full">
        {/* Range band */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-brand/20 border border-brand/30"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        {/* Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[8px] font-black leading-none select-none"
          style={{ left: `${markerPct}%`, color: markerColor }}
        >▲</div>
      </div>
      {/* Min / max labels */}
      <div className="flex justify-between text-xs text-slate-500 font-semibold mt-1 leading-none">
        <span>{f(rangeMin)}</span>
        <span>{f(rangeMax)}</span>
      </div>
      {/* Status line */}
      <div className={`text-xs mt-1 font-semibold leading-tight ${inRange ? 'text-green-700' : lowerBetter ? 'text-amber-600' : 'text-red-600'}`}>
        MEIO range: {f(rangeMin)} – {f(rangeMax)} · {statusText}
      </div>
    </div>
  );
}

function ToplineKPIs({ skus, lastRun }) {
  const m = computeToplineKPIs(skus);
  const total = skus.length;

  // Format helpers
  const fmtM  = v => `$${(v / 1e6).toFixed(1)}M`;
  const fmtPct = v => `${v.toFixed(1)}%`;
  const fmtDays = v => `${Math.round(v)}d`;

  return (
    <div className="bg-white border border-border-light rounded-xl p-4 space-y-3">
      {/* Card row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

        {/* 1. Total Inventory Value */}
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total Inventory Value</div>
          <div className="text-2xl font-black text-slate-900 leading-none mt-1">{fmtM(m.totalInvValue)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Current on-hand at standard cost</div>
          <KpiRangeBar
            current={m.totalInvValue}
            rangeMin={m.invRangeMin}
            rangeMax={m.invRangeMax}
            formatFn={fmtM}
          />
        </div>

        {/* 2. Working Capital Opportunity */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Working Capital Opportunity</div>
          <div className="text-2xl font-black text-emerald-800 leading-none mt-1">{fmtM(m.wcOpportunity)}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Excess above MEIO range ceiling</div>
          <KpiRangeBar
            current={m.wcOpportunity}
            rangeMin={m.wcRangeMin}
            rangeMax={m.wcRangeMax}
            formatFn={fmtM}
            lowerBetter
          />
        </div>

        {/* 3. SKUs in MEIO Range */}
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
          <div className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide">SKUs in MEIO Range</div>
          <div className="text-2xl font-black text-teal-800 leading-none mt-1">{m.skusInRange} <span className="text-sm font-semibold text-teal-600">/ {total}</span></div>
          <div className="text-[10px] text-teal-600 mt-0.5">{m.skusAbove} above ceiling · {m.skusBelow} below floor</div>
          <KpiRangeBar
            current={m.skusInRange}
            rangeMin={Math.round(total * 0.7)}
            rangeMax={total}
            formatFn={v => `${Math.round(v)} SKUs`}
          />
        </div>

        {/* 4. SKUs Needing Action */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">SKUs Needing Action</div>
          <div className="text-2xl font-black text-amber-800 leading-none mt-1">{m.skusAbove + m.skusBelow}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">
            {m.skusAbove} above MEIO ceiling · {m.skusBelow} below floor
          </div>
          <KpiRangeBar
            current={m.skusAbove + m.skusBelow}
            rangeMin={0}
            rangeMax={Math.max(4, Math.round(total * 0.3))}
            formatFn={v => `${Math.round(v)} SKUs`}
            lowerBetter
          />
        </div>

        {/* 5. Avg. Days on Hand */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <div className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">Avg. Days on Hand</div>
          <div className="text-2xl font-black text-indigo-800 leading-none mt-1">{fmtDays(m.avgDoh)}</div>
          <div className="text-[10px] text-indigo-600 mt-0.5">A: {m.tierAvgs[0]}d · B: {m.tierAvgs[1]}d · C: {m.tierAvgs[2]}d</div>
          <KpiRangeBar
            current={m.avgDoh}
            rangeMin={m.dohRangeMin}
            rangeMax={m.dohRangeMax}
            formatFn={fmtDays}
          />
        </div>

        {/* 6. In-Stock Rate */}
        {(() => {
          const ok = m.inStockRate >= m.isrRangeMin;
          return (
            <div className={`rounded-xl border p-3 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${ok ? 'text-green-700' : 'text-red-700'}`}>In-Stock Rate</div>
              <div className={`text-2xl font-black leading-none mt-1 ${ok ? 'text-green-800' : 'text-red-800'}`}>{fmtPct(m.inStockRate)}</div>
              <div className={`text-[10px] mt-0.5 ${ok ? 'text-green-600' : 'text-red-600'}`}>vs. 98% policy target</div>
              <KpiRangeBar
                current={m.inStockRate}
                rangeMin={m.isrRangeMin}
                rangeMax={m.isrRangeMax}
                formatFn={fmtPct}
              />
            </div>
          );
        })()}

      </div>

      {/* Timestamp row */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
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

// ── Inventory Analysis (Service Segmentation + MEIO scatter + SKU table) ──────
// ── Inventory Analysis helpers ────────────────────────────────────────────────
const METRIC_TYPES = [
  { id: 'inv', label: '$M Value' },
  { id: 'doh', label: 'Days of Supply' },
  { id: 'qty', label: 'Quantity' },
];

function IAFilterSection({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-700"
      >
        {title}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function IACheckbox({ checked, indeterminate, onChange, label, color, count }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
      <input
        type="checkbox" checked={checked} onChange={onChange}
        ref={el => { if (el) el.indeterminate = !!indeterminate; }}
        className="rounded border-slate-300 w-3 h-3 shrink-0 accent-teal-600"
      />
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
      <span className="text-xs text-slate-600 flex-1 truncate">{label}</span>
      {count != null && <span className="text-[10px] text-slate-400 shrink-0">{count}</span>}
    </label>
  );
}

function IAScatterDot({ cx, cy, payload }) {
  if (!cx || !cy) return null;
  return (
    <circle cx={cx} cy={cy} r={payload.dotSize}
      fill={payload.color} fillOpacity={0.82}
      stroke="white" strokeWidth={1.5}
      style={{ cursor: 'pointer' }}
    />
  );
}

// ── "If you institute the changes" summary bar ────────────────────────────────
function ImpactSummaryBar({ allPoints }) {
  const [groupBy, setGroupBy] = useState('class');

  const buildRows = () => {
    // Post-change = MEIO target for ALL SKUs (consistent with Portfolio Totals MEIO Model Output)
    const SL_TARGETS = { A: 99.5, B: 98.0, C: 95.0 };
    const calcSL = (actualQty, meioQty, target) => {
      const ratio = meioQty > 0 ? actualQty / meioQty : 1;
      return ratio >= 1 ? target : target * Math.pow(ratio, 0.3);
    };

    if (groupBy === 'class') {
      return ['A', 'B', 'C'].map(cls => {
        const group = allPoints.filter(p => p.abcClass === cls);
        const target = SL_TARGETS[cls] ?? 95;
        const currentInv   = group.reduce((s, p) => s + p.invValue, 0);
        const currentInTgt = group.filter(p => p.actualQty >= p.meioQty * MEIO_RANGE_MIN_MULT && p.actualQty <= p.meioQty * MEIO_RANGE_MAX_MULT).length;
        const newInv = group.reduce((s, p) => {
          const unitCost = p.actualQty > 0 ? p.invValue / p.actualQty : 0;
          return s + p.meioQty * unitCost;
        }, 0);
        const newInTgt = group.length;
        const totalVal = group.reduce((s, p) => s + p.invValue, 0) || 1;
        const currentSL = group.reduce((s, p) => s + calcSL(p.actualQty, p.meioQty, target) * p.invValue, 0) / totalVal;
        const targetSL  = target;
        return { label: `Class ${cls}`, color: ABC_COLORS[cls], total: group.length, currentInv, newInv, wcDelta: newInv - currentInv, currentInTgt, newInTgt, currentSL, targetSL, decision: null };
      });
    }
    return [...allPoints]
      .sort((a, b) => Math.abs(b.meioWcImpact) - Math.abs(a.meioWcImpact))
      .map((p, i) => {
        const unitCost = p.actualQty > 0 ? p.invValue / p.actualQty : 0;
        const newInv   = p.meioQty * unitCost;
        const currentInTgt = (p.actualQty >= p.meioQty * MEIO_RANGE_MIN_MULT && p.actualQty <= p.meioQty * MEIO_RANGE_MAX_MULT) ? 1 : 0;
        const target = SL_TARGETS[p.abcClass] ?? 95;
        const currentSL = calcSL(p.actualQty, p.meioQty, target);
        return { label: `#${i + 1} ${p.id}`, sublabel: p.name, color: DECISION_COLOR_MAP[p.decision] ?? '#94A3B8', total: 1, currentInv: p.invValue, newInv, wcDelta: newInv - p.invValue, currentInTgt, newInTgt: 1, currentSL, targetSL: target, decision: p.decision };
      });
  };

  const rows = buildRows();
  const totalCurrentInv  = rows.reduce((s, r) => s + r.currentInv, 0);
  const totalNewInv      = rows.reduce((s, r) => s + r.newInv, 0);
  const totalWcDelta     = totalNewInv - totalCurrentInv;
  const totalCurrentInTgt = rows.reduce((s, r) => s + r.currentInTgt, 0);
  const totalNewInTgt    = rows.reduce((s, r) => s + r.newInTgt, 0);
  const totalSkus        = allPoints.length;

  const fmtInv   = v => { const a = Math.abs(v); return a >= 1e6 ? `$${(a/1e6).toFixed(1)}M` : `$${(a/1e3).toFixed(0)}K`; };
  const fmtDelta = v => (v >= 0 ? '+' : '−') + fmtInv(v);

  return (
    <div className="border-t border-border-light">
      <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-indigo-800 shrink-0">If you institute all model changes →</span>
          <span className="text-[10px] text-indigo-500">All SKUs moved to MEIO recommended level · matches Portfolio Totals above</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#818CF8', fontWeight: 500 }}>Group by</span>
          <div style={{ display: 'flex', background: '#EEF2FF', borderRadius: 8, padding: 3, gap: 3, border: '1px solid #C7D2FE' }}>
            <button onClick={() => setGroupBy('class')} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: groupBy === 'class' ? '#4F46E5' : 'transparent',
              color: groupBy === 'class' ? '#fff' : '#6366F1',
            }}>ABC Class</button>
            <button onClick={() => setGroupBy('rank')} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: groupBy === 'rank' ? '#4F46E5' : 'transparent',
              color: groupBy === 'rank' ? '#fff' : '#6366F1',
            }}>By SKU</button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-indigo-50/60 border-b border-indigo-100 text-indigo-700">
              <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wide">{groupBy === 'class' ? 'Class' : 'SKU'}</th>
              {groupBy === 'rank' && <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wide">Suggested Action</th>}
              <th className="text-right px-4 py-2 leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-wide">Current inv. value</div>
                <div className="text-[9px] font-normal text-indigo-400 normal-case tracking-normal">actual on-hand × unit cost today</div>
              </th>
              <th className="text-right px-4 py-2 leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-wide">Post-change inv. value</div>
                <div className="text-[9px] font-normal text-indigo-400 normal-case tracking-normal">MEIO recommended × unit cost (all SKUs)</div>
              </th>
              <th className="text-right px-4 py-2 leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-wide">WC impact</div>
                <div className="text-[9px] font-normal text-indigo-400 normal-case tracking-normal">post-change minus current inv. value</div>
              </th>
              <th className="text-right px-4 py-2 leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-wide">Service level impact</div>
                <div className="text-[9px] font-normal text-indigo-400 normal-case tracking-normal">current → post-MEIO target</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-50">
            {rows.map((r, i) => (
              <tr key={r.label} className={i % 2 === 0 ? 'bg-white' : 'bg-indigo-50/20'}>
                <td className="px-4 py-2.5">
                  <span className="font-bold text-[11px]" style={{ color: r.color }}>{r.label}</span>
                  {r.sublabel && <span className="ml-1.5 text-[10px] text-slate-400 truncate">{r.sublabel}</span>}
                </td>
                {groupBy === 'rank' && (
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ color: r.color, background: r.color + '18', border: `1px solid ${r.color}35` }}>
                      {r.decision}
                    </span>
                  </td>
                )}
                <td className="px-4 py-2.5 text-right font-mono text-slate-500">{fmtInv(r.currentInv)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink">{fmtInv(r.newInv)}</td>
                <td className="px-4 py-2.5 text-right font-bold font-mono" style={{ color: r.wcDelta <= 0 ? '#0F766E' : '#DC2626' }}>
                  {fmtDelta(r.wcDelta)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-slate-500">{r.currentSL?.toFixed(1)}%</span>
                  <span className="text-slate-400 mx-1">→</span>
                  <span className="font-semibold text-teal-700">{r.targetSL?.toFixed(1)}%</span>
                  {r.targetSL > r.currentSL && (
                    <span className="ml-1 text-[10px] text-teal-600 font-semibold">+{(r.targetSL - r.currentSL).toFixed(1)}pp</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-indigo-100/70 border-t-2 border-indigo-200 font-bold text-indigo-900">
              <td className="px-4 py-2.5 text-[11px]" colSpan={groupBy === 'rank' ? 2 : 1}>Portfolio total</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-600">{fmtInv(totalCurrentInv)}</td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtInv(totalNewInv)}</td>
              <td className="px-4 py-2.5 text-right font-bold font-mono" style={{ color: totalWcDelta <= 0 ? '#0F766E' : '#DC2626' }}>
                {fmtDelta(totalWcDelta)}
              </td>
              <td className="px-4 py-2.5 text-right text-[11px] text-indigo-700">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Inventory Analysis — Tableau-style Model Results ──────────────────────────
function InventoryAnalysis({ skus, optimized, onDecision, rowStates, onRowStateChange }) {
  const [open, setOpen]           = useState(true);
  const [metricType, setMetricType] = useState('inv');
  const [tableOpen, setTableOpen] = useState(false);
  const [expandedEchelons, setExpandedEchelons] = useState(
    Object.fromEntries(ECHELON_KEYS.map(k => [k, true]))
  );

  // Exclusion filters — empty Set = show all
  const [excDecisions, setExcDecisions] = useState(new Set());
  const [excClasses,   setExcClasses]   = useState(new Set());
  const [excSites,     setExcSites]     = useState(new Set());
  const [excProducts,  setExcProducts]  = useState(new Set());

  const abcSkus = computeABCClass(skus);

  // Build point data
  const allPoints = abcSkus.map(sku => {
    const avgMonthlyDemand = sku.monthlyDemand.reduce((a, b) => a + b, 0) / sku.monthlyDemand.length;
    const dailyDemand  = avgMonthlyDemand / 30;
    const meioDoh      = dailyDemand > 0 ? sku.meioSafetyStock / dailyDemand : 0;
    const actualDoh    = dailyDemand > 0 ? sku.onHand           / dailyDemand : 0;
    const invValue     = sku.onHand            * sku.unitCost;
    const meioInvValue = sku.meioSafetyStock   * sku.unitCost;
    const dotSize      = Math.max(6, Math.min(20, Math.sqrt(invValue / 50000)));
    const opt          = optimized.find(o => o.id === sku.id);
    // Derive decision from actual vs MEIO so it matches the scatter chart position
    const ratio = sku.meioSafetyStock > 0 ? sku.onHand / sku.meioSafetyStock : 1;
    const decision = ratio > 1.00 ? 'REDUCE' : 'INCREASE';
    return {
      id: sku.id, name: sku.name, abcClass: sku.abcClass,
      echelon:      sku.echelon ?? 'Fill-Finish',
      actualQty:    sku.onHand,
      meioQty:      sku.meioSafetyStock,
      actualDoh:    Math.round(actualDoh  * 10) / 10,
      meioDoh:      Math.round(meioDoh    * 10) / 10,
      invValue,     meioInvValue,
      decision,
      meioDelta:    opt?.delta     ?? 0,
      meioWcImpact: opt?.wcImpact  ?? 0,
      color:        DECISION_COLOR_MAP[decision] ?? '#94A3B8',
      dotSize,
    };
  });

  // ── Metric helpers ───────────────────────────────────────────────────────────
  const getVals = p => {
    if (metricType === 'qty') return { model: p.meioQty,      actual: p.actualQty,  change: p.meioQty      - p.actualQty  };
    if (metricType === 'doh') return { model: p.meioDoh,      actual: p.actualDoh,  change: p.meioDoh      - p.actualDoh  };
    return                           { model: p.meioInvValue, actual: p.invValue,   change: p.meioInvValue - p.invValue   };
  };

  const fmtV = v => {
    if (metricType === 'qty') return Math.round(Math.abs(v)).toLocaleString();
    if (metricType === 'doh') return `${Math.abs(v).toFixed(1)}d`;
    const a = Math.abs(v);
    return a >= 1e6 ? `$${(a/1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a/1e3).toFixed(0)}K` : `$${Math.round(a)}`;
  };

  const fmtSigned = v => (v >= 0 ? '+' : '−') + fmtV(v);
  const axisLabel = metricType === 'qty' ? 'Units' : metricType === 'doh' ? 'Days on Hand' : 'Inventory Value';

  // ── Apply exclusion filters ───────────────────────────────────────────────────
  const visiblePoints = allPoints.filter(p =>
    !excDecisions.has(p.decision) &&
    !excClasses.has(p.abcClass)   &&
    !excSites.has(p.id)           &&
    !excProducts.has(p.name)
  );
  const visibleWithVals = visiblePoints.map(p => ({ ...p, ...getVals(p) }));

  const hasFilters = excDecisions.size > 0 || excClasses.size > 0 || excSites.size > 0 || excProducts.size > 0;

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const decPts  = visibleWithVals.filter(p => p.decision === 'REDUCE');
  const incPts  = visibleWithVals.filter(p => p.decision === 'INCREASE');
  const total   = visiblePoints.length || 1;
  const decPct  = Math.round(decPts.length / total * 100);
  const incPct  = 100 - decPct;
  const totalActual  = visibleWithVals.reduce((s, p) => s + p.actual, 0);
  const totalModel   = visibleWithVals.reduce((s, p) => s + p.model,  0);
  // Full-portfolio gap: all SKUs above/below MEIO median, regardless of decision
  const aboveSum     = visibleWithVals.filter(p => p.change < 0).reduce((s, p) => s + Math.abs(p.change), 0); // on-hand > MEIO
  const belowSum     = visibleWithVals.filter(p => p.change > 0).reduce((s, p) => s + p.change, 0);           // on-hand < MEIO
  const totalChange  = totalModel - totalActual; // true net: negative = portfolio over-stocked
  const maxBar       = Math.max(aboveSum, belowSum, 1);

  // ── Sidebar filter data ───────────────────────────────────────────────────────
  const echelonGroups = ECHELON_KEYS.map(key => ({
    key,
    meta: ECHELON_META[key],
    sites: [...new Map(
      allPoints.filter(p => p.echelon === key).map(p => [p.id, { id: p.id, name: p.name, abcClass: p.abcClass }])
    ).values()],
  }));

  const productsByClass = ['A','B','C'].map(cls => ({
    cls,
    products: [...new Set(allPoints.filter(p => p.abcClass === cls).map(p => p.name))],
  }));

  // ── Toggle helpers ────────────────────────────────────────────────────────────
  function toggleExclude(setter, value) {
    setter(prev => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }

  function toggleEchelon(echelon) {
    const ids = echelonGroups.find(e => e.key === echelon)?.sites.map(s => s.id) ?? [];
    const allEx = ids.every(id => excSites.has(id));
    setExcSites(prev => {
      const n = new Set(prev);
      if (allEx) ids.forEach(id => n.delete(id));
      else       ids.forEach(id => n.add(id));
      return n;
    });
  }

  function clearFilters() {
    setExcDecisions(new Set()); setExcClasses(new Set());
    setExcSites(new Set());     setExcProducts(new Set());
  }

  // ── Scatter data ──────────────────────────────────────────────────────────────
  const decisionGroups = ['REDUCE','INCREASE'].map(dec => ({
    decision: dec,
    color: DECISION_COLOR_MAP[dec],
    label: dec === 'REDUCE' ? 'Decrease' : dec === 'INCREASE' ? 'Increase' : 'Maintain',
    points: visibleWithVals.filter(p => p.decision === dec),
  }));

  const axisMax = (() => {
    const mx = Math.max(...visibleWithVals.flatMap(p => [p.model, p.actual]), 1);
    const padded = mx * 1.12;
    const unit = padded >= 1e6 ? 5e6 : padded >= 1e3 ? 5e3 : 5;
    return Math.ceil(padded / unit) * unit;
  })();

  // ── Table rows ────────────────────────────────────────────────────────────────
  const tableRows = visibleWithVals
    .slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .map((p, i) => ({ ...p, rank: i + 1 }));
  const maxChange = Math.max(...tableRows.map(r => Math.abs(r.change)), 1);
  const maxModel  = Math.max(...tableRows.map(r => r.model),  1);
  const maxActual = Math.max(...tableRows.map(r => r.actual), 1);

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">Inventory Analysis</div>
            <div className="text-xs text-muted mt-0.5">
              Model vs. actual · {visiblePoints.length}{allPoints.length !== visiblePoints.length ? ` of ${allPoints.length}` : ''} SKU-site pairs
              {hasFilters && <span className="ml-1.5 text-indigo-600 font-medium">· Filtered</span>}
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {open && (
        <div className="flex border-t border-border-light" style={{ minHeight: 480 }}>

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-52 shrink-0 border-r border-border-light overflow-y-auto" style={{ maxHeight: 720 }}>
            <div className="p-3 space-y-3">

              {/* Metric toggle */}
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Metric</div>
                <div className="flex flex-col gap-1">
                  {METRIC_TYPES.map(m => (
                    <button key={m.id} onClick={() => setMetricType(m.id)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border text-left font-medium transition-colors ${
                        metricType === m.id
                          ? 'bg-brand text-white border-brand'
                          : 'text-slate-600 border-border-light hover:border-brand/40 hover:text-brand'
                      }`}
                    >{m.label}</button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border-light" />

              {/* Suggested Action */}
              <IAFilterSection title="Suggested Action">
                {['REDUCE','INCREASE'].map(dec => (
                  <IACheckbox key={dec}
                    checked={!excDecisions.has(dec)}
                    onChange={() => toggleExclude(setExcDecisions, dec)}
                    label={dec === 'REDUCE' ? 'Decrease' : dec === 'INCREASE' ? 'Increase' : 'Maintain'}
                    color={DECISION_COLOR_MAP[dec]}
                    count={allPoints.filter(p => p.decision === dec).length}
                  />
                ))}
              </IAFilterSection>

              <div className="border-t border-border-light" />

              {/* ABC Class */}
              <IAFilterSection title="ABC Class">
                {['A','B','C'].map(cls => (
                  <IACheckbox key={cls}
                    checked={!excClasses.has(cls)}
                    onChange={() => toggleExclude(setExcClasses, cls)}
                    label={`Class ${cls}`}
                    color={ABC_COLORS[cls]}
                    count={allPoints.filter(p => p.abcClass === cls).length}
                  />
                ))}
              </IAFilterSection>

              <div className="border-t border-border-light" />

              {/* Echelon / Site tree */}
              <IAFilterSection title="Echelon / Site">
                {echelonGroups.map(eg => {
                  const ids     = eg.sites.map(s => s.id);
                  const allEx   = ids.length > 0 && ids.every(id => excSites.has(id));
                  const someEx  = !allEx && ids.some(id => excSites.has(id));
                  const exp     = expandedEchelons[eg.key] ?? true;
                  return (
                    <div key={eg.key} className="mb-1">
                      <div className="flex items-center gap-1">
                        <IACheckbox
                          checked={!allEx}
                          indeterminate={someEx}
                          onChange={() => toggleEchelon(eg.key)}
                          label=""
                        />
                        <button
                          onClick={() => setExpandedEchelons(prev => ({ ...prev, [eg.key]: !prev[eg.key] }))}
                          className="flex items-center gap-1 flex-1 min-w-0 text-left hover:text-brand -ml-2"
                        >
                          <span className="text-xs font-semibold text-slate-700 truncate">{eg.meta?.label ?? eg.key}</span>
                          {exp ? <ChevronUp className="w-2.5 h-2.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                        </button>
                      </div>
                      {exp && (
                        <div className="ml-3 mt-0.5 space-y-0">
                          {eg.sites.map(s => (
                            <IACheckbox key={s.id}
                              checked={!excSites.has(s.id)}
                              onChange={() => toggleExclude(setExcSites, s.id)}
                              label={`${s.id}`}
                              color={ABC_COLORS[s.abcClass]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </IAFilterSection>

              <div className="border-t border-border-light" />

              {/* Product Name grouped by class */}
              <IAFilterSection title="Product Name">
                {productsByClass.map(({ cls, products }) => products.length === 0 ? null : (
                  <div key={cls} className="mb-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide px-1 mb-0.5" style={{ color: ABC_COLORS[cls] }}>Class {cls}</div>
                    {products.map(name => (
                      <IACheckbox key={name}
                        checked={!excProducts.has(name)}
                        onChange={() => toggleExclude(setExcProducts, name)}
                        label={name}
                      />
                    ))}
                  </div>
                ))}
              </IAFilterSection>

              {hasFilters && (
                <button onClick={clearFilters}
                  className="w-full text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  ✕ Clear all filters
                </button>
              )}

            </div>
          </div>

          {/* ── MAIN CONTENT ── */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Summary strip */}
            <div className={`px-5 py-3 border-b border-border-light bg-slate-50 grid gap-6 ${metricType === 'doh' ? 'grid-cols-1' : 'grid-cols-3'}`}>

              {/* 1 — Count bar */}
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SKU Count by Suggested Action</div>
                <div className="text-[9px] text-slate-400 mb-2">how many SKUs the model recommends to increase or reduce</div>
                <div className="flex rounded-full overflow-hidden h-5 w-full">
                  <div className="flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ width: `${decPct}%`, background: DECISION_COLOR_MAP.REDUCE }}>
                    {decPct > 12 && `${decPct}%`}
                  </div>
                  <div className="flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ width: `${incPct}%`, background: DECISION_COLOR_MAP.INCREASE }}>
                    {incPct > 12 && `${incPct}%`}
                  </div>
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] font-semibold">
                  <span style={{ color: DECISION_COLOR_MAP.REDUCE }}>↓ {decPts.length} decrease</span>
                  <span style={{ color: DECISION_COLOR_MAP.INCREASE }}>↑ {incPts.length} increase</span>
                </div>
              </div>

              {/* 2 — Metric bars (hidden for DoH) */}
              {metricType !== 'doh' && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{axisLabel} — Gap to MEIO Median</div>
                  <div className="text-[9px] text-slate-400 mb-2">all SKUs · how far above or below the MEIO recommended level the portfolio sits today</div>
                  {[
                    { label: 'Above MEIO median', sub: 'on-hand exceeds MEIO target', val: aboveSum, color: DECISION_COLOR_MAP.REDUCE },
                    { label: 'Below MEIO median', sub: 'on-hand below MEIO target',   val: belowSum, color: DECISION_COLOR_MAP.INCREASE },
                  ].map(({ label, sub, val, color }) => (
                    <div key={label} className="mb-2">
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span style={{ color }} className="font-semibold">{label}</span>
                        <span className="font-semibold text-slate-700">{fmtV(val)}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 mb-0.5">{sub}</div>
                      <div className="h-4 bg-slate-100 rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm" style={{ width: `${(val / maxBar * 100).toFixed(1)}%`, background: color, opacity: 0.72 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3 — Metric totals (hidden for DoH) */}
              {metricType !== 'doh' && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{axisLabel} — Portfolio Totals</div>
                  <div className="text-[9px] text-slate-400 mb-2">sum across all visible SKUs at current on-hand vs. MEIO recommended</div>
                  <div className="space-y-1.5">
                    {[
                      { label: `Current on-hand (${axisLabel.toLowerCase()})`, value: totalActual, color: '#475569' },
                      { label: 'MEIO Model Output',    value: totalModel,  color: '#4F46E5' },
                      { label: 'Model Suggest Change', value: totalChange,
                        color: totalChange <= 0 ? DECISION_COLOR_MAP.REDUCE : DECISION_COLOR_MAP.INCREASE,
                        signed: true },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">{row.label}</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: row.color }}>
                          {row.signed ? fmtSigned(row.value) : fmtV(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Scatter */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-y-1 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    Model vs Actual — {axisLabel}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">Colored by model suggested change</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-2">
                    <svg width="18" height="6" viewBox="0 0 18 6" className="shrink-0"><line x1="0" y1="3" x2="18" y2="3" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                    <span>Diagonal = median MEIO output</span>
                    <span className="text-slate-300">·</span>
                    <span>portfolio range (−20%/+30%) shown above</span>
                    <span className="text-slate-300">·</span>
                    <span>above line = excess · below = understocked</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] shrink-0">
                  {Object.entries({ REDUCE: 'Decrease', INCREASE: 'Increase' }).map(([dec, lbl]) => (
                    <span key={dec} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: DECISION_COLOR_MAP[dec], opacity: 0.85 }} />
                      <span className="text-slate-500">{lbl}</span>
                    </span>
                  ))}
                  <span className="border-l border-slate-200 pl-4 flex items-center gap-2 text-slate-400 whitespace-nowrap">
                    <svg width="32" height="14" viewBox="0 0 32 14">
                      <circle cx="5"  cy="7" r="3"  fill="#94A3B8" opacity="0.6" />
                      <circle cx="18" cy="7" r="5"  fill="#94A3B8" opacity="0.6" />
                      <circle cx="29" cy="7" r="6.5" fill="#94A3B8" opacity="0.6" />
                    </svg>
                    Bubble size = current inventory value ($)
                  </span>
                </div>
              </div>

              <div className="cursor-pointer" onClick={() => setTableOpen(o => !o)} title="Click to toggle detail table">
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      type="number" dataKey="model"
                      tick={{ fill: '#94A3B8', fontSize: 10 }}
                      label={{ value: `MEIO Model Output (${axisLabel})`, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94A3B8' }}
                      domain={[0, axisMax]}
                      tickFormatter={v => metricType === 'inv' ? (v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`) : metricType === 'doh' ? `${v}d` : v.toLocaleString()}
                    />
                    <YAxis
                      type="number" dataKey="actual"
                      tick={{ fill: '#94A3B8', fontSize: 10 }}
                      label={{ value: `Actual (${axisLabel})`, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94A3B8' }}
                      domain={[0, axisMax]}
                      tickFormatter={v => metricType === 'inv' ? (v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`) : metricType === 'doh' ? `${v}d` : v.toLocaleString()}
                    />
                    <ZAxis range={[36, 400]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg" onClick={e => e.stopPropagation()}>
                            <div className="font-semibold text-ink">{d.id} — {d.name}</div>
                            <div className="text-[10px] text-slate-400 mb-1">Class {d.abcClass} · {d.echelon}</div>
                            <div className="text-muted">MEIO Model Output: <span className="font-semibold">{fmtV(d.model)}</span></div>
                            <div className="text-muted">Actual: <span className="font-semibold">{fmtV(d.actual)}</span></div>
                            <div className="mt-1 font-semibold" style={{ color: d.color }}>
                              Model Suggest Change: {fmtSigned(d.change)} ({d.decision})
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      segment={[{ x: 0, y: 0 }, { x: axisMax, y: axisMax }]}
                      stroke="#94A3B8" strokeDasharray="6 4"
                      label={{ value: 'On target', position: 'insideTopLeft', fontSize: 9, fill: '#94A3B8' }}
                    />
                    {decisionGroups.map(dg => (
                      <Scatter key={dg.decision} name={dg.label} data={dg.points} fill={dg.color} shape={<IAScatterDot />} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Toggle button */}
              <div className="flex justify-center mt-3">
                <button onClick={() => setTableOpen(o => !o)}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all"
                  style={{ background: tableOpen ? '#EEF2FF' : '#4F46E5', color: tableOpen ? '#4F46E5' : '#fff', border: '1.5px solid #4F46E5' }}>
                  {tableOpen
                    ? <><ChevronUp className="w-4 h-4" /> Hide detail table</>
                    : <><ChevronDown className="w-4 h-4" /> View SKU detail — {visiblePoints.length} SKU-site pairs</>}
                </button>
              </div>
            </div>

            {/* ── Expandable output detail table ── */}
            {tableOpen && (
              <div className="border-t border-border-light">
                <div className="px-5 py-2.5 bg-slate-50 border-b border-border-light flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-ink">Output Detail — {axisLabel}</span>
                    <span className="ml-2 text-xs text-muted">
                      {tableRows.length}{allPoints.length !== tableRows.length ? ` of ${allPoints.length}` : ''} SKU-site pairs · ranked by Model Suggest Change
                    </span>
                  </div>
                  <button onClick={() => setTableOpen(false)} className="text-xs text-muted hover:text-ink">✕ Close</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface border-b border-border-light text-muted font-semibold">
                        {['Rank','Class','SKU ID','Product','Echelon','MEIO Model Output (median)',`Current On-Hand (${axisLabel})`, 'Model Suggest Change'].map(h => (
                          <th key={h} className={`px-4 py-2.5 whitespace-nowrap ${h === 'Rank' || h === 'Class' ? 'text-left' : h === 'Product' || h === 'Echelon' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(row => {
                        const abcColor = ABC_COLORS[row.abcClass];
                        return (
                          <tr key={row.id} className="border-b border-border-light hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">{row.rank}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{ color: abcColor, background: abcColor + '15', border: `1px solid ${abcColor}30` }}>
                                {row.abcClass}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-semibold text-ink">{row.id}</td>
                            <td className="px-4 py-2.5 text-ink">{row.name}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-[11px]">{row.echelon}</td>
                            {/* MEIO Model Output — bar + value */}
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-3 bg-slate-100 rounded-sm overflow-hidden">
                                  <div className="h-full rounded-sm bg-indigo-400" style={{ width: `${(row.model / maxModel * 100).toFixed(1)}%` }} />
                                </div>
                                <span className="font-mono text-ink w-14 text-right tabular-nums">{fmtV(row.model)}</span>
                              </div>
                            </td>
                            {/* Actual — bar + value */}
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-3 bg-slate-100 rounded-sm overflow-hidden">
                                  <div className="h-full rounded-sm bg-slate-400" style={{ width: `${(row.actual / maxActual * 100).toFixed(1)}%` }} />
                                </div>
                                <span className="font-mono text-ink w-14 text-right tabular-nums">{fmtV(row.actual)}</span>
                              </div>
                            </td>
                            {/* Suggest Change — bar + signed value */}
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-3 bg-slate-100 rounded-sm overflow-hidden">
                                  <div className="h-full rounded-sm"
                                    style={{ width: `${(Math.abs(row.change) / maxChange * 100).toFixed(1)}%`, background: row.color, opacity: 0.8 }} />
                                </div>
                                <span className="font-mono font-semibold w-16 text-right tabular-nums" style={{ color: row.color }}>
                                  {fmtSigned(row.change)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── "If you institute the changes" summary bar ── */}
                <ImpactSummaryBar allPoints={allPoints} />

              </div>
            )}

          </div>{/* end main */}
        </div>
      )}
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
      <div className="text-sm font-semibold text-ink mb-0.5">This Cycle's Suggested Actions</div>
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

function OptimizationTable({ optimized, totalCount, highlightedSku, onDecision, rowStates = {}, onRowStateChange }) {
  const [filter, setFilter] = useState('action');
  const [sort, setSort] = useState({ key: 'urgencyRank', dir: 1 });
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
    onRowStateChange?.(s.id, 'accepted');
    onDecision(buildEntry(s, plannerAction, 'accepted'));
  }

  function handleDefer(s) {
    if (rowStates[s.id]) return;
    const plannerAction = getPlannerAction(s.delta, s.meioSafetyStock);
    const sev = ACTION_SEVERITY[plannerAction];
    if (!sev || !onDecision) return;
    onRowStateChange?.(s.id, 'deferred');
    onDecision(buildEntry(s, plannerAction, 'open'));
  }

  const urgencyRank = { critical: 0, high: 1, medium: 2, low: 3 };

  const rows = optimized
    .filter(s => filter === 'all' || s.decision === filter)
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
          <div className="text-xs text-muted mt-0.5">
            {totalCount && totalCount !== optimized.length
              ? `Showing ${rows.length} of ${totalCount} SKU-site pairs`
              : `MEIO-derived decisions · ${rows.length} SKUs shown`}
          </div>
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
                { label: 'MEIO Range',     key: 'meioSafetyStock', noSort: true },
                { label: 'DoH',            key: 'doh' },
                { label: 'Gap vs. MEIO',   key: 'delta' },
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
                  <td className="px-4 py-2.5">
                    <MeioRangeBar meioTarget={s.meioSafetyStock} current={s.onHand ?? s.currentSafetyStock} compact />
                  </td>
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

// ── CI Agent Panel ────────────────────────────────────────────────────────────
// Lever metadata
const CI_LEVERS = [
  {
    id: 'demand-volatility',
    title: 'Demand Signal Improvement',
    category: 'Demand Planning',
    categoryColor: '#0F766E',
    categoryBg: '#F0FDFA',
    summary: '5 SKUs show demand CV > 0.30 — above the biopharma benchmark of 0.25. Integrating patient registry signals, epidemiology data, and specialty pharmacy dispensing feeds can reduce forecast error by 25–30% and CV by 20–35%, directly shrinking MEIO safety stock targets.',
    effort: 'High',
    impact: 'High',
    timeframe: '3–6 months',
    tradeoffs: [
      { label: 'SS reduction (high-CV SKUs)', value: '~20–35%', good: true },
      { label: 'WC freed (est.)', value: '~$4.2M', good: true },
      { label: 'Data integration effort', value: 'Medium', good: false },
      { label: 'Forecast model retraining', value: 'Required', good: null },
    ],
  },
  {
    id: 'lead-time-vs-plan',
    title: 'Lead Time Reduction vs Plan',
    category: 'Supply Chain',
    categoryColor: '#B45309',
    categoryBg: '#FFFBEB',
    summary: 'Actual lead times are running 15–28% above plan for 4 SKUs, driven by the cross-border sea freight leg (3–5 weeks). Switching Class A biologics to air freight cuts SS by ~18%, releasing ~$8M WC. At 22% cold-chain holding cost, the annual saving (~$1.8M) more than offsets the freight premium (~$1.2M) — a net +$600K/yr.',
    effort: 'Medium',
    impact: 'Medium',
    timeframe: '2–4 months',
    tradeoffs: [
      { label: 'SS reduction (Class A SKUs)', value: '~18%', good: true },
      { label: 'WC freed — near-term release', value: '~$8M', good: true },
      { label: 'Annual holding cost saving (22%)', value: '~$1.8M/yr', good: true },
      { label: 'Air freight premium vs sea', value: '~$1.2M/yr', good: false },
    ],
  },
  {
    id: 'network-centralization',
    title: 'Network Centralization & Risk Pooling',
    category: 'Network Design',
    categoryColor: '#4F46E5',
    categoryBg: '#EEF2FF',
    summary: 'Current inventory is held across 4 regional DCs. Consolidating Class-C/B biologics to 2 central hubs leverages statistical risk pooling — reducing aggregate safety stock by ~29% through demand aggregation, releasing ~$4M in working capital.',
    effort: 'Medium',
    impact: 'High',
    timeframe: '6–12 months',
    tradeoffs: [
      { label: 'Pooled SS reduction', value: '~29%', good: true },
      { label: 'WC freed (est.)', value: '~$4M', good: true },
      { label: 'Distribution lead time', value: '+1–2 days', good: false },
      { label: 'DC consolidation cost', value: '$0.4M one-off', good: false },
    ],
  },
];

const EFFORT_BADGE = { Low: 'bg-green-50 text-green-700 border-green-200', Medium: 'bg-amber-50 text-amber-700 border-amber-200', High: 'bg-red-50 text-red-700 border-red-200' };
const IMPACT_BADGE = { Low: 'bg-slate-50 text-slate-600 border-slate-200', Medium: 'bg-indigo-50 text-indigo-700 border-indigo-200', High: 'bg-teal-50 text-teal-700 border-teal-200' };

// ── Drill-down helper components ──────────────────────────────────────────────
function DDSection({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}
function DDInsight({ icon, label, value, good }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
      good === true ? 'bg-green-50 border-green-200' :
      good === false ? 'bg-red-50 border-red-200' :
      'bg-white border-border-light'
    }`}>
      <span className="text-muted flex items-center gap-1.5">{icon && <span>{icon}</span>}{label}</span>
      <span className={`font-bold ml-2 ${good === true ? 'text-green-700' : good === false ? 'text-red-600' : 'text-slate-600'}`}>{value}</span>
    </div>
  );
}
function DDNextSteps({ steps }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-xs text-ink">
          <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-[10px]">{i + 1}</span>
          <span className="leading-relaxed mt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Drill-down panels (one per lever) ────────────────────────────────────────
function DemandVolatilityDD({ skus }) {
  const abcSkus = computeABCClass(skus);
  const highCV = abcSkus.filter(s => s.demandCV > 0.25).map(s => ({
    id: s.id, name: s.name, abcClass: s.abcClass, cv: (s.demandCV * 100).toFixed(0),
    ssImpact: Math.round(s.meioSafetyStock * s.demandCV * s.unitCost / 1000),
    potentialCV: (s.demandCV * 0.72 * 100).toFixed(0),
  }));
  const totalSSImpact = highCV.reduce((a, b) => a + b.ssImpact, 0);
  return (
    <div className="space-y-5 fade-in">
      <DDSection title="Why demand CV drives safety stock">
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-900 leading-relaxed">
          The MEIO safety stock formula is <strong>SS = Z × σ_demand × √lead-time</strong>. Demand CV (σ / μ) directly scales σ — a 30% reduction in CV compounds across every SKU's MEIO target. Biopharma benchmark is CV ≤ 0.25; your portfolio averages 0.31.
        </div>
      </DDSection>
      <DDSection title="High-CV SKUs — safety stock at risk">
        <div className="space-y-1.5">
          {highCV.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-border-light rounded-lg text-xs">
              <span className="font-mono font-bold text-brand w-12 shrink-0">{s.id}</span>
              <span className="flex-1 text-muted truncate">{s.name}</span>
              <span className="text-amber-700 font-semibold w-14 text-right">CV {s.cv}%</span>
              <span className="text-red-600 font-bold w-20 text-right">~${s.ssImpact}K excess SS</span>
              <span className="text-green-700 font-semibold w-20 text-right">→ CV {s.potentialCV}% target</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted">Total excess safety stock attributable to above-benchmark CV: <strong className="text-ink">${totalSSImpact.toLocaleString()}K</strong></div>
      </DDSection>
      <DDSection title="Demand signal inputs that can actually improve accuracy">
        <div className="grid grid-cols-1 gap-2">
          <DDInsight icon="📋" label="Patient registry — treatment initiation, persistence & discontinuation rates" value="Replaces lagged order signal with real patient flow; reduces CV ~15–20%" good={true} />
          <DDInsight icon="🧬" label="Epidemiology data — disease prevalence, incidence & diagnosis rates by market" value="Anchors forecast to patient population; critical for specialty biologics" good={true} />
          <DDInsight icon="💊" label="Specialty pharmacy dispensing data — Rx fill rates & refill patterns" value="Captures real consumption vs channel buy-in; removes stocking distortion" good={true} />
          <DDInsight icon="📑" label="Payer & claims data — reimbursement approvals & patient adherence" value="Leading indicator of demand step-changes from formulary shifts" good={true} />
          <DDInsight icon="🔁" label="Model retraining cadence — currently quarterly" value="Move to monthly; integrate hybrid epidemiology + time-series model" good={null} />
        </div>
      </DDSection>
      <DDSection title="Recommended next steps">
        <DDNextSteps steps={[
          'Pull 24-month actuals vs forecast by SKU — decompose systematic bias from noise-driven CV to identify which input addresses each SKU\'s root distortion.',
          'Assess data availability: engage patient services, medical affairs, and specialty pharmacy partners to map which signals (patient registry, Rx dispensing, EMR) are accessible and at what cost.',
          'Size the economic opportunity: estimate SS reduction and WC release potential per SKU if CV targets are met — establish the prize before committing to integration.',
          'Build business case: total data integration and model refit investment vs projected WC release and service level uplift — validate economics before proceeding to full implementation.',
        ]} />
      </DDSection>
    </div>
  );
}

function LeadTimeVsPlanDD({ skus }) {
  const abcSkus = computeABCClass(skus);

  // Synthesise sea vs air lead times deterministically
  const ltData = abcSkus.map(s => {
    const seed = (s.id.charCodeAt(0) + (s.id.charCodeAt(2) || 0)) % 10;
    const seaLT  = s.leadTimeWeeks;                                   // current = sea freight
    // Air freight cuts transit time by ~4 weeks (cross-border leg only)
    const airLT  = Math.max(2, seaLT - 4);
    const ssSea  = s.meioSafetyStock;
    const ssAir  = Math.round(s.meioSafetyStock * Math.sqrt(airLT) / Math.sqrt(seaLT));
    const ssDelta = ssSea - ssAir;
    // WC realizability: ~30% of theoretical SS reduction converts near-term (batch & shelf-life constraints)
    const wcSaved = Math.round(ssDelta * s.unitCost * 0.30 / 1000);
    // Air freight cost premium: ~$35/kg incremental over sea for cold-chain biopharma (chartered lanes with volume commitment)
    const airFreightPremium = Math.round(s.plannedSupply ? s.plannedSupply[0] * 10 * 35 / 1000 : seaLT * 50);
    return { id: s.id, name: s.name, abcClass: s.abcClass, seaLT, airLT, ssSea, ssAir, ssDelta, wcSaved, airFreightPremium };
  });

  const totalWcSaved   = ltData.reduce((a, b) => a + b.wcSaved, 0);
  const totalFreight   = ltData.reduce((a, b) => a + b.airFreightPremium, 0);
  const netBenefit     = totalWcSaved - totalFreight;

  return (
    <div className="space-y-5 fade-in">
      <DDSection title="The mechanism: sea → air freight">
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-900 leading-relaxed">
          The dominant driver of lead time overruns in this portfolio is the <strong>cross-border sea freight leg</strong> — typically 3–5 weeks from CMO to regional DC. Switching to air freight eliminates this leg, cutting total lead time by ~4 weeks per shipment. Since <strong>MEIO SS = Z × σ × √lead-time</strong>, a 4-week reduction on a 12-week LT shrinks the SS requirement by ~18% — permanently, without touching CMO schedules or batch sizes.
        </div>
      </DDSection>

      <DDSection title="Sea vs Air: SS and cost impact by SKU">
        <div className="space-y-1.5">
          {ltData.map(d => (
            <div key={d.id} className="bg-white border border-border-light rounded-lg px-4 py-2.5 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-bold text-brand w-12 shrink-0">{d.id}</span>
                <span className="flex-1 text-muted min-w-0 truncate">{d.name}</span>
                <span className="text-slate-500 shrink-0">Sea LT: <strong>{d.seaLT}w</strong></span>
                <span className="text-teal-700 font-semibold shrink-0">Air LT: <strong>{d.airLT}w</strong></span>
                <span className="text-slate-500 shrink-0">SS: {d.ssSea} → <strong className="text-green-700">{d.ssAir}</strong> units</span>
                <span className="text-green-700 font-bold shrink-0 w-20 text-right">−{d.ssDelta} units</span>
                <span className="text-green-600 font-bold shrink-0 w-20 text-right">~${d.wcSaved}K WC</span>
              </div>
            </div>
          ))}
        </div>
      </DDSection>

      <DDSection title="Cost-benefit: air freight premium vs safety stock saving">
        <div className="grid grid-cols-1 gap-2">
          <DDInsight label="Near-term WC release (SS reduction, ~30% realisable)" value={`~$${(totalWcSaved / 1000).toFixed(0)}M`} good={true} />
          <DDInsight label="Annual holding cost saving (WC × 22% — cold storage, CoC, expiry risk)" value={`~$${(totalWcSaved * 0.22 / 1000).toFixed(1)}M/yr`} good={true} />
          <DDInsight label="Annual air freight premium vs sea" value={`~$${(totalFreight / 1000).toFixed(1)}M/yr`} good={false} />
          <DDInsight label="Net annual benefit" value={(() => { const net = Math.round(totalWcSaved * 0.22) - totalFreight; return net >= 0 ? `+$${(net/1000).toFixed(1)}M/yr` : `−$${(Math.abs(net)/1000).toFixed(1)}M/yr`; })()} good={Math.round(totalWcSaved * 0.22) >= totalFreight} />
        </div>
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-900">
          <strong>Note:</strong> Cold-chain biologic holding costs run ~22%/yr (cost of capital + cold storage + expiry/obsolescence risk + insurance) — well above the 2% rate used for ambient goods. This makes the WC release significantly more valuable on an annual basis and is the key reason air freight economics work for high-value Class A biologics.
        </div>
      </DDSection>

      <DDSection title="Which SKUs to prioritise for air conversion">
        <div className="grid grid-cols-1 gap-2">
          <DDInsight label="Class A SKUs (high unit value)" value="Immediate priority — freight cost is negligible vs WC saving" good={true} />
          <DDInsight label="SKUs with LT > 10 weeks" value="Greatest √LT compression benefit" good={true} />
          <DDInsight label="Cold-chain SKUs" value="Air maintains temperature integrity better than sea for long hauls" good={true} />
          <DDInsight label="Class C / high-volume, low-value" value="Sea likely still optimal — freight cost exceeds WC benefit" good={false} />
        </div>
      </DDSection>

      <DDSection title="Recommended next steps">
        <DDNextSteps steps={[
          'Pull shipment records by SKU for last 12 months — calculate average sea transit time and actual vs planned LT split by leg to confirm where the overrun originates.',
          'Model MEIO re-run with air LT inputs — quantify SS reduction and WC release potential per SKU to establish the prize before engaging any vendor.',
          'Run indicative freight cost quote with logistics partner for Class A SKUs — benchmark against the 4–6× per-kg air premium for cold-chain biopharma cargo.',
          'Build business case: net WC release vs total freight cost increase — validate overall economics before committing to any conversion.',
        ]} />
      </DDSection>
    </div>
  );
}

function NetworkCentralizationDD({ skus }) {
  const abcSkus = computeABCClass(skus);
  const n_current = 4;
  const n_target = 2;
  const poolingFactor = Math.sqrt(n_target) / Math.sqrt(n_current);
  const candidateSkus = abcSkus.filter(s => s.abcClass !== 'A' || s.echelon === 'Distribution');
  const totalSS = candidateSkus.reduce((a, s) => a + s.meioSafetyStock * s.unitCost, 0);
  // Cash conversion factor: pooling savings realised over 12–18 months as stock naturally depletes (~16% near-term)
  const savedSS = Math.round(totalSS * (1 - poolingFactor) * 0.16 / 1e6 * 10) / 10;
  return (
    <div className="space-y-5 fade-in">
      <DDSection title="Risk pooling: the statistical case">
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-900 leading-relaxed">
          When demand is pooled across locations, aggregate variability grows as <strong>√n</strong>, not linearly. Consolidating from {n_current} DCs to {n_target} reduces aggregate safety stock by <strong>{Math.round((1 - poolingFactor) * 100)}%</strong> through the square-root law of risk pooling — without changing service levels.
        </div>
      </DDSection>
      <DDSection title="Pooling impact by SKU">
        <div className="space-y-1.5">
          {candidateSkus.map(s => {
            const currentSS = s.meioSafetyStock * s.unitCost;
            const pooledSS = currentSS * poolingFactor;
            const saved = currentSS - pooledSS;
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-border-light rounded-lg text-xs">
                <span className="font-mono font-bold text-brand w-12 shrink-0">{s.id}</span>
                <span className="flex-1 text-muted truncate">{s.name}</span>
                <span className="text-slate-500">Current SS: ${(currentSS / 1e6).toFixed(2)}M</span>
                <span className="text-green-700 font-bold">Pooled: ${(pooledSS / 1e6).toFixed(2)}M</span>
                <span className="text-green-600 font-semibold">–${(saved / 1e6).toFixed(2)}M</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-muted">Estimated working capital release from pooling: <strong className="text-ink">${savedSS}M</strong></div>
      </DDSection>
      <DDSection title="Network design considerations">
        <div className="grid grid-cols-1 gap-2">
          <DDInsight icon="❄️" label="Cold-chain vs ambient: which SKUs require dedicated cold hubs?" value="Determines hub GDP requirements" good={null} />
          <DDInsight icon="💊" label="Which products are candidates for pooling (Class B/C biologics only)?" value="Class A stays at current DCs" good={null} />
          <DDInsight icon="🔗" label="Products to combine at each hub — demand correlation & compatibility" value="Low-correlation SKUs gain most from pooling" good={null} />
          <DDInsight icon="🚚" label="Transportation lane impact: hub-to-market lead time delta" value="+1–2 days for consolidated lanes" good={false} />
          <DDInsight icon="🏭" label="DC infrastructure: capacity, GDP certification, and lease economics" value="~$0.4M/yr lease consolidation saving" good={true} />
        </div>
      </DDSection>
      <DDSection title="Recommended next steps">
        <DDNextSteps steps={[
          'Model demand and inventory by DC for B- and C-class SKUs over 24 months — confirm pooling savings vs actual demand pattern.',
          'Identify 2 hub DC candidates based on patient geography, cold-chain GDP certification, and transportation lane coverage.',
          'Run service level simulation: confirm pooled model maintains SL ≥ 98% for Class-B and SL ≥ 95% for Class-C at 2 consolidated hubs.',
          'Build business case: quantify total cost savings (SS reduction + DC lease) vs consolidation investment and service level risk before committing to a transition plan.',
        ]} />
      </DDSection>
    </div>
  );
}

// ── CI Lever card (list view) ─────────────────────────────────────────────────
function CILeverCard({ lever, onDive }) {
  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-ink">{lever.title}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{ color: lever.categoryColor, background: lever.categoryBg, borderColor: lever.categoryColor + '40' }}>
                  {lever.category}
                </span>
              </div>
              <p className="text-xs text-muted mt-1 leading-relaxed">{lever.summary}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${EFFORT_BADGE[lever.effort]}`}>
                  Effort: {lever.effort}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${IMPACT_BADGE[lever.impact]}`}>
                  Impact: {lever.impact}
                </span>
                <span className="text-[10px] text-muted">⏱ {lever.timeframe}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <div className="hidden sm:flex gap-2 flex-wrap justify-end">
              {lever.tradeoffs.slice(0, 2).map(t => (
                <div key={t.label} className={`flex flex-col items-end px-2.5 py-1 rounded-lg border ${
                  t.good === true ? 'bg-green-50 border-green-200' :
                  t.good === false ? 'bg-red-50 border-red-200' :
                  'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-[10px] font-bold leading-tight ${
                    t.good === true ? 'text-green-700' : t.good === false ? 'text-red-600' : 'text-slate-600'
                  }`}>{t.value}</span>
                  <span className="text-[9px] text-slate-400 leading-tight">{t.label}</span>
                </div>
              ))}
            </div>
            <button
              onClick={onDive}
              className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
            >
              Deep Dive →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CI Lever drill-down wrapper ───────────────────────────────────────────────
const DD_COMPONENTS = {
  'demand-volatility': DemandVolatilityDD,
  'lead-time-vs-plan': LeadTimeVsPlanDD,
  'network-centralization': NetworkCentralizationDD,
};

function CILeverDrillDown({ lever, skus, onBack }) {
  const DDComponent = DD_COMPONENTS[lever.id];
  return (
    <div className="space-y-4">
      {/* Drill-down header */}
      <div className="bg-white border border-border-light rounded-xl px-5 py-4">
        <div className="flex items-start gap-3">
          <button
            onClick={onBack}
            className="shrink-0 flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors px-2.5 py-1.5 rounded-lg border border-border-light hover:bg-surface mt-0.5"
          >
            ← Back
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-ink">{lever.title}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                style={{ color: lever.categoryColor, background: lever.categoryBg, borderColor: lever.categoryColor + '40' }}>
                {lever.category}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${EFFORT_BADGE[lever.effort]}`}>Effort: {lever.effort}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${IMPACT_BADGE[lever.impact]}`}>Impact: {lever.impact}</span>
              <span className="text-[10px] text-muted">⏱ {lever.timeframe}</span>
            </div>
          </div>
        </div>
        {/* Tradeoff row */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {lever.tradeoffs.map(t => (
            <div key={t.label} className={`flex flex-col px-3 py-2 rounded-lg border text-xs ${
              t.good === true ? 'bg-green-50 border-green-200' :
              t.good === false ? 'bg-red-50 border-red-200' :
              'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-muted text-[10px]">{t.label}</span>
              <span className={`font-bold mt-0.5 ${t.good === true ? 'text-green-700' : t.good === false ? 'text-red-600' : 'text-slate-600'}`}>{t.value}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Drill-down content */}
      <div className="bg-white border border-border-light rounded-xl px-5 py-5">
        {DDComponent && <DDComponent skus={skus} />}
      </div>
    </div>
  );
}

export function CIAgentPanel({ skus, optimized }) {
  const [activeLever, setActiveLever] = useState(null);
  const totalSkus = skus.length;
  const actionRequired = optimized.length;
  const inRangeCount = skus.filter(s => {
    const min = s.meioSafetyStock * MEIO_RANGE_MIN_MULT;
    const max = s.meioSafetyStock * MEIO_RANGE_MAX_MULT;
    return s.onHand >= min && s.onHand <= max;
  }).length;

  if (activeLever) {
    return (
      <div className="space-y-4">
        {/* Mini header so context is preserved */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-muted">Continuous Improvement · Deep Dive</span>
        </div>
        <CILeverDrillDown lever={activeLever} skus={skus} onBack={() => setActiveLever(null)} />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-light">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div>
              <div className="text-sm font-bold text-ink">Continuous Improvement Levers</div>
              <div className="text-xs text-muted mt-0.5">Agent scan complete — structural levers that reduce MEIO-required safety stock</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
              3 levers identified
            </span>
          </div>
        </div>
        <div className="mt-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" />
          <p className="text-xs text-violet-900 leading-relaxed">
            These levers address the key <strong>inputs</strong> driving elevated MEIO targets — demand variability, manufacturing strategy, lead time, network structure, and quality release.
            Implementing them permanently shifts the MEIO baseline downward. Click <strong>Deep Dive</strong> on any lever to see the full analysis.
          </p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {CI_LEVERS.map(lever => (
          <CILeverCard key={lever.id} lever={lever} onDive={() => setActiveLever(lever)} />
        ))}
      </div>
    </div>
  );
}

// ── Demand vs Revenue (Service Segmentation) ──────────────────────────────────
function DemandRevenueChart({ skus }) {
  const [open, setOpen] = useState(true);
  const abcSkus = computeABCClass(skus);

  const skuPoints = abcSkus.map(sku => {
    const avgMonthlyDemand = sku.monthlyDemand.reduce((a, b) => a + b, 0) / sku.monthlyDemand.length;
    const annualRevenue    = sku.unitRevenue * avgMonthlyDemand * 12;
    const rawSize = Math.sqrt(sku.onHand * sku.unitCost / 50000);
    const dotSize = Math.max(6, Math.min(20, rawSize));
    return {
      id: sku.id, name: sku.name, abcClass: sku.abcClass,
      demandVolCV:   Math.round(sku.demandCV * 1000) / 10,
      annualRevenue,
      dotSize,
      color: ABC_COLORS[sku.abcClass],
    };
  });

  const abcGroups = ['A', 'B', 'C'].map(cls => ({
    cls,
    color: ABC_COLORS[cls],
    points: skuPoints.filter(p => p.abcClass === cls),
  }));

  function ChartDot({ cx, cy, payload }) {
    if (!cx || !cy) return null;
    return (
      <circle cx={cx} cy={cy} r={payload.dotSize}
        fill={payload.color} fillOpacity={0.82}
        stroke="white" strokeWidth={1.5} />
    );
  }

  const fmtRev = v =>
    v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B`
    : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
    : `$${(v / 1e3).toFixed(0)}K`;

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <span className="text-base">🎯</span>
          </div>
          <div>
            <div className="text-sm font-bold text-ink">Service Segmentation — Demand Volatility vs. Revenue</div>
            <div className="text-xs text-muted mt-0.5">
              High-revenue, low-volatility SKUs warrant tighter safety stock · high-volatility SKUs need larger buffers
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {open && (
        <div className="border-t border-border-light px-5 pb-5 pt-4">
          {/* Bubble size legend */}
          <div className="flex items-center gap-2 mb-3 text-[11px] text-slate-400">
            <svg width="44" height="16" viewBox="0 0 44 16">
              <circle cx="5"  cy="8" r="3"  fill="#94A3B8" opacity="0.6" />
              <circle cx="19" cy="8" r="5"  fill="#94A3B8" opacity="0.6" />
              <circle cx="36" cy="8" r="7"  fill="#94A3B8" opacity="0.6" />
            </svg>
            Bubble size = current inventory value (on-hand units × unit cost)
          </div>

          {(() => {
            const allCV  = skuPoints.map(p => p.demandVolCV);
            const allRev = skuPoints.map(p => p.annualRevenue);
            const xMid   = (Math.min(...allCV)  + Math.max(...allCV))  / 2;
            const yMid   = (Math.min(...allRev) + Math.max(...allRev)) / 2;
            const xMax   = Math.ceil(Math.max(...allCV) / 10) * 10;
            const yMax   = 500e6;

            // Corner-anchored label: align = 'tl' | 'tr' | 'bl' | 'br'
            const mkLabel = (text, subtext, color, align) => ({ viewBox }) => {
              const { x, y, width, height } = viewBox;
              const pad = 10;
              const isLeft  = align[1] === 'l';
              const isTop   = align[0] === 't';
              const tx      = isLeft ? x + pad : x + width - pad;
              const ty      = isTop  ? y + pad + 11 : y + height - pad - 14;
              const anchor  = isLeft ? 'start' : 'end';
              return (
                <g pointerEvents="none">
                  <text x={tx} y={ty}      textAnchor={anchor} fontSize="10" fontWeight="700" fill={color} opacity="0.9">{text}</text>
                  <text x={tx} y={ty + 13} textAnchor={anchor} fontSize="8.5" fill={color} opacity="0.65">{subtext}</text>
                </g>
              );
            };

            return (
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 10, right: 24, left: 60, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis type="number" dataKey="demandVolCV" name="Demand Volatility (CV %)"
                    domain={[0, xMax]} tick={{ fill: '#94A3B8', fontSize: 10 }}
                    label={{ value: 'Demand Volatility — Coefficient of Variation (%)', position: 'insideBottom', offset: -16, fontSize: 10, fill: '#94A3B8' }} />
                  <YAxis type="number" dataKey="annualRevenue" name="Annual Revenue"
                    domain={[0, yMax]} tick={{ fill: '#94A3B8', fontSize: 10 }}
                    tickFormatter={fmtRev} width={60}
                    label={{ value: 'Annual Revenue', angle: -90, position: 'insideLeft', offset: -44, fontSize: 10, fill: '#94A3B8' }} />
                  <ZAxis range={[36, 400]} />

                  {/* Quadrant background shading */}
                  <ReferenceArea x1={0} x2={xMid} y1={yMid} y2={yMax} fill="#DCFCE7" fillOpacity={0.55} />
                  <ReferenceArea x1={xMid} x2={xMax} y1={yMid} y2={yMax} fill="#FEF9C3" fillOpacity={0.55} />
                  <ReferenceArea x1={0} x2={xMid} y1={0} y2={yMid} fill="#F1F5F9" fillOpacity={0.55} />
                  <ReferenceArea x1={xMid} x2={xMax} y1={0} y2={yMid} fill="#FEE2E2" fillOpacity={0.55} />

                  {/* Crosshair dividers */}
                  <ReferenceLine x={xMid} stroke="#94A3B8" strokeDasharray="6 3" strokeWidth={1.5} />
                  <ReferenceLine y={yMid} stroke="#94A3B8" strokeDasharray="6 3" strokeWidth={1.5} />

                  {/* Corner-anchored quadrant labels */}
                  <ReferenceArea x1={0} x2={xMid} y1={yMid} y2={yMax} fill="transparent" label={mkLabel('Low volatility · High revenue',  'Tighter SS targets — stable demand, lean inventory',    '#0F766E', 'tl')} />
                  <ReferenceArea x1={xMid} x2={xMax} y1={yMid} y2={yMax} fill="transparent" label={mkLabel('High volatility · High revenue', 'Larger buffers — prioritise supply reliability',         '#B45309', 'tr')} />
                  <ReferenceArea x1={0} x2={xMid} y1={0} y2={yMid} fill="transparent" label={mkLabel('Low volatility · Low revenue',   'Standard MEIO policy — WC release candidates',          '#475569', 'bl')} />
                  <ReferenceArea x1={xMid} x2={xMax} y1={0} y2={yMid} fill="transparent" label={mkLabel('High volatility · Low revenue',  'Simplify — review service level targets',                '#DC2626', 'br')} />

                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-ink">{d.id} — {d.name}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: d.color }} />
                            <span className="text-muted">Class {d.abcClass}</span>
                          </div>
                          <div className="text-muted mt-1">Demand CV: <span className="font-semibold text-ink">{d.demandVolCV}%</span></div>
                          <div className="text-muted">Annual Revenue: <span className="font-semibold text-ink">{fmtRev(d.annualRevenue)}</span></div>
                        </div>
                      );
                    }} />
                  {abcGroups.map(g => (
                    <Scatter key={g.cls} name={`Class ${g.cls}`} data={g.points} fill={g.color} shape={<ChartDot />} />
                  ))}
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                    formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>} />
                </ScatterChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Sensitivity Analysis ─────────────────────────────────────────────────────
const SENS_SL_TARGETS = { A: 99.5, B: 98.0, C: 95.0 };

// Build a curve of {pct, sl, wcDelta} for the sparkline (50%–150%, step 2%)
function buildSensCurve(abcSkus) {
  const meioWC = abcSkus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
  const totalWeight = abcSkus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0) || 1;
  const pts = [];
  for (let p = 50; p <= 150; p += 2) {
    const ratio = p / 100;
    const sl = abcSkus.reduce((s, k) => {
      const target = SENS_SL_TARGETS[k.abcClass] ?? 95;
      const skuSL  = ratio >= 1 ? target : target * Math.pow(ratio, 0.3);
      return s + skuSL * (k.meioSafetyStock * k.unitCost);
    }, 0) / totalWeight;
    pts.push({ pct: p, sl, wcDelta: (ratio - 1) * meioWC });
  }
  return { pts, meioWC };
}

function SensitivityAnalysis({ skus }) {
  const [open, setOpen]     = useState(true);
  const [level, setLevel]   = useState(100); // % of MEIO recommended SS

  const abcSkus = computeABCClass(skus);
  const { pts, meioWC } = buildSensCurve(abcSkus);

  // ── Live metrics at current slider ──────────────────────────────────────────
  const ratio       = level / 100;
  const totalWeight = abcSkus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0) || 1;
  const portfSL     = abcSkus.reduce((s, k) => {
    const target = SENS_SL_TARGETS[k.abcClass] ?? 95;
    const skuSL  = ratio >= 1 ? target : target * Math.pow(ratio, 0.3);
    return s + skuSL * (k.meioSafetyStock * k.unitCost);
  }, 0) / totalWeight;
  const wcDelta     = (ratio - 1) * meioWC;          // negative = release, positive = additional
  const wcTotal     = meioWC + wcDelta;               // absolute WC at this level

  // ── ABC breakdown at current slider ──────────────────────────────────────────
  const abcRows = ['A', 'B', 'C'].map(cls => {
    const group = abcSkus.filter(k => k.abcClass === cls);
    const gW    = group.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0) || 1;
    const target = SENS_SL_TARGETS[cls];
    const sl     = group.reduce((s, k) => {
      const skuSL = ratio >= 1 ? target : target * Math.pow(ratio, 0.3);
      return s + skuSL * (k.meioSafetyStock * k.unitCost);
    }, 0) / gW;
    const clsWC  = (ratio - 1) * group.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
    return { cls, sl, target, clsWC };
  });

  // ── Sparkline helpers ────────────────────────────────────────────────────────
  // chart width / height for inline SVG
  const CW = 520, CH = 96;
  const slMin = 85, slMax = 100;
  const px = p => ((p - 50) / 100) * CW;
  const py = v => CH - ((v - slMin) / (slMax - slMin)) * CH;

  const slPath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.pct).toFixed(1)},${py(p.sl).toFixed(1)}`).join(' ');
  // marker at current slider
  const markerX = px(level);
  const markerY = py(portfSL);

  // ── Formatters ───────────────────────────────────────────────────────────────
  const fmtM  = v => { const a = Math.abs(v); return (a >= 1e6 ? `$${(a/1e6).toFixed(1)}M` : `$${(a/1e3).toFixed(0)}K`); };
  const sign  = wcDelta >= 0 ? '+' : '−';
  const slColor = portfSL >= 97 ? '#0F766E' : portfSL >= 94 ? '#D97706' : '#DC2626';
  const wcColor = wcDelta <= 0  ? '#0F766E' : '#DC2626';

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface transition-colors text-left"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <span className="text-base">📊</span>
          </div>
          <div>
            <div className="text-sm font-bold text-ink">Sensitivity Analysis</div>
            <div className="text-xs text-muted mt-0.5">
              Adjust inventory level — see the impact on service level and working capital
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {open && (
        <div className="border-t border-border-light px-5 pb-6 pt-5 space-y-6">

          {/* ── Slider ──────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold text-ink">Inventory Level</span>
              <span className="text-sm font-bold" style={{ color: level < 100 ? '#D97706' : level > 100 ? '#4F46E5' : '#0F766E' }}>
                {level}% of MEIO recommended
              </span>
            </div>
            <div className="relative">
              <input
                type="range" min={50} max={150} step={1}
                value={level}
                onChange={e => setLevel(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-teal-600"
                style={{ background: `linear-gradient(to right, #0F766E ${((level - 50) / 100) * 100}%, #E2E8F0 ${((level - 50) / 100) * 100}%)` }}
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>50%</span>
                <span className="font-bold text-teal-700">100% MEIO</span>
                <span>150%</span>
              </div>
            </div>
          </div>

          {/* ── Two KPI cards ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">

            {/* Service Level */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
                Projected Service Level
              </div>
              <div className="text-3xl font-black leading-none mb-0.5" style={{ color: slColor }}>
                {portfSL.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 mb-3">portfolio weighted average</div>
              {/* ABC breakdown */}
              <div className="space-y-1.5">
                {abcRows.map(r => {
                  const pct = Math.min(100, ((r.sl - 85) / 15) * 100);
                  const c   = r.sl >= r.target - 0.5 ? '#0F766E' : r.sl >= r.target - 2 ? '#D97706' : '#DC2626';
                  return (
                    <div key={r.cls}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-semibold" style={{ color: ABC_COLORS[r.cls] }}>Class {r.cls}</span>
                        <span className="text-[10px] font-mono font-bold" style={{ color: c }}>{r.sl.toFixed(1)}%
                          <span className="text-slate-400 font-normal"> / {r.target}% target</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-150" style={{ width: `${pct}%`, background: c }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Working Capital */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
                Working Capital Impact
              </div>
              <div className="text-3xl font-black leading-none mb-0.5" style={{ color: wcColor }}>
                {sign}{fmtM(wcDelta)}
              </div>
              <div className="text-[10px] text-slate-500 mb-3">
                {wcDelta <= 0 ? 'released vs. MEIO baseline' : 'additional vs. MEIO baseline'}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                  <span className="text-[10px] text-slate-500">Total SS investment</span>
                  <span className="text-xs font-bold text-ink">{fmtM(wcTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                  <span className="text-[10px] text-slate-500">MEIO baseline</span>
                  <span className="text-xs font-semibold text-slate-600">{fmtM(meioWC)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[10px] text-slate-500">vs. baseline</span>
                  <span className="text-xs font-bold" style={{ color: wcColor }}>
                    {wcDelta >= 0 ? '+' : ''}{((ratio - 1) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── SL curve sparkline ────────────────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Service Level vs. Inventory Level
            </div>
            <div className="relative w-full overflow-hidden rounded-lg bg-slate-50 border border-slate-200 px-3 pt-3 pb-5">
              <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ height: 96 }}>
                {/* Target bands */}
                <rect x={0} y={py(99.5)} width={CW} height={py(97) - py(99.5)} fill="#F0FDFA" opacity={0.6} />
                <rect x={0} y={py(97)}   width={CW} height={py(94) - py(97)}   fill="#FFFBEB" opacity={0.6} />
                <rect x={0} y={py(94)}   width={CW} height={CH - py(94)}       fill="#FEF2F2" opacity={0.6} />
                {/* Grid lines */}
                {[99.5, 97, 94].map(v => (
                  <line key={v} x1={0} x2={CW} y1={py(v)} y2={py(v)} stroke="#CBD5E1" strokeWidth={0.5} strokeDasharray="3,3" />
                ))}
                {/* 100% MEIO vertical */}
                <line x1={px(100)} x2={px(100)} y1={0} y2={CH} stroke="#0F766E" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
                {/* SL curve */}
                <path d={slPath} fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinejoin="round" />
                {/* Current marker */}
                <line x1={markerX} x2={markerX} y1={0} y2={CH} stroke="#1D4ED8" strokeWidth={1.5} opacity={0.6} />
                <circle cx={markerX} cy={markerY} r={5} fill="#1D4ED8" stroke="white" strokeWidth={2} />
              </svg>
              {/* Y axis labels */}
              <div className="absolute top-3 right-2 space-y-0 text-right pointer-events-none" style={{ top: 6 }}>
                {[{v:99.5,c:'#0F766E'},{v:97,c:'#D97706'},{v:94,c:'#DC2626'}].map(({v,c}) => (
                  <div key={v} className="text-[9px] font-semibold leading-none mb-1" style={{ color: c }}>{v}%</div>
                ))}
              </div>
              {/* X axis labels */}
              <div className="absolute bottom-1 left-3 right-3 flex justify-between text-[9px] text-slate-400 font-mono pointer-events-none">
                <span>50%</span><span>75%</span><span className="text-teal-700 font-semibold">100%</span><span>125%</span><span>150%</span>
              </div>
            </div>
          </div>

          {/* ── Impact table by class ─────────────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Portfolio Impact at This Inventory Level
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">SKUs in target</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Inventory value</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">WC vs baseline</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Service level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {abcRows.map((r, i) => {
                    const group   = abcSkus.filter(k => k.abcClass === r.cls);
                    const target  = SENS_SL_TARGETS[r.cls];
                    // SKUs in target: on-hand adjusted by slider within MEIO ±range
                    const inTgt   = group.filter(k => {
                      const adj = k.meioSafetyStock * ratio;
                      return adj >= k.meioSafetyStock * MEIO_RANGE_MIN_MULT && adj <= k.meioSafetyStock * MEIO_RANGE_MAX_MULT;
                    }).length;
                    const invVal  = group.reduce((s, k) => s + k.meioSafetyStock * ratio * k.unitCost, 0);
                    const wcSign  = r.clsWC >= 0 ? '+' : '−';
                    const slOk    = r.sl >= target - 0.5;
                    return (
                      <tr key={r.cls} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 font-bold text-[11px]" style={{ color: ABC_COLORS[r.cls] }}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ABC_COLORS[r.cls] }} />
                            Class {r.cls}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-ink">{inTgt}</span>
                          <span className="text-slate-400"> / {group.length}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-ink">
                          {invVal >= 1e6 ? `$${(invVal / 1e6).toFixed(1)}M` : `$${(invVal / 1e3).toFixed(0)}K`}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: r.clsWC <= 0 ? '#0F766E' : '#DC2626' }}>
                          {wcSign}{Math.abs(r.clsWC) >= 1e6 ? `$${(Math.abs(r.clsWC)/1e6).toFixed(1)}M` : `$${(Math.abs(r.clsWC)/1e3).toFixed(0)}K`}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-bold" style={{ color: slOk ? '#0F766E' : '#DC2626' }}>{r.sl.toFixed(1)}%</span>
                          <span className="text-slate-400 text-[10px]"> / {target}%</span>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  {(() => {
                    const totalInv = abcSkus.reduce((s, k) => s + k.meioSafetyStock * ratio * k.unitCost, 0);
                    const totalInTgt = abcSkus.filter(k => {
                      const adj = k.meioSafetyStock * ratio;
                      return adj >= k.meioSafetyStock * MEIO_RANGE_MIN_MULT && adj <= k.meioSafetyStock * MEIO_RANGE_MAX_MULT;
                    }).length;
                    const wcSign = wcDelta >= 0 ? '+' : '−';
                    return (
                      <tr className="bg-slate-100 border-t border-slate-200 font-bold">
                        <td className="px-3 py-2.5 text-[11px] text-ink">Portfolio</td>
                        <td className="px-3 py-2.5 text-right text-ink">
                          {totalInTgt} <span className="font-normal text-slate-400">/ {abcSkus.length}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-ink">
                          {totalInv >= 1e6 ? `$${(totalInv / 1e6).toFixed(1)}M` : `$${(totalInv / 1e3).toFixed(0)}K`}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ color: wcDelta <= 0 ? '#0F766E' : '#DC2626' }}>
                          {wcSign}{Math.abs(wcDelta) >= 1e6 ? `$${(Math.abs(wcDelta)/1e6).toFixed(1)}M` : `$${(Math.abs(wcDelta)/1e3).toFixed(0)}K`}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ color: portfSL >= 97 ? '#0F766E' : '#DC2626' }}>
                          {portfSL.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Planner Header ───────────────────────────────────────────────────────────
const ABC_SL_TARGETS = { A: 99.5, B: 98.0, C: 95.0 };

function computePlannerHeaderData(skus) {
  const MIN_M = MEIO_RANGE_MIN_MULT;
  const MAX_M = MEIO_RANGE_MAX_MULT;
  const abcSkus = computeABCClass(skus);

  // Inventory value
  const totalOnHand = skus.reduce((s, k) => s + k.onHand * k.unitCost, 0);
  const meioMedian  = skus.reduce((s, k) => s + k.meioSafetyStock * k.unitCost, 0);
  const invRangeMin = meioMedian * MIN_M;
  const invRangeMax = meioMedian * MAX_M;

  // SKU counts
  const skusAbove   = skus.filter(k => k.onHand > k.meioSafetyStock * MAX_M).length;
  const skusBelow   = skus.filter(k => k.onHand < k.meioSafetyStock * MIN_M).length;
  const skusInRange = skus.length - skusAbove - skusBelow;
  const total       = skus.length;

  // Projected SL per SKU
  const projSL = abcSkus.map(k => {
    const target = ABC_SL_TARGETS[k.abcClass] ?? 95;
    const ratio  = k.meioSafetyStock > 0 ? k.onHand / k.meioSafetyStock : 1;
    const sl     = ratio >= 1 ? target : target * Math.pow(ratio, 0.3);
    return { cls: k.abcClass, sl, target, val: Math.max(0, k.onHand * k.unitCost) };
  });

  const totalVal = projSL.reduce((s, x) => s + x.val, 0) || 1;
  const portfSL  = projSL.reduce((s, x) => s + x.sl * x.val, 0) / totalVal;
  const portfSlMin = Math.min(...projSL.map(x => x.sl));
  const portfSlMax = Math.max(...projSL.map(x => x.sl));

  const abcSL = ['A', 'B', 'C'].map(cls => {
    const group  = projSL.filter(x => x.cls === cls);
    const target = ABC_SL_TARGETS[cls];
    if (!group.length) return { cls, min: target, max: target, median: target, target };
    const gTotal = group.reduce((s, x) => s + x.val, 0) || 1;
    const median = group.reduce((s, x) => s + x.sl * x.val, 0) / gTotal;
    return { cls, min: Math.min(...group.map(x => x.sl)), max: Math.max(...group.map(x => x.sl)), median, target };
  });

  return { totalOnHand, meioMedian, invRangeMin, invRangeMax, skusAbove, skusBelow, skusInRange, total, portfSL, portfSlMin, portfSlMax, abcSL };
}

const ABC_CLS_COLORS = { A: '#0F766E', B: '#4F46E5', C: '#94A3B8' };

function PlannerHeader({ skus, lastRun, rerunState, onRerunMEIO }) {
  const m = computePlannerHeaderData(skus);
  const fmtM   = v => `$${(v / 1e6).toFixed(1)}M`;
  const fmtPct = v => `${v.toFixed(1)}%`;

  const invInRange = m.totalOnHand >= m.invRangeMin && m.totalOnHand <= m.invRangeMax;
  const invStatus  = invInRange
    ? 'Within MEIO range'
    : m.totalOnHand > m.invRangeMax
      ? `${fmtM(m.totalOnHand - m.invRangeMax)} above ceiling`
      : `${fmtM(m.invRangeMin - m.totalOnHand)} below floor`;

  const skuSubtext = m.skusAbove === 0 && m.skusBelow === 0
    ? 'All within MEIO range'
    : [m.skusAbove ? `${m.skusAbove} above ceiling` : '', m.skusBelow ? `${m.skusBelow} below floor` : ''].filter(Boolean).join(' · ');

  // Inv value range bar helpers
  const invWin = m.invRangeMax * 1.12;
  const invC   = v => Math.max(0, Math.min(100, (v / invWin) * 100));
  const invBL  = invC(m.invRangeMin);
  const invBW  = invC(m.invRangeMax) - invBL;
  const invMk  = invC(m.totalOnHand);
  const invMkColor = invInRange ? '#15803D' : m.totalOnHand > m.invRangeMax ? '#D97706' : '#DC2626';

  return (
    <div className="space-y-3">
      {/* KPI strip + Re-run button */}
      <div className="flex items-center justify-between">
        <div />
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={onRerunMEIO}
            disabled={rerunState !== 'idle'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-semibold transition-opacity disabled:opacity-70"
            style={{ background: '#0F766E' }}
          >
            {rerunState === 'running' ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recalculating…</>
            ) : rerunState === 'done' ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Up to date</>
            ) : (
              <>⟳ Re-run MEIO</>
            )}
          </button>
          {rerunState === 'done' && (() => {
            const nextQ = new Date();
            nextQ.setMonth(nextQ.getMonth() + 3);
            const nextQLabel = nextQ.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            return (
              <div className="flex items-center gap-1.5 text-[10px] text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>MEIO is up to date · next run scheduled <strong>{nextQLabel}</strong></span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3-card KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Card 1: Total Inventory Value ── */}
        <div className="bg-white border border-border-light rounded-xl p-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Total Inventory Value</div>
          <div className="text-3xl font-black text-slate-900 leading-none">{fmtM(m.totalOnHand)}</div>
          <div className="text-xs text-slate-400 mt-1">
            MEIO target median <span className="font-semibold text-slate-600">{fmtM(m.meioMedian)}</span>
          </div>
          {/* Range bar */}
          <div className="mt-3">
            <div className="relative w-full h-4 bg-slate-100 rounded-full">
              <div
                className="absolute top-0 bottom-0 rounded-full bg-teal-600/20 border border-teal-600/30"
                style={{ left: `${invBL}%`, width: `${invBW}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[9px] font-black leading-none select-none"
                style={{ left: `${invMk}%`, color: invMkColor }}
              >▲</div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 font-semibold mt-1">
              <span>{fmtM(m.invRangeMin)}</span>
              <span className="text-[10px] text-slate-400">MEIO range</span>
              <span>{fmtM(m.invRangeMax)}</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${invInRange ? 'text-green-700' : m.totalOnHand > m.invRangeMax ? 'text-amber-600' : 'text-red-600'}`}>
              {invStatus}
            </div>
          </div>
        </div>

        {/* ── Card 2: SKUs in MEIO Range ── */}
        <div className="bg-white border border-border-light rounded-xl p-4 flex flex-col">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">SKUs in MEIO Range</div>
          <div className="flex items-end gap-2 mt-1">
            <span className={`text-5xl font-black leading-none ${m.skusInRange === m.total ? 'text-green-700' : 'text-slate-900'}`}>
              {m.skusInRange}
            </span>
            <span className="text-xl font-semibold text-slate-400 pb-1">/ {m.total}</span>
          </div>
          <div className={`text-sm mt-2 font-semibold ${m.skusInRange === m.total ? 'text-green-600' : 'text-amber-600'}`}>
            {skuSubtext}
          </div>
          <div className="mt-auto pt-3 flex flex-wrap gap-2">
            {m.skusAbove > 0 && (
              <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">
                {m.skusAbove} over-stocked
              </span>
            )}
            {m.skusBelow > 0 && (
              <span className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs font-semibold">
                {m.skusBelow} under-stocked
              </span>
            )}
            {m.skusInRange === m.total && (
              <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Portfolio fully within MEIO bounds
              </span>
            )}
          </div>
        </div>

        {/* ── Card 3: Projected Service Level ── */}
        <div className="bg-white border border-border-light rounded-xl p-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Projected Service Level</div>
          <div className="text-3xl font-black text-slate-900 leading-none">{fmtPct(m.portfSL)}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            Portfolio weighted median · range{' '}
            <span className="font-semibold text-slate-600">{fmtPct(m.portfSlMin)} – {fmtPct(m.portfSlMax)}</span>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200">
            <Target className="w-3 h-3 text-teal-600 shrink-0" />
            <span className="text-[10px] font-semibold text-teal-700">At recommended MEIO safety stock levels</span>
          </div>
          {/* ABC class SL breakdown */}
          <div className="mt-3 space-y-2.5">
            {m.abcSL.map(({ cls, min, max, median, target }) => {
              const color    = ABC_CLS_COLORS[cls];
              const atTarget = median >= target - 0.1;
              // Map [90, 100] → [0, 100]%
              const sc = v => Math.max(0, Math.min(100, (v - 90) * 10));
              return (
                <div key={cls} className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0"
                    style={{ color, background: color + '18', border: `1px solid ${color}50` }}
                  >{cls}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-xs font-bold" style={{ color }}>{fmtPct(median)}</span>
                      <span className="text-[10px] text-slate-400">{fmtPct(min)} – {fmtPct(max)}</span>
                    </div>
                    {/* Mini SL bar: scale 90–100% */}
                    <div className="relative w-full h-1.5 bg-slate-100 rounded-full">
                      {/* Range band */}
                      <div
                        className="absolute top-0 bottom-0 rounded-full"
                        style={{ left: `${sc(min)}%`, width: `${sc(max) - sc(min)}%`, background: color + '35', border: `1px solid ${color}55` }}
                      />
                      {/* Target tick */}
                      <div
                        className="absolute top-0 bottom-0 w-px"
                        style={{ left: `${sc(target)}%`, background: color + '80' }}
                      />
                      {/* Median dot */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-white"
                        style={{ left: `${sc(median)}%`, background: color }}
                      />
                    </div>
                  </div>
                  {atTarget
                    ? <span className="text-[10px] text-green-600 font-bold shrink-0">✓</span>
                    : <span className="text-[10px] text-amber-600 font-bold shrink-0">!</span>
                  }
                </div>
              );
            })}
            <div className="text-[10px] text-slate-400 pt-0.5 flex justify-between">
              <span>90%</span><span>95%</span><span>100%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function PlanningView({ skus, scenario, setScenario, ssMultipliers, setSsMultipliers, onNavigate, onDecision, rowStates = {}, onRowStateChange }) {
  const [rerunState, setRerunState] = useState('idle'); // idle | running | done
  const [toast, setToast]           = useState('');
  const [highlightedSku, setHighlightedSku] = useState(null);
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

      {/* Page title */}
      <div>
        <h1 className="text-base font-bold text-ink">Inventory Plan — MEIO-Driven Calculations</h1>
        <p className="text-xs text-muted mt-0.5">Baseline safety stock and inventory targets calculated by MEIO. Recalculate each quarter or after major demand/supply changes.</p>
      </div>

      {/* Planner header — 3-card KPI strip */}
      <PlannerHeader
        skus={skus}
        lastRun={lastRun}
        rerunState={rerunState}
        onRerunMEIO={handleRerunMEIO}
      />

      {/* MEIO methodology — collapsible drill-down */}
      <MEIOBaseline skus={skus} optimized={optimized} ssMultipliers={ssMultipliers} scenario={scenario} />

      {/* ABC classification legend */}
      <ABCLegend />

      {/* Inventory Analysis — model results */}
      <InventoryAnalysis
        skus={skus}
        optimized={optimized}
        onDecision={onDecision}
        rowStates={rowStates}
        onRowStateChange={onRowStateChange}
      />

      {/* Demand vs Revenue — Service Segmentation */}
      <DemandRevenueChart skus={skus} />

    </div>
  );
}
