import { Fragment, useState, useMemo } from 'react';
import {
  Plus, FolderOpen, Copy, Archive, Trash2, X, CheckSquare,
  Truck,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import SupplyChainNodeView from './SupplyChainNodeView';
import { computeVariantKPIs } from './ScenarioWorkspace';

// ─── MEIO plan variant metadata ───────────────────────────────────────────────
// KPIs are computed from real SKU data via computeVariantKPIs — not hardcoded.
const MEIO_VARIANT_META = {
  conservative: { label: 'Conservative Plan', ssMult: 1.15 },
  baseline:     { label: 'Baseline Plan',     ssMult: 1.00 },
  optimistic:   { label: 'Optimistic Plan',   ssMult: 0.85 },
};

// ─── KPI rows shown in the comparison table ───────────────────────────────────
// showAsRange: true → reference column shows optimistic–conservative band
//              false → single value (baseline midpoint)
const KPI_ROWS = [
  {
    key: 'inventoryValue',
    label: 'Total Inventory Value',
    unit: '$M',
    good: 'down',
    showAsRange: true,
    definition: null,
  },
  {
    key: 'wcExposure',
    label: 'Working Capital Impact',
    unit: '$M',
    good: 'down',
    showAsRange: true,
    definition: 'Estimated working capital tied up in inventory (≈27% of total inventory value, reflecting holding costs, financing, and storage). Lower is better.',
  },
  {
    key: 'stockoutRisk',
    label: 'Stockout Risk',
    unit: 'SKUs',
    good: 'down',
    showAsRange: false,
    definition: 'Number of SKUs where current on-hand inventory falls below the MEIO-recommended safety stock target under this scenario. A SKU is flagged when on-hand < (MEIO safety stock × scenario multiplier). Higher safety stock or lower demand variability reduces this count.',
  },
  {
    key: 'serviceLevel',
    label: 'Projected Service Level',
    unit: '%',
    good: 'up',
    showAsRange: true,
    definition: 'Projected portfolio fill rate based on MEIO safety stock coverage. Anchored to 97.0% at the baseline safety stock level; adjusts ±0.3pp per week of coverage above or below the reference. Benchmarks: Class A ≥ 98.5% · Class B ≥ 97.0% · Class C ≥ 95.0%.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNumeric(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    draft:    'bg-slate-100 text-slate-600',
    active:   'bg-teal-100 text-teal-700',
    applied:  'bg-purple-100 text-purple-700',
    archived: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status === 'applied' ? '✓ Applied' : status}
    </span>
  );
}

// ─── Apply confirmation modal ─────────────────────────────────────────────────
function ApplyModal({ scenario, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
        <h3 className="text-base font-semibold text-slate-800 mb-2">Apply this scenario to the inventory plan?</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          The current inventory plan will remain unchanged. This action records the scenario parameters as the new operating target and logs the decision.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
          <p className="text-xs font-semibold text-slate-700">{scenario.name}</p>
          {scenario.params?.scenarioType && (
            <p className="text-xs text-slate-400 mt-0.5">{scenario.params.scenarioType}</p>
          )}
          {scenario.params?.affectedSkus && (
            <p className="text-xs text-slate-400 mt-0.5">Products: {scenario.params.affectedSkus}</p>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors"
          >
            <CheckSquare size={14} /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Scenario Card ────────────────────────────────────────────────────────────
function ScenarioCard({ scenario, onOpen, onDuplicate, onArchive, onDelete, onApply }) {
  const [confirmApply,  setConfirmApply]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canApply  = (scenario.status === 'active') && !!onApply;
  const isApplied = scenario.status === 'applied';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-1">{scenario.name}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {scenario.pinned && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">Demo</span>
            )}
            <StatusBadge status={scenario.status} />
          </div>
        </div>
        {scenario.description ? (
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{scenario.description}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">No description</p>
        )}
      </div>

      {/* Dates */}
      <div className="flex gap-3 text-[10px] text-slate-400">
        <span>Created {scenario.createdAt}</span>
        <span>·</span>
        <span>Updated {scenario.updatedAt}</span>
      </div>

      {/* KPI tiles */}
      {scenario.kpis ? (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Inv Value',   value: scenario.kpis.inventoryValue },
            { label: 'WC Impact',   value: scenario.kpis.wcExposure     },
            { label: 'Svc Level',   value: scenario.kpis.serviceLevel   },
            { label: 'Stockout',    value: scenario.kpis.stockoutRisk   },
          ].filter(t => t.value).map(({ label, value }) => (
            <div key={label} className="bg-teal-50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-[9px] text-teal-500 font-medium leading-none mb-0.5">{label}</p>
              <p className="text-xs font-bold text-teal-800">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-300 italic">Save scenario to see KPI impact</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          onClick={() => onOpen(scenario.id)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
        >
          <FolderOpen size={13} /> Open
        </button>
        <button
          onClick={() => onOpen(scenario.id, 'sc')}
          title="Supply chain view"
          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
        >
          <Truck size={15} />
        </button>
        <button
          onClick={() => onDuplicate(scenario.id)}
          title="Duplicate"
          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
        >
          <Copy size={15} />
        </button>
        {!scenario.pinned && scenario.status !== 'archived' && scenario.status !== 'applied' && (
          <button
            onClick={() => onArchive(scenario.id)}
            title="Archive"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Archive size={15} />
          </button>
        )}
        {!scenario.pinned && (
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-red-800">Delete this scenario?</p>
          <p className="text-[10px] text-red-600">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => { onDelete(scenario.id); setConfirmDelete(false); }}
              className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Apply to Plan */}
      {(canApply || isApplied) && (
        <button
          onClick={() => canApply && setConfirmApply(true)}
          disabled={isApplied}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border transition-colors ${
            isApplied
              ? 'bg-purple-50 text-purple-700 border-purple-200 cursor-default'
              : 'bg-white text-teal-700 border-teal-300 hover:bg-teal-50'
          }`}
        >
          <CheckSquare size={13} />
          {isApplied ? '✓ Applied to Plan' : 'Apply to Plan'}
        </button>
      )}

      {confirmApply && (
        <ApplyModal
          scenario={scenario}
          onClose={() => setConfirmApply(false)}
          onConfirm={() => { onApply(scenario); setConfirmApply(false); }}
        />
      )}
    </div>
  );
}

// ─── Add-card ─────────────────────────────────────────────────────────────────
function AddCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition-all flex flex-col items-center justify-center gap-2 py-10 text-slate-400 hover:text-teal-600 min-h-[160px]"
    >
      <Plus size={24} />
      <span className="text-sm font-medium">New Scenario</span>
    </button>
  );
}

// ─── Comparison Table ─────────────────────────────────────────────────────────
function ComparisonTable({ scenarios, skus }) {
  // Compute all three MEIO variants to build the range
  const allVariants = useMemo(() => {
    if (!skus?.length) return null;
    return Object.fromEntries(
      Object.entries(MEIO_VARIANT_META).map(([key, meta]) => [
        key, computeVariantKPIs(skus, meta.ssMult),
      ])
    );
  }, [skus]);

  const baselineKPIs     = allVariants?.baseline     ?? {};
  const optimisticKPIs   = allVariants?.optimistic   ?? {};
  const conservativeKPIs = allVariants?.conservative ?? {};

  // Scenarios with KPIs sorted oldest → newest
  // Show all non-archived scenarios; pinned demo sorts to front
  const compared = scenarios
    .filter(s => s.status !== 'archived')
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return Number(a.id) - Number(b.id);
    });

  const hasScenarios = compared.length > 0;

  // Format the reference cell: range (low – high) or single value
  function refCell(key, showAsRange) {
    if (!allVariants) return '—';
    const base = baselineKPIs[key];
    if (!showAsRange) return base ?? '—';

    const lo = optimisticKPIs[key];
    const hi = conservativeKPIs[key];
    if (!lo || !hi) return base ?? '—';

    // Strip trailing units for display — keep just numbers + symbol
    const fmt = v => v; // already formatted strings like "$122.3M" or "97.0%"
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs font-bold text-slate-700">{fmt(lo)}</span>
        <span className="text-[9px] text-slate-400 leading-none">to</span>
        <span className="text-xs font-bold text-slate-700">{fmt(hi)}</span>
      </div>
    );
  }

  // For Δ comparison we always diff against baseline midpoint
  function getBaseNum(key) { return parseNumeric(baselineKPIs[key]); }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-800">MEIO Target Ranges vs. Scenarios</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {hasScenarios
              ? 'MEIO range = optimistic to conservative targets · Green = better than baseline · Red = worse'
              : 'Save a scenario to compare against the MEIO target range'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4 sticky left-0 bg-slate-50 z-10 w-56">
                KPI
              </th>
              <th className="text-center py-3 px-6 bg-slate-50 border-r border-slate-200" style={{ minWidth: 140 }}>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">MEIO Target Range</span>
                  <span className="text-[10px] text-slate-400">Optimistic → Conservative</span>
                </div>
              </th>
              {compared.map(s => (
                <th key={s.id} className="text-center py-3 px-6 whitespace-nowrap" style={{ minWidth: 140 }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-bold text-teal-500 tracking-widest uppercase">Scenario</span>
                    <span className="text-xs font-semibold text-teal-800 max-w-[160px] truncate block">{s.name}</span>
                    <span className="text-[10px] text-slate-400">{s.updatedAt}</span>
                    {s.status === 'applied' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 mt-0.5">✓ Applied</span>
                    )}
                  </div>
                </th>
              ))}
              {!hasScenarios && <th className="py-3 px-6 w-64">&nbsp;</th>}
            </tr>
          </thead>

          <tbody>
            {KPI_ROWS.map(({ key, label, unit, good, showAsRange, definition }, rowIdx) => {
              const baseNum = getBaseNum(key);
              const rowBg   = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';

              return (
                <Fragment key={key}>
                  {/* Value row */}
                  <tr className={rowBg}>
                    <td className={`py-2.5 px-4 text-xs font-semibold text-slate-700 sticky left-0 z-10 ${rowBg}`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {label}
                          <span className="text-[10px] font-normal text-slate-400">({unit})</span>
                        </div>
                        {definition && (
                          <p className="text-[10px] font-normal text-slate-400 leading-snug max-w-[220px] whitespace-normal">
                            {definition}
                          </p>
                        )}
                      </div>
                    </td>
                    {/* MEIO range / single value */}
                    <td className="py-2.5 px-6 text-center border-r border-slate-100">
                      {refCell(key, showAsRange)}
                    </td>
                    {compared.map(s => {
                      const val  = s.kpis?.[key];
                      if (!val) return <td key={s.id} className="py-2.5 px-6 text-center text-xs text-slate-300">—</td>;
                      const curr    = parseNumeric(val);
                      const diff    = curr - baseNum;
                      const neutral = Math.abs(diff) < 0.001;
                      const better  = !neutral && ((good === 'up' && diff > 0) || (good === 'down' && diff < 0));
                      const cellBg  = neutral ? '' : better ? 'bg-green-50' : 'bg-red-50';
                      const color   = neutral ? 'text-slate-700' : better ? 'text-green-800' : 'text-red-800';
                      return (
                        <td key={s.id} className={`py-2.5 px-6 text-center text-xs font-bold whitespace-nowrap ${cellBg} ${color}`}>
                          {val}
                        </td>
                      );
                    })}
                    {!hasScenarios && <td />}
                  </tr>

                  {/* Δ vs. MEIO baseline row */}
                  <tr className={`${rowBg} border-b border-slate-100`}>
                    <td className={`pb-2.5 pt-0 px-4 sticky left-0 z-10 ${rowBg}`}>
                      <span className="text-[10px] text-slate-400 italic pl-0.5">Δ vs. MEIO baseline</span>
                    </td>
                    <td className="pb-2.5 pt-0 px-6 text-center border-r border-slate-100">
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        <Minus size={9} /> reference
                      </span>
                    </td>
                    {compared.map(s => {
                      const val = s.kpis?.[key];
                      if (!val) return (
                        <td key={s.id} className="pb-2.5 pt-0 px-6 text-center">
                          <span className="text-[10px] text-slate-300">—</span>
                        </td>
                      );
                      const curr    = parseNumeric(val);
                      const diff    = curr - baseNum;
                      const pct     = baseNum !== 0 ? (diff / Math.abs(baseNum)) * 100 : 0;
                      const neutral = Math.abs(diff) < 0.001;
                      const better  = !neutral && ((good === 'up' && diff > 0) || (good === 'down' && diff < 0));
                      const cls     = neutral ? 'bg-slate-100 text-slate-500'
                        : better ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600';
                      return (
                        <td key={s.id} className="pb-2.5 pt-0 px-6 text-center">
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>
                            {neutral ? <><Minus size={9} /> —</> : diff > 0
                              ? <><TrendingUp size={9} /> +{pct.toFixed(1)}%</>
                              : <><TrendingDown size={9} /> {pct.toFixed(1)}%</>
                            }
                          </span>
                        </td>
                      );
                    })}
                    {!hasScenarios && <td />}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {!hasScenarios && (
          <div className="flex items-center justify-center py-10 border-t border-slate-100 bg-slate-50/40">
            <p className="text-sm text-slate-400 italic">
              No scenarios yet. Create one to compare against the plan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ScenarioLibrary({ scenarios, skus = [], onNew, onOpen, onDuplicate, onDelete, onUpdate, onApply }) {
  const [scModal, setScModal] = useState(null);

  function handleOpen(id, mode) {
    if (mode === 'sc') setScModal(id);
    else onOpen(id);
  }

  function handleArchive(id) {
    onUpdate(id, { status: 'archived' });
  }

  const scModalScenario = scenarios.find(s => s.id === scModal);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Scenario Library</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Compare what-if inventory scenarios against your MEIO plan
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition-colors"
        >
          <Plus size={15} /> New Scenario
        </button>
      </div>

      {/* Scenario cards */}
      {scenarios.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map(s => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              onOpen={handleOpen}
              onDuplicate={onDuplicate}
              onArchive={handleArchive}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onApply={onApply}
            />
          ))}
          <AddCard onClick={onNew} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-slate-500 max-w-xs">
            Create your first what-if scenario to explore how inventory policy should adapt under stress.
          </p>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> New Scenario
          </button>
        </div>
      )}

      {/* Comparison table — always visible at the bottom */}
      <ComparisonTable scenarios={scenarios} skus={skus} />

      {/* Supply chain node view */}
      {scModalScenario && (
        <SupplyChainNodeView scenario={scModalScenario} onClose={() => setScModal(null)} />
      )}
    </div>
  );
}
