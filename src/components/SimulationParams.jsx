import { useState, useMemo } from 'react';
import { RotateCcw, Save, AlertTriangle, ChevronDown, ChevronUp, X, Check, Info } from 'lucide-react';
import { computeABCClass } from '../data/skuData';

const SIM_COLOR  = '#0F766E';
const SIM_BG     = '#F0FDFA';

// ── Class colours ─────────────────────────────────────────────────────────────
export const CLASS_COLORS  = { A: '#0F766E', B: '#4F46E5', C: '#94A3B8' };
export const CLASS_BG      = { A: '#F0FDFA', B: '#EEF2FF', C: '#F8FAFC' };
export const CLASS_BORDER  = { A: '#99F6E4', B: '#C7D2FE', C: '#E2E8F0' };
export const CLASS_LABEL   = { A: 'Class A', B: 'Class B', C: 'Class C' };
export const CLASS_DESC    = {
  A: 'High-revenue · 80% portfolio revenue · SL 99.5%',
  B: 'Mid-revenue · 15% portfolio revenue · SL 98%',
  C: 'Lower-revenue · 5% portfolio revenue · SL 95%',
};

// ── Z-score lookup (service level → Z) ───────────────────────────────────────
const Z = {
  90.0:1.282, 90.5:1.330, 91.0:1.341, 91.5:1.372, 92.0:1.405,
  92.5:1.440, 93.0:1.476, 93.5:1.514, 94.0:1.555, 94.5:1.598,
  95.0:1.645, 95.5:1.695, 96.0:1.751, 96.5:1.812, 97.0:1.881,
  97.5:1.960, 98.0:2.054, 98.5:2.170, 99.0:2.326, 99.5:2.576,
  99.9:3.090,
};
function getZ(sl) {
  const key = Math.round(sl * 10) / 10;
  return Z[key] ?? 1.645;
}

// ── Posture & stocking config ─────────────────────────────────────────────────
const POSTURE_MULT  = { conservative: 1.3, base: 1.0, optimistic: 0.8 };
const STOCKING_MULT = { centralized: 1.0, regional: 1.25, 'market-level': 1.6 };
const STOCKING_LEAD = { centralized: '+5 days', regional: '+2 days', 'market-level': 'no extra delay' };

// ── Defaults ──────────────────────────────────────────────────────────────────
export const PARAM_DEFAULTS = {
  serviceLevel:   { A: 99.5, B: 98.0, C: 95.0 },
  posture:        { mode: 'global', global: 'base',     perClass: { A: 'base', B: 'base', C: 'base' } },
  stocking:       { mode: 'global', global: 'regional', perClass: { A: 'regional', B: 'regional', C: 'centralized' } },
  leadBuffer:     { mode: 'global', global: 7,          perClass: { A: 7, B: 7, C: 7 } },
  wcCap:          { enabled: false, value: 50 },
};

const BASE_SL = { A: 99.5, B: 98.0, C: 95.0 };

// ── $ formatting ──────────────────────────────────────────────────────────────
function fmt$(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n < 0 ? '-' : '') + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (n < 0 ? '-' : '') + '$' + (abs / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
function fmtDelta(n) {
  if (n === 0) return '—';
  return (n > 0 ? '+' : '') + fmt$(n);
}

// ── Core computation ──────────────────────────────────────────────────────────
// Returns per-class and portfolio-level metrics for a given param set
function computeMetrics(skus, params) {
  const abcSkus = computeABCClass(skus);

  const result = {};
  let totalSSValue = 0;
  let totalWCAtRisk = 0;

  for (const cls of ['A', 'B', 'C']) {
    const clsSkus = abcSkus.filter(s => s.abcClass === cls);
    const zBase = getZ(BASE_SL[cls]);
    const zNew  = getZ(params.serviceLevel[cls]);

    const postureMult  = POSTURE_MULT[
      params.posture.mode === 'global'
        ? params.posture.global
        : params.posture.perClass[cls]
    ] ?? 1.0;

    const stockingMult = STOCKING_MULT[
      params.stocking.mode === 'global'
        ? params.stocking.global
        : params.stocking.perClass[cls]
    ] ?? 1.0;

    const bufferDays = params.leadBuffer.mode === 'global'
      ? params.leadBuffer.global
      : params.leadBuffer.perClass[cls];

    let ssValueBase    = 0;  // baseline MEIO SS value ($)
    let ssValueNew     = 0;  // new SS value ($)
    let ssValueLtDelta = 0;  // $ change from lead-time buffer only

    for (const sku of clsSkus) {
      const avgMonthlyDemand = sku.monthlyDemand.reduce((a, b) => a + b, 0) / 12;
      const avgDailyDemand   = avgMonthlyDemand / 30;
      const ltDays           = sku.leadTimeWeeks * 7;
      const unitValue        = sku.unitCost;  // use cost for inventory valuation

      // Baseline SS ($) — from MEIO model
      const baseSSValue = sku.meioSafetyStock * unitValue;
      ssValueBase += baseSSValue;

      // SS adjusted for new service level: SS ∝ Z × CV × √LT
      const slRatio     = zNew / zBase;

      // SS adjusted for posture and stocking
      const newSSUnits  = sku.meioSafetyStock * slRatio * postureMult * stockingMult;
      ssValueNew += newSSUnits * unitValue;

      // Lead-time buffer additional SS = avgDailyDemand × demandCV × bufferDays × unitValue
      const ltBufferSSValue = avgDailyDemand * sku.demandCV * bufferDays * unitValue;
      ssValueLtDelta += ltBufferSSValue;
    }

    const totalClassSS = ssValueNew + ssValueLtDelta;
    const deltaVsBase  = totalClassSS - ssValueBase;

    result[cls] = {
      ssValueBase,
      ssValueNew: totalClassSS,
      deltaVsBase,
      skuCount: clsSkus.length,
      postureMult,
      stockingMult,
      bufferDays,
    };

    totalSSValue += totalClassSS;
    if (deltaVsBase < 0) totalWCAtRisk += Math.abs(deltaVsBase);
  }

  result.total = {
    ssValue: totalSSValue,
    ssBase:  result.A.ssValueBase + result.B.ssValueBase + result.C.ssValueBase,
    deltaVsBase: totalSSValue - (result.A.ssValueBase + result.B.ssValueBase + result.C.ssValueBase),
  };

  return result;
}

// Compute which classes/SKUs fall below SS target under a WC cap
function computeWCCapImpact(skus, metrics, capM) {
  const cap = capM * 1e6;
  if (metrics.total.ssValue <= cap) return null;

  const overage = metrics.total.ssValue - cap;
  const abcSkus = computeABCClass(skus);
  const affected = [];

  // Apply cap impact proportionally by class (C first, then B, then A)
  let remaining = overage;
  for (const cls of ['C', 'B', 'A']) {
    if (remaining <= 0) break;
    const classCapImpact = Math.min(remaining, metrics[cls].ssValueNew);
    const clsSkus = abcSkus.filter(s => s.abcClass === cls);
    const skusBelow = Math.round((classCapImpact / metrics[cls].ssValueNew) * clsSkus.length);
    const marginAtRisk = classCapImpact * 2.5; // rough revenue margin multiplier
    affected.push({ cls, skusBelow, classCapImpact, marginAtRisk });
    remaining -= classCapImpact;
  }

  return { overage, affected };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-bold text-ink">{title}</div>
      {sub && <div className="text-xs text-muted mt-0.5 leading-relaxed">{sub}</div>}
    </div>
  );
}

function ClassDot({ cls, size = 'sm' }) {
  const s = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  return <span className={`${s} rounded-full shrink-0 inline-block`} style={{ background: CLASS_COLORS[cls] }} />;
}

function PerClassToggle({ mode, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
      style={mode === 'per-class'
        ? { background: '#0F766E', color: '#fff', borderColor: '#0F766E' }
        : { background: '#F8FAFC', color: '#64748B', borderColor: '#E2E8F0' }}>
      {mode === 'per-class' ? 'Per class ✓' : 'Per class'}
    </button>
  );
}

function ThreeWayToggle({ options, value, onChange, colorMap }) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
      {options.map(opt => {
        const active = value === opt.value;
        const color  = colorMap?.[opt.value] ?? '#0F766E';
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="flex-1 py-1.5 px-2 transition-colors text-center"
            style={active
              ? { background: color, color: '#fff' }
              : { background: '#F8FAFC', color: '#64748B' }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const POSTURE_OPTIONS  = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'base',         label: 'Base' },
  { value: 'optimistic',   label: 'Optimistic' },
];
const STOCKING_OPTIONS = [
  { value: 'centralized',  label: 'Centralized' },
  { value: 'regional',     label: 'Regional' },
  { value: 'market-level', label: 'Market-Level' },
];
const POSTURE_COLORS  = { conservative: '#D97706', base: '#0F766E', optimistic: '#4F46E5' };
const STOCKING_COLORS = { centralized: '#4F46E5', regional: '#0F766E', 'market-level': '#DC2626' };

// ── Impact chip ───────────────────────────────────────────────────────────────
function ImpactChip({ delta, label }) {
  if (!delta || delta === 0) return null;
  const positive = delta > 0;
  return (
    <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg px-3 py-2"
      style={{ background: positive ? '#FEF3C7' : '#F0FDF4', color: positive ? '#92400E' : '#065F46' }}>
      <Info className="w-3 h-3 shrink-0 mt-0.5" />
      <span><strong>{fmtDelta(delta)}</strong> vs. MEIO baseline — {label}</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
// When used standalone: manages its own scenarios internally.
// When used from ScenarioTable: receives initialName, initialParams, onSave, onCancel.
export default function SimulationParams({ skus, initialName, initialParams, onSave, onCancel, savedScenarios: extScenarios, setSavedScenarios: extSetScenarios, showComparison: extShowComparison, setShowComparison: extSetShowComparison }) {
  const controlled = !!onSave;

  const [params, setParams]                 = useState(initialParams ?? PARAM_DEFAULTS);
  const [intScenarios, setIntScenarios]     = useState([]);
  const [intShowComparison, setIntShow]     = useState(false);

  const savedScenarios      = extScenarios      ?? intScenarios;
  const setSavedScenarios   = extSetScenarios   ?? setIntScenarios;
  const showComparison      = extShowComparison ?? intShowComparison;
  const setShowComparison   = extSetShowComparison ?? setIntShow;

  // Active scenario name — null means no scenario created yet (only used in standalone mode)
  const [activeName, setActiveName]             = useState(controlled ? (initialName ?? null) : null);

  // "Add scenario" dialog state (standalone only)
  const [addDialogOpen, setAddDialogOpen]       = useState(false);
  const [draftName, setDraftName]               = useState('');

  const metrics = useMemo(() => computeMetrics(skus, params), [skus, params]);
  const wcCapImpact = useMemo(() => {
    if (!params.wcCap.enabled) return null;
    return computeWCCapImpact(skus, metrics, params.wcCap.value);
  }, [skus, metrics, params.wcCap]);

  function setServiceLevel(cls, val) {
    setParams(p => ({ ...p, serviceLevel: { ...p.serviceLevel, [cls]: val } }));
  }
  function setPostureGlobal(val) {
    setParams(p => ({ ...p, posture: { ...p.posture, global: val } }));
  }
  function setPosturePerClass(cls, val) {
    setParams(p => ({ ...p, posture: { ...p.posture, perClass: { ...p.posture.perClass, [cls]: val } } }));
  }
  function setPostureMode(mode) {
    setParams(p => ({ ...p, posture: { ...p.posture, mode } }));
  }
  function setStockingGlobal(val) {
    setParams(p => ({ ...p, stocking: { ...p.stocking, global: val } }));
  }
  function setStockingPerClass(cls, val) {
    setParams(p => ({ ...p, stocking: { ...p.stocking, perClass: { ...p.stocking.perClass, [cls]: val } } }));
  }
  function setStockingMode(mode) {
    setParams(p => ({ ...p, stocking: { ...p.stocking, mode } }));
  }
  function setLeadBufferGlobal(val) {
    setParams(p => ({ ...p, leadBuffer: { ...p.leadBuffer, global: val } }));
  }
  function setLeadBufferPerClass(cls, val) {
    setParams(p => ({ ...p, leadBuffer: { ...p.leadBuffer, perClass: { ...p.leadBuffer.perClass, [cls]: val } } }));
  }
  function setLeadBufferMode(mode) {
    setParams(p => ({ ...p, leadBuffer: { ...p.leadBuffer, mode } }));
  }

  function reset() { setParams(PARAM_DEFAULTS); }

  function createScenario() {
    if (!draftName.trim()) return;
    setActiveName(draftName.trim());
    setParams(PARAM_DEFAULTS);
    setAddDialogOpen(false);
    setDraftName('');
  }

  function saveScenario() {
    if (!activeName) return;
    if (controlled) {
      onSave({ name: activeName, params: JSON.parse(JSON.stringify(params)), metrics });
    } else {
      setSavedScenarios(prev => [
        ...prev,
        { name: activeName, params: JSON.parse(JSON.stringify(params)), metrics },
      ]);
      setShowComparison(true);
      setActiveName(null);
      setParams(PARAM_DEFAULTS);
    }
  }

  function loadScenario(s) {
    setActiveName(s.name + ' (copy)');
    setParams(JSON.parse(JSON.stringify(s.params)));
  }

  const totalDelta = metrics.total.deltaVsBase;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!activeName) {
    return (
      <div className="space-y-4">
        {/* Prompt card */}
        <div className="bg-white border border-border-light rounded-xl p-8 flex flex-col items-center text-center shadow-sm">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: SIM_BG }}>
            <Save className="w-5 h-5" style={{ color: SIM_COLOR }} />
          </div>
          <h3 className="text-base font-bold text-ink mb-1">Build an inventory scenario</h3>
          <p className="text-sm text-muted max-w-sm mb-6">
            Name your scenario, set your planning parameters, then review the live inventory and working capital impact.
          </p>
          {!addDialogOpen ? (
            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: SIM_COLOR }}>
              + Add Scenario
            </button>
          ) : (
            <div className="w-full max-w-sm space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="e.g. Q3 Conservative, WC Release Plan, Peak Build…"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createScenario()}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-ink outline-none focus:border-teal-500 text-center"
              />
              <div className="flex gap-2">
                <button onClick={() => { setAddDialogOpen(false); setDraftName(''); }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-muted hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={createScenario}
                  className="flex-1 py-2 rounded-xl text-white text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ background: SIM_COLOR }}>
                  Start Building →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Saved scenarios comparison (still visible even with no active scenario) */}
        {savedScenarios.length > 0 && (
          <SavedScenariosPanel
            savedScenarios={savedScenarios}
            setSavedScenarios={setSavedScenarios}
            showComparison={showComparison}
            setShowComparison={setShowComparison}
            onLoad={loadScenario}
            metrics={null}
            params={null}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Two-column layout: params left, output right ─────────────────── */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT: Parameter panel ───────────────────────────────────────── */}
        <div className="w-[400px] shrink-0 space-y-3">

          {/* Scenario name bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border border-border-light rounded-xl shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: SIM_COLOR }} />
              <span className="text-sm font-bold text-ink truncate">{activeName}</span>
              <span className="text-xs text-muted shrink-0">· editing</span>
            </div>
            <button onClick={() => { controlled ? onCancel?.() : (setActiveName(null), setParams(PARAM_DEFAULTS)); }}
              className="text-xs text-muted hover:text-ink transition-colors shrink-0 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ─ 1. Service Level ──────────────────────────────────────────── */}
          <div className="bg-white border border-border-light rounded-xl p-4 shadow-sm">
            <SectionHeader
              title="1 · Target Service Level by Class"
              sub="Probability of not stocking out. Higher levels require more safety stock and working capital."
            />
            <div className="space-y-4">
              {['A', 'B', 'C'].map(cls => {
                const val     = params.serviceLevel[cls];
                const delta   = metrics[cls].ssValueNew - metrics[cls].ssValueBase;
                const changed = val !== BASE_SL[cls];
                return (
                  <div key={cls}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <ClassDot cls={cls} />
                        <span className="text-xs font-bold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                        <span className="text-[10px] text-muted">{cls === 'A' ? '(high-revenue)' : cls === 'B' ? '(mid-revenue)' : '(lower-revenue)'}</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: changed ? CLASS_COLORS[cls] : '#64748B' }}>
                        {val.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range" min={90} max={99.9} step={0.5}
                      value={val}
                      onChange={e => setServiceLevel(cls, parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: CLASS_COLORS[cls] }}
                    />
                    <div className="flex justify-between text-[10px] text-muted mt-0.5">
                      <span>90%</span>
                      <span className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>
                        MEIO baseline: {BASE_SL[cls]}%
                      </span>
                      <span>99.9%</span>
                    </div>
                    {changed && (
                      <div className="mt-1.5 text-[11px] rounded-md px-2.5 py-1.5 leading-relaxed"
                        style={{ background: delta > 0 ? '#FEF3C7' : '#F0FDF4', color: delta > 0 ? '#92400E' : '#065F46' }}>
                        {delta > 0
                          ? `Raising Class ${cls} SL from ${BASE_SL[cls]}% → ${val}% adds `
                          : `Lowering Class ${cls} SL from ${BASE_SL[cls]}% → ${val}% releases `}
                        <strong>{fmt$(Math.abs(delta))}</strong> in required safety stock
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─ 2. SS Posture ─────────────────────────────────────────────── */}
          <div className="bg-white border border-border-light rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader title="2 · Safety Stock Posture" />
              <PerClassToggle
                mode={params.posture.mode}
                onToggle={() => setPostureMode(params.posture.mode === 'global' ? 'per-class' : 'global')}
              />
            </div>
            <p className="text-xs text-muted mb-3">Base = MEIO model recommendation. Conservative adds a buffer above the model; Optimistic runs leaner.</p>

            {params.posture.mode === 'global' ? (
              <>
                <ThreeWayToggle options={POSTURE_OPTIONS} value={params.posture.global}
                  onChange={setPostureGlobal} colorMap={POSTURE_COLORS} />
                {params.posture.global !== 'base' && (
                  <ImpactChip
                    delta={(['A','B','C'].reduce((s, c) => s + metrics[c].deltaVsBase, 0))}
                    label={params.posture.global === 'conservative'
                      ? '30% above MEIO — higher buffer for supply uncertainty'
                      : '20% below MEIO — leaner, frees working capital'}
                  />
                )}
              </>
            ) : (
              <div className="space-y-2.5">
                {['A', 'B', 'C'].map(cls => (
                  <div key={cls}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ClassDot cls={cls} />
                      <span className="text-xs font-semibold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                    </div>
                    <ThreeWayToggle options={POSTURE_OPTIONS} value={params.posture.perClass[cls]}
                      onChange={v => setPosturePerClass(cls, v)} colorMap={POSTURE_COLORS} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─ 3. Stocking Strategy ──────────────────────────────────────── */}
          <div className="bg-white border border-border-light rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader title="3 · Stocking Strategy" />
              <PerClassToggle
                mode={params.stocking.mode}
                onToggle={() => setStockingMode(params.stocking.mode === 'global' ? 'per-class' : 'global')}
              />
            </div>
            <p className="text-xs text-muted mb-3">Centralizing inventory reduces total stock but increases lead time to market. Market-Level improves responsiveness but ties up working capital.</p>

            {params.stocking.mode === 'global' ? (
              <>
                <ThreeWayToggle options={STOCKING_OPTIONS} value={params.stocking.global}
                  onChange={setStockingGlobal} colorMap={STOCKING_COLORS} />
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] text-muted text-center">
                  {STOCKING_OPTIONS.map(opt => (
                    <div key={opt.value} className={`px-1 py-1 rounded ${params.stocking.global === opt.value ? 'font-semibold' : ''}`}>
                      Lead time: {STOCKING_LEAD[opt.value]}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2.5">
                {['A', 'B', 'C'].map(cls => (
                  <div key={cls}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ClassDot cls={cls} />
                      <span className="text-xs font-semibold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                      <span className="text-[10px] text-muted ml-auto">
                        {STOCKING_LEAD[params.stocking.perClass[cls]]}
                      </span>
                    </div>
                    <ThreeWayToggle options={STOCKING_OPTIONS} value={params.stocking.perClass[cls]}
                      onChange={v => setStockingPerClass(cls, v)} colorMap={STOCKING_COLORS} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─ 4. Safety Lead Time Buffer ────────────────────────────────── */}
          <div className="bg-white border border-border-light rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader title="4 · Safety Lead Time Buffer" />
              <PerClassToggle
                mode={params.leadBuffer.mode}
                onToggle={() => setLeadBufferMode(params.leadBuffer.mode === 'global' ? 'per-class' : 'global')}
              />
            </div>
            <p className="text-xs text-muted mb-3">Additional days added to system lead time to account for QC release delays or supply disruptions.</p>

            {params.leadBuffer.mode === 'global' ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">Buffer days</span>
                  <span className="text-sm font-bold text-ink">{params.leadBuffer.global} days</span>
                </div>
                <input type="range" min={0} max={30} step={1}
                  value={params.leadBuffer.global}
                  onChange={e => setLeadBufferGlobal(parseInt(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#0F766E' }}
                />
                <div className="flex justify-between text-[10px] text-muted mt-0.5">
                  <span>0 days</span><span>15 days</span><span>30 days</span>
                </div>
                {params.leadBuffer.global !== 7 && (() => {
                  const delta = ['A','B','C'].reduce((s, c) => {
                    const abcSkus = computeABCClass(skus).filter(sk => sk.abcClass === c);
                    return s + abcSkus.reduce((ss, sku) => {
                      const avgDaily = sku.monthlyDemand.reduce((a,b)=>a+b,0)/12/30;
                      return ss + avgDaily * sku.demandCV * (params.leadBuffer.global - 7) * sku.unitCost;
                    }, 0);
                  }, 0);
                  return (
                    <ImpactChip
                      delta={delta}
                      label={`${params.leadBuffer.global > 7 ? 'Adding' : 'Reducing'} ${Math.abs(params.leadBuffer.global - 7)} days vs. 7-day default`}
                    />
                  );
                })()}
              </>
            ) : (
              <div className="space-y-3">
                {['A', 'B', 'C'].map(cls => (
                  <div key={cls}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <ClassDot cls={cls} />
                        <span className="text-xs font-semibold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                      </div>
                      <span className="text-sm font-bold text-ink">{params.leadBuffer.perClass[cls]} days</span>
                    </div>
                    <input type="range" min={0} max={30} step={1}
                      value={params.leadBuffer.perClass[cls]}
                      onChange={e => setLeadBufferPerClass(cls, parseInt(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: CLASS_COLORS[cls] }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─ 5. WC Budget Cap ──────────────────────────────────────────── */}
          <div className="bg-white border border-border-light rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <SectionHeader title="5 · Working Capital Budget Cap" />
              <button
                onClick={() => setParams(p => ({ ...p, wcCap: { ...p.wcCap, enabled: !p.wcCap.enabled } }))}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${params.wcCap.enabled ? 'bg-teal-600' : 'bg-slate-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${params.wcCap.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-muted mb-3">Set a maximum total inventory $ the business will hold. The model shows which products are impacted and the associated service level risk.</p>

            {params.wcCap.enabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Cap ($M)</span>
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden flex-1">
                    <span className="px-2 py-1.5 bg-surface text-xs text-muted border-r border-slate-200">$</span>
                    <input
                      type="number" min={1} step={1}
                      value={params.wcCap.value}
                      onChange={e => setParams(p => ({ ...p, wcCap: { ...p.wcCap, value: parseFloat(e.target.value) || 0 } }))}
                      className="flex-1 px-2 py-1.5 text-sm font-semibold text-ink bg-white outline-none"
                    />
                    <span className="px-2 py-1.5 text-xs text-muted">M</span>
                  </div>
                </div>
                <div className="text-xs text-muted">
                  Current required SS: <strong className="text-ink">{fmt$(metrics.total.ssValue)}</strong>
                  {' · '}
                  Cap: <strong className="text-ink">${params.wcCap.value}M</strong>
                </div>
              </div>
            )}
          </div>

          {/* ─ Actions ───────────────────────────────────────────────────── */}
          <div className="flex gap-2">
            <button onClick={reset}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button onClick={saveScenario}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: SIM_COLOR }}>
              <Save className="w-3.5 h-3.5" /> Save "{activeName}"
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live output panel ────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Current scenario summary */}
          <div className="bg-white border border-border-light rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border-light flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-ink">{activeName}</div>
                <div className="text-xs text-muted mt-0.5">Live output · updates as you adjust parameters</div>
              </div>
              <div className={`text-sm font-bold ${totalDelta > 0 ? 'text-amber-600' : totalDelta < 0 ? 'text-teal-600' : 'text-muted'}`}>
                {totalDelta === 0 ? 'At MEIO baseline' : fmtDelta(totalDelta) + ' vs. baseline'}
              </div>
            </div>

            {/* Per-class breakdown */}
            <div className="divide-y divide-border-light">
              {['A', 'B', 'C'].map(cls => {
                const m = metrics[cls];
                const delta = m.deltaVsBase;
                return (
                  <div key={cls} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
                      <span className="text-sm font-bold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                      <span className="text-xs text-muted">· {m.skuCount} SKUs</span>
                      <span className={`ml-auto text-xs font-bold ${delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-teal-600' : 'text-muted'}`}>
                        {delta === 0 ? '— baseline' : fmtDelta(delta)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <MetricCell label="Required SS" value={fmt$(m.ssValueNew)} />
                      <MetricCell label="MEIO Baseline" value={fmt$(m.ssValueBase)} muted />
                      <MetricCell label="Service Level" value={`${params.serviceLevel[cls].toFixed(1)}%`}
                        highlight={params.serviceLevel[cls] !== BASE_SL[cls]} cls={cls} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <MetricCell label="Posture"
                        value={params.posture.mode === 'global' ? params.posture.global : params.posture.perClass[cls]}
                        capitalize />
                      <MetricCell label="Stocking"
                        value={params.stocking.mode === 'global' ? params.stocking.global : params.stocking.perClass[cls]}
                        capitalize />
                      <MetricCell label="Lead Buffer"
                        value={`${params.leadBuffer.mode === 'global' ? params.leadBuffer.global : params.leadBuffer.perClass[cls]} days`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Portfolio total */}
            <div className="px-5 py-3.5 bg-surface border-t border-border-light flex items-center justify-between">
              <span className="text-xs font-bold text-ink uppercase tracking-wide">Portfolio Total Required SS</span>
              <div className="text-right">
                <div className="text-lg font-bold text-ink">{fmt$(metrics.total.ssValue)}</div>
                <div className="text-xs text-muted">Baseline: {fmt$(metrics.total.ssBase)}</div>
              </div>
            </div>
          </div>

          {/* WC cap warning */}
          {wcCapImpact && (
            <div className="rounded-xl border border-red-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-sm font-bold text-red-700">WC Cap Breached — {fmt$(wcCapImpact.overage)} over budget</span>
              </div>
              <div className="bg-white px-4 py-3 space-y-2">
                {wcCapImpact.affected.map(({ cls, skusBelow, classCapImpact, marginAtRisk }) => (
                  <div key={cls} className="flex items-center gap-3 text-xs">
                    <ClassDot cls={cls} />
                    <span className="font-semibold" style={{ color: CLASS_COLORS[cls] }}>Class {cls}</span>
                    <span className="text-muted">{skusBelow} SKU{skusBelow !== 1 ? 's' : ''} fall below SS target</span>
                    <span className="ml-auto text-red-600 font-semibold">{fmt$(marginAtRisk)} margin at risk</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SavedScenariosPanel
            savedScenarios={savedScenarios}
            setSavedScenarios={setSavedScenarios}
            showComparison={showComparison}
            setShowComparison={setShowComparison}
            onLoad={loadScenario}
            metrics={metrics}
            params={params}
          />
        </div>
      </div>
    </div>
  );
}

// ── Saved scenarios panel (reused in both empty-state and active views) ───────
function SavedScenariosPanel({ savedScenarios, setSavedScenarios, showComparison, setShowComparison, onLoad, metrics, params }) {
  if (savedScenarios.length === 0) return null;
  return (
    <div className="bg-white border border-border-light rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setShowComparison(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface transition-colors">
        <div>
          <span className="text-sm font-bold text-ink">Saved Scenarios</span>
          <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-100 text-teal-700">
            {savedScenarios.length}
          </span>
        </div>
        {showComparison
          ? <ChevronUp className="w-4 h-4 text-muted" />
          : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {showComparison && (
        <div className="border-t border-border-light overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface border-b border-border-light">
                <th className="text-left px-4 py-2.5 text-muted font-semibold uppercase tracking-wide text-[10px] w-36">Metric</th>
                {metrics && (
                  <th className="text-left px-4 py-2.5 text-muted font-semibold uppercase tracking-wide text-[10px]">
                    <span className="text-teal-600">● Editing</span>
                  </th>
                )}
                {savedScenarios.map((s, i) => (
                  <th key={i} className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wide">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-slate-400">◆</span>
                      <span className="text-ink">{s.name}</span>
                      <button
                        onClick={() => onLoad(s)}
                        title="Load into editor"
                        className="ml-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border border-teal-200 text-teal-600 hover:bg-teal-50 transition-colors">
                        Load
                      </button>
                      <button onClick={() => setSavedScenarios(prev => prev.filter((_, j) => j !== i))}
                        className="text-muted hover:text-danger">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              <CompRow label="Total Inv. $"
                current={metrics ? fmt$(metrics.total.ssValue) : null}
                saved={savedScenarios.map(s => fmt$(s.metrics.total.ssValue))} />
              <CompRow label="vs. Baseline"
                current={metrics ? fmtDelta(metrics.total.deltaVsBase) : null}
                saved={savedScenarios.map(s => fmtDelta(s.metrics.total.deltaVsBase))}
                colorFn={v => v?.startsWith('+') ? '#D97706' : v === '—' ? '#94A3B8' : '#0F766E'} />
              {['A', 'B', 'C'].map(cls => (
                <CompRow key={cls} label={`Class ${cls} SS $`}
                  current={metrics ? fmt$(metrics[cls].ssValueNew) : null}
                  saved={savedScenarios.map(s => fmt$(s.metrics[cls].ssValueNew))}
                  cls={cls} />
              ))}
              {['A', 'B', 'C'].map(cls => (
                <CompRow key={`sl-${cls}`} label={`Class ${cls} SL`}
                  current={params ? `${params.serviceLevel[cls].toFixed(1)}%` : null}
                  saved={savedScenarios.map(s => `${s.params.serviceLevel[cls].toFixed(1)}%`)}
                  cls={cls} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────
function MetricCell({ label, value, muted, highlight, cls, capitalize }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-xs font-semibold mt-0.5 ${muted ? 'text-muted' : 'text-ink'} ${capitalize ? 'capitalize' : ''}`}
        style={highlight && cls ? { color: CLASS_COLORS[cls] } : {}}>
        {value}
      </div>
    </div>
  );
}

function CompRow({ label, current, saved, cls, colorFn }) {
  return (
    <tr className="hover:bg-surface/60 transition-colors">
      <td className="px-4 py-2.5 text-muted font-medium">
        <div className="flex items-center gap-1.5">
          {cls && <ClassDot cls={cls} size="sm" />}
          {label}
        </div>
      </td>
      {current !== null && (
        <td className="px-4 py-2.5 font-semibold text-ink"
          style={colorFn ? { color: colorFn(current) } : {}}>
          {current}
        </td>
      )}
      {saved.map((v, i) => (
        <td key={i} className="px-4 py-2.5 font-semibold"
          style={{ color: colorFn ? colorFn(v) : cls ? CLASS_COLORS[cls] : '#64748B' }}>
          {v}
        </td>
      ))}
    </tr>
  );
}
