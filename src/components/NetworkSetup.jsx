import { useState } from 'react';
import { Settings, Factory, Warehouse, Stethoscope, ArrowRight, Play, X } from 'lucide-react';
import { SKU_DATA, LOCATIONS } from '../data/mockData';

// Maps each visual node to the SKU location field values it covers
const networkEchelons = [
  {
    label: 'Drug Substance Manufacturing', icon: Factory,
    color: '#00A651', sub: 'Cell culture · Fermentation · Purification',
    items: [
      { label: 'Biologics Plant A', locationKey: 'Biologics Plant A' },
      { label: 'Biologics Plant B', locationKey: 'Biologics Plant B' },
    ],
  },
  {
    label: 'Fill-Finish & Cold Chain DC', icon: Warehouse,
    color: '#3B82F6', sub: 'Formulation · Fill-Finish · QC Release',
    items: [
      { label: 'Cold Chain DC East',    locationKey: 'Cold Chain DC East' },
      { label: 'Specialty DC West',     locationKey: 'Specialty DC West' },
      { label: 'Cold Chain DC Central', locationKey: 'Cold Chain DC Central' },
    ],
  },
  {
    label: 'Patient-Facing Delivery Points', icon: Stethoscope,
    color: '#F59E0B', sub: '2–8 °C last-mile · patient-specific dispensing · vein-to-vein',
    items: [
      { label: 'Oncology Infusion Centre',      locationKey: null, skuIds: ['BIO-C300', 'BIO-F600'] },
      { label: 'Haematology & BMT Unit',        locationKey: null, skuIds: ['BIO-K110', 'BIO-L120'] },
      { label: 'Gene Therapy Treatment Centre', locationKey: null, skuIds: ['BIO-J100'] },
      { label: 'Specialty Pharmacy / Home Infusion', locationKey: null, skuIds: ['BIO-E500', 'BIO-H800'] },
    ],
  },
];

const FILTER_OPTIONS = {
  Echelon:    ['Plant', 'DC', 'Customer'],
  Category:   ['Drug Substance', 'Drug Product'],
  'ABC Class':['A', 'B', 'C'],
  Status:     ['CRITICAL_OOS', 'EXCESS', 'AT_RISK', 'HEALTHY', 'POLICY_BREACH'],
  Location:   ['Biologics Plant A', 'Biologics Plant B', 'Cold Chain DC East', 'Specialty DC West', 'Cold Chain DC Central'],
  Criticality:['Life-saving', 'Essential'],
  'Cold Chain':['true'],
};

const STATUS_LABELS = {
  CRITICAL_OOS: 'OOS Risk', EXCESS: 'Excess', AT_RISK: 'At Risk',
  HEALTHY: 'Healthy', POLICY_BREACH: 'Policy Breach',
};

const STATUS_COLOR = {
  CRITICAL_OOS: '#EF4444', EXCESS: '#F59E0B', AT_RISK: '#F59E0B',
  HEALTHY: '#00A651', POLICY_BREACH: '#8B5CF6',
};

function NodeRiskBadges({ skus }) {
  const at_risk = skus.filter(s => s.status !== 'HEALTHY');
  if (at_risk.length === 0) return (
    <div className="flex items-center gap-1 mt-1">
      <div className="w-1.5 h-1.5 rounded-full bg-bcg-green" />
      <span className="text-xs text-bcg-green">All healthy</span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {at_risk.map(s => (
        <span
          key={s.id}
          className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold"
          style={{ background: STATUS_COLOR[s.status] + '25', color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}50` }}
          title={`${s.name} · ${STATUS_LABELS[s.status]} · DoS ${s.currentDOH}/${s.targetDOH}d`}
        >
          {s.id.replace('BIO-', '')}
        </span>
      ))}
    </div>
  );
}

function FilterPill({ label, onRemove }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-bcg-green/15 border border-bcg-green/30 text-xs text-bcg-green font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function NetworkSetup({ onOptimize }) {
  const [filters, setFilters] = useState({});
  const [skus, setSkus] = useState(SKU_DATA.map(s => ({ ...s, enabled: true })));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [openGroup, setOpenGroup] = useState(null);

  function toggleFilter(group, value) {
    setFilters(prev => {
      const current = prev[group] || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [group]: next };
    });
  }

  function removeFilter(group, value) {
    setFilters(prev => ({
      ...prev,
      [group]: (prev[group] || []).filter(v => v !== value),
    }));
  }

  function clearAll() {
    setFilters({});
  }

  // Apply filters to SKU list
  const filteredSkus = skus.filter(s => {
    if (filters.Echelon?.length && !filters.Echelon.includes(s.echelon)) return false;
    if (filters.Category?.length && !filters.Category.includes(s.category)) return false;
    if (filters['ABC Class']?.length && !filters['ABC Class'].includes(s.abcClass)) return false;
    if (filters.Status?.length && !filters.Status.includes(s.status)) return false;
    if (filters.Location?.length && !filters.Location.includes(s.location)) return false;
    if (filters.Criticality?.length && !filters.Criticality.includes(s.criticality)) return false;
    if (filters['Cold Chain']?.length && !filters['Cold Chain'].includes(String(s.coldChain))) return false;
    return true;
  });

  function toggleSku(id) {
    setSkus(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  async function handleOptimize() {
    setRunning(true);
    setProgress(0);
    await new Promise(r => setTimeout(r, 150));
    setProgress(1);
    await new Promise(r => setTimeout(r, 3100));
    setRunning(false);
    onOptimize();
  }

  const abcColor = { A: 'text-red-400', B: 'text-amber-400', C: 'text-slate-400' };
  const activeFilters = Object.entries(filters).flatMap(([group, values]) =>
    values.map(v => ({ group, value: v, label: group === 'Status' ? STATUS_LABELS[v] : v }))
  );
  const enabledCount = filteredSkus.filter(s => s.enabled).length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-bcg-green/20 flex items-center justify-center">
          <Settings className="w-4 h-4 text-bcg-green" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Network Configuration — <span className="text-bcg-green">Biopharma</span></h2>
          <p className="text-sm text-slate-400">Configure biologics SKUs across Drug Substance, Fill-Finish, and Cold Chain Distribution before running MEIO optimisation</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">

          {/* Filter panel */}
          <div className="bg-slate-card border border-slate-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filters</span>
              {activeFilters.length > 0 && (
                <button onClick={clearAll} className="text-xs text-slate-500 hover:text-white transition-colors">Clear all</button>
              )}
            </div>

            {/* Filter group buttons */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(FILTER_OPTIONS).map(([group, options]) => {
                const activeCount = (filters[group] || []).length;
                const isOpen = openGroup === group;
                return (
                  <div key={group} className="relative">
                    <button
                      onClick={() => setOpenGroup(isOpen ? null : group)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        activeCount > 0
                          ? 'bg-bcg-green/15 border-bcg-green/40 text-bcg-green'
                          : 'border-slate-border text-slate-400 hover:text-white hover:border-slate-400'
                      }`}
                    >
                      {group}
                      {activeCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-bcg-green text-white text-xs font-bold flex items-center justify-center">
                          {activeCount}
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="absolute top-full left-0 mt-1 z-20 bg-navy border border-slate-border rounded-xl p-2 shadow-2xl min-w-max">
                        {options.map(opt => {
                          const active = (filters[group] || []).includes(opt);
                          const label = group === 'Status' ? STATUS_LABELS[opt] : opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => toggleFilter(group, opt)}
                              className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                active ? 'bg-bcg-green/20 text-bcg-green' : 'text-slate-300 hover:bg-white/5'
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${active ? 'bg-bcg-green border-bcg-green' : 'border-slate-border'}`}>
                                {active && <span className="text-white text-xs leading-none">✓</span>}
                              </div>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active filter pills */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-border/50">
                {activeFilters.map(f => (
                  <FilterPill
                    key={`${f.group}-${f.value}`}
                    label={`${f.group}: ${f.label}`}
                    onRemove={() => removeFilter(f.group, f.value)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* SKU Config Table */}
          <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden" onClick={() => setOpenGroup(null)}>
            <div className="px-4 py-3 border-b border-slate-border flex items-center justify-between">
              <span className="text-sm font-semibold text-white">SKU Configuration</span>
              <span className="text-xs text-slate-400">
                {filteredSkus.length} shown · {enabledCount} enabled
                {activeFilters.length > 0 && <span className="ml-1 text-bcg-green">(filtered)</span>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-border">
                    {['', 'SKU', 'Category', 'ABC', 'Echelon', 'Lead Time', 'Demand CV', 'Safety Stock', 'DOH Target'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSkus.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                        No SKUs match the current filters
                      </td>
                    </tr>
                  )}
                  {filteredSkus.map(sku => (
                    <tr key={sku.id} className={`border-b border-slate-border/50 transition-colors ${sku.enabled ? 'hover:bg-white/5' : 'opacity-40'}`}>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleSku(sku.id)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${sku.enabled ? 'bg-bcg-green border-bcg-green' : 'border-slate-border bg-transparent'}`}
                        >
                          {sku.enabled && <span className="text-white text-xs font-bold">✓</span>}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs text-bcg-green">{sku.id}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[100px]">{sku.name}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">{sku.category.split(' ').slice(0, 2).join(' ')}</td>
                      <td className={`px-3 py-2 text-xs font-bold ${abcColor[sku.abcClass]}`}>{sku.abcClass}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{sku.echelon}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{sku.leadTime}d</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{(sku.demandCV * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{(sku.currentSafetyStock || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">{sku.targetDOH}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Network Diagram + Stats */}
        <div className="space-y-4">
          <div className="bg-slate-card border border-slate-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-white">Supply Network — Risk by Node</div>
              <div className="flex items-center gap-2">
                {[['OOS', '#EF4444'], ['At Risk', '#F59E0B'], ['Policy', '#8B5CF6']].map(([l, c]) => (
                  <div key={l} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: c }} />
                    <span className="text-xs text-slate-500">{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {networkEchelons.map((echelon, i) => {
                const Icon = echelon.icon;
                return (
                  <div key={echelon.label}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="w-3.5 h-3.5" style={{ color: echelon.color }} />
                      <span className="text-xs font-semibold text-slate-300">{echelon.label}</span>
                      <span className="text-xs text-slate-500">— {echelon.sub}</span>
                    </div>
                    <div className="space-y-1.5 ml-5">
                      {echelon.items.map((item, idx) => {
                        // Get SKUs at this node — by location key or by explicit SKU ID list
                        const nodeSkus = item.locationKey
                          ? filteredSkus.filter(s => s.location === item.locationKey)
                          : item.skuIds
                            ? filteredSkus.filter(s => item.skuIds.includes(s.id))
                            : [];
                        const riskSkus = nodeSkus.filter(s => s.status !== 'HEALTHY');
                        const critCount = riskSkus.filter(s => s.status === 'CRITICAL_OOS').length;
                        const hasRisk = riskSkus.length > 0;

                        return (
                          <div key={item.label} className="rounded-lg border px-3 py-2"
                            style={{
                              borderColor: hasRisk ? (critCount > 0 ? '#EF444450' : '#F59E0B50') : echelon.color + '30',
                              background: hasRisk ? (critCount > 0 ? '#EF444408' : '#F59E0B08') : echelon.color + '08',
                            }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ background: hasRisk ? (critCount > 0 ? '#EF4444' : '#F59E0B') : echelon.color }} />
                                <span className="text-xs text-slate-200 font-medium">{item.label}</span>
                              </div>
                              {nodeSkus.length > 0 && (
                                <span className="text-xs text-slate-500">{nodeSkus.length} SKU{nodeSkus.length > 1 ? 's' : ''}</span>
                              )}
                            </div>
                            {nodeSkus.length > 0
                              ? <NodeRiskBadges skus={nodeSkus} />
                              : <div className="text-xs text-slate-600 mt-1">No SKUs mapped to this node</div>
                            }
                          </div>
                        );
                      })}
                    </div>
                    {i < networkEchelons.length - 1 && (
                      <div className="flex justify-center my-2">
                        <div className="flex flex-col items-center gap-0.5">
                          {[0, 1, 2].map(j => <div key={j} className="w-0.5 h-1 bg-slate-border rounded" />)}
                          <ArrowRight className="w-3 h-3 text-slate-500 rotate-90" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Showing SKUs', value: filteredSkus.length },
              { label: 'Locations', value: LOCATIONS.length },
              { label: 'Echelons', value: 3 },
              { label: 'Avg Lead Time', value: `${Math.round(SKU_DATA.reduce((a, s) => a + s.leadTime, 0) / SKU_DATA.length)}d` },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-card border border-slate-border rounded-lg p-3">
                <div className="text-xs text-slate-400">{stat.label}</div>
                <div className="text-lg font-bold text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-slate-card border border-slate-border rounded-xl p-4" onClick={() => setOpenGroup(null)}>
        {running ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-bcg-green font-medium">Running MEIO optimization engine…</span>
              <span className="text-slate-400 text-xs">Solving multi-echelon safety stock problem</span>
            </div>
            <div className="h-2 bg-navy rounded-full overflow-hidden">
              {progress > 0 && <div className="h-full bg-bcg-green rounded-full progress-sweep" />}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              {['Demand sensing', 'Batch yield modelling', 'Cold chain service level optimisation', 'GxP-compliant policy generation'].map((step, i) => (
                <span key={step} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-bcg-green animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
                  {step}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Ready to optimize</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {filteredSkus.filter(s => s.enabled).length} SKUs across 3 echelons — estimated solve time ~3s
              </div>
            </div>
            <button
              onClick={handleOptimize}
              className="flex items-center gap-2 px-6 py-2.5 bg-bcg-green hover:bg-green-500 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              <Play className="w-4 h-4" />
              Run MEIO Optimization
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
