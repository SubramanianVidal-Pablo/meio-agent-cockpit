import { useState } from 'react';
import { Target, Activity, LayoutDashboard, ClipboardList, CheckCircle2, XCircle, Clock, AlertCircle, Lightbulb } from 'lucide-react';
import PlanningView, { CIAgentPanel } from './components/PlanningView';
import SimulationChat, { DEMO_SCENARIO } from './components/SimulationChat';
import ChatBot from './components/ChatBot';
import OperationsDashboard from './components/OperationsDashboard';
import { SKU_DATA, computeABCClass } from './data/skuData';
import { optimizeInventory } from './data/simulationEngine';

const TABS = [
  { id: 'plan',     label: 'Inventory Plan',             icon: Target,          sub: 'What to do this cycle' },
  { id: 'ci',       label: 'Continuous Improvement',     icon: Lightbulb,       sub: 'Optimisation opportunities' },
  { id: 'simulate', label: 'Scenario Planning',           icon: Activity,        sub: 'What-if scenarios' },
  { id: 'ops',      label: 'Ops Review',                  icon: LayoutDashboard, sub: 'Portfolio health' },
  { id: 'log',      label: 'Decision Log',                icon: ClipboardList,   sub: 'Signal decisions' },
];

// ── Open item resolution controls ─────────────────────────────────────────────
function OpenItemControls({ d, onResolve }) {
  const [mode, setMode] = useState('idle'); // idle | custom
  const [customAmt, setCustomAmt] = useState('');
  const oi = d.openItem ?? {};

  return (
    <div className="space-y-2 min-w-[180px]">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircle className="w-3 h-3" /> Open Item
      </span>
      {mode === 'idle' ? (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => onResolve(d.id, { type: 'accepted' })}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors text-left"
          >
            ✓ Accept — reach MEIO target
          </button>
          <button
            onClick={() => setMode('custom')}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors text-left"
          >
            ↗ Increase by custom amount
          </button>
          <button
            onClick={() => onResolve(d.id, { type: 'no-change' })}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition-colors text-left"
          >
            — No change
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-muted leading-snug">
            MEIO target gap: <span className="font-semibold text-ink">{Math.abs(oi.meioDelta ?? 0).toLocaleString()} units</span>
          </p>
          <input
            type="number"
            min="1"
            value={customAmt}
            onChange={e => setCustomAmt(e.target.value)}
            placeholder="Units to adjust…"
            className="w-full text-xs border border-border-light rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex gap-1.5">
            <button
              disabled={!customAmt || Number(customAmt) <= 0}
              onClick={() => onResolve(d.id, { type: 'custom', customAmount: Number(customAmt) })}
              className="flex-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Confirm
            </button>
            <button
              onClick={() => { setMode('idle'); setCustomAmt(''); }}
              className="text-[11px] px-2 py-1 rounded-lg border border-border-light text-muted hover:text-ink"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Decision Log tab ──────────────────────────────────────────────────────────
function DecisionLog({ decisions, onResolve }) {
  const openCount     = decisions.filter(d => d.decision === 'open').length;
  const acceptedCount = decisions.filter(d => d.decision === 'accepted').length;
  const rejectedCount = decisions.filter(d => d.decision === 'rejected').length;

  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ClipboardList className="w-10 h-10 text-slate-300 mb-4" />
        <p className="text-sm font-semibold text-slate-400">No decisions logged yet</p>
        <p className="text-xs text-slate-300 mt-1">Accept or defer a recommendation in the Inventory Plan to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Decision Log</h2>
          <p className="text-xs text-muted mt-0.5">{decisions.length} entr{decisions.length !== 1 ? 'ies' : 'y'} this session</p>
        </div>
        <div className="flex gap-3 text-xs">
          {openCount > 0 && (
            <span className="flex items-center gap-1 text-amber-700 font-semibold">
              <AlertCircle className="w-3.5 h-3.5" />
              {openCount} open
            </span>
          )}
          <span className="flex items-center gap-1 text-teal-700 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {acceptedCount} accepted
          </span>
          <span className="flex items-center gap-1 text-slate-500 font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            {rejectedCount} rejected
          </span>
        </div>
      </div>

      <div className="bg-white border border-border-light rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-light bg-surface">
              <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Time</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Signal</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Recommendation</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wide">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {decisions.map((d, i) => {
              const isOpen     = d.decision === 'open';
              const isAccepted = d.decision === 'accepted';
              const rowBg      = isOpen ? '#FFFBEB' : '';
              return (
                <tr key={d.id ?? i} style={{ background: rowBg }} className="transition-colors">
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
                      <Clock className="w-3 h-3 shrink-0" />
                      {d.timestamp}
                    </div>
                    {d.openItem?.resolvedAt && (
                      <div className="text-[10px] text-muted mt-1">Resolved {d.openItem.resolvedAt}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ color: d.severityColor, background: d.severityColor + '18', border: `1px solid ${d.severityColor}40` }}>
                      {d.severity}
                    </span>
                    <div className="text-sm font-semibold text-ink mt-1">{d.sigType}</div>
                    <div className="text-xs text-muted mt-0.5">{d.affected}</div>
                  </td>
                  <td className="px-5 py-4 align-top max-w-sm">
                    <p className="text-xs text-slate-600 leading-relaxed">{d.recommendation}</p>
                    {/* Show resolved custom amount if applicable */}
                    {d.openItem?.resolvedDecision === 'custom' && (
                      <p className="text-xs font-semibold text-indigo-700 mt-1">
                        → Custom adjustment: {d.openItem.customAmount?.toLocaleString()} units
                      </p>
                    )}
                    {d.openItem?.resolvedDecision === 'no-change' && (
                      <p className="text-xs font-semibold text-slate-500 mt-1">→ No adjustment made</p>
                    )}
                    {d.openItem?.resolvedDecision === 'accepted' && (
                      <p className="text-xs font-semibold text-teal-700 mt-1">→ Accepted full MEIO target</p>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top">
                    {isOpen ? (
                      <OpenItemControls d={d} onResolve={onResolve} />
                    ) : isAccepted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        <CheckCircle2 className="w-3 h-3" /> Accepted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        <XCircle className="w-3 h-3" /> Rejected
                      </span>
                    )}
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

// Map internal scenario ids to display labels
const SCENARIO_LABELS = {
  baseline: 'Conservative',
  reactive: 'Base',
  proactive: 'Optimistic',
};

export default function App() {
  const [activeTab, setActiveTab]         = useState('plan');
  const [scenario, setScenario]           = useState('baseline');
  const [ssMultipliers, setSsMultipliers] = useState({ 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 });
  const [decisions, setDecisions]         = useState([]);
  // Scenarios live here so they persist across tab switches
  const [scenarios, setScenarios]         = useState([DEMO_SCENARIO]);
  // rowStates lifted here so Inventory Plan and Ops Review stay in sync
  // shape: { [skuId]: 'accepted' | 'deferred' }
  const [rowStates, setRowStates]         = useState({});

  function handleRowStateChange(skuId, state) {
    setRowStates(prev => ({ ...prev, [skuId]: state }));
  }

  function handleDecision(entry) {
    const id = `${Date.now()}-${Math.random()}`;
    setDecisions(prev => [{ ...entry, id }, ...prev]);
  }

  function handleResolveDecision(id, resolution) {
    const resolvedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDecisions(prev => prev.map(d => {
      if (d.id !== id) return d;
      const finalDecision = resolution.type === 'no-change' ? 'rejected' : 'accepted';
      return {
        ...d,
        decision: finalDecision,
        openItem: {
          ...(d.openItem ?? {}),
          resolved: true,
          resolvedAt,
          resolvedDecision: resolution.type,
          customAmount: resolution.customAmount,
        },
      };
    }));
  }

  function handleApply(scenario) {
    const paramLabels = {
      safetyStockWeeks: 'Safety Stock',
      serviceLevel:     'Service Level',
      wcCapM:           'WC Cap',
      leadTimeAdjWeeks: 'Lead Time Adj.',
      demandAdjPct:     'Demand Adj.',
      reviewPeriod:     'Review Period',
      reorderOverride:  'ROP Override',
    };
    const paramStr = Object.entries(scenario.params ?? {})
      .filter(([k]) => !['scenarioType', 'affectedSkus', 'kpiPriority'].includes(k))
      .map(([k, v]) => `${paramLabels[k] ?? k}: ${v}`)
      .join(' · ') || 'Default parameters';

    handleDecision({
      timestamp:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      decision:       'accepted',
      severity:       'APPLIED',
      severityColor:  '#0F766E',
      sigType:        'Scenario Applied to Plan',
      affected:       [scenario.name, scenario.params?.scenarioType].filter(Boolean).join(' — '),
      recommendation: [
        scenario.params?.affectedSkus ? `Products: ${scenario.params.affectedSkus}` : 'All products',
        paramStr,
      ].join(' | '),
    });

    // Mark the applied scenario; revert any previously applied one to active
    setScenarios(prev =>
      prev.map(s => ({
        ...s,
        status:    s.id === scenario.id ? 'applied' : s.status === 'applied' ? 'active' : s.status,
        updatedAt: s.id === scenario.id ? new Date().toLocaleDateString('en-GB') : s.updatedAt,
      }))
    );
  }

  function handleRevertToBaseline() {
    const applied = scenarios.find(s => s.status === 'applied');
    if (!applied) return;
    // Revert status — no scenario is applied anymore
    setScenarios(prev =>
      prev.map(s => ({
        ...s,
        status: s.id === applied.id ? 'active' : s.status,
      }))
    );
    // Append reversion entry to decision log
    handleDecision({
      timestamp:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      decision:       'rejected',
      severity:       'REVERTED',
      severityColor:  '#92400E',
      sigType:        'Reverted to Baseline',
      affected:       applied.name,
      recommendation: `Ops Review manually reverted from scenario "${applied.name}" back to MEIO baseline targets.`,
    });
  }

  // Shared simulation context — passed to every tab so numbers are always consistent
  const sharedCtx = { scenario, setScenario, ssMultipliers, setSsMultipliers, onNavigate: setActiveTab };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-border-light sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex items-center h-14 gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
                <span className="text-white text-xs font-black">IO</span>
              </div>
              <div>
                <div className="text-sm font-bold text-ink leading-none">Inventory Optimization AI</div>
                <div className="text-xs text-muted leading-none mt-0.5">
                  <span className="bg-brand-50 text-brand text-[10px] font-semibold px-1.5 py-0.5 rounded">Powered by Claude</span>
                </div>
              </div>
            </div>

            {/* Tab Nav */}
            <nav className="flex gap-0.5 flex-1 justify-end">
              {TABS.map(t => {
                const Icon = t.icon;
                const isActive = t.id === activeTab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                      isActive
                        ? 'border-brand text-brand'
                        : 'border-transparent text-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                    {t.id === 'log' && decisions.length > 0 && (
                      <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                        decisions.some(d => d.decision === 'open')
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}>{decisions.length}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Live badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-50 border border-green-200 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success font-medium">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main>
        <div className="max-w-screen-xl mx-auto px-6 py-6">
          {activeTab === 'plan' && (
            <PlanningView skus={SKU_DATA} {...sharedCtx} onDecision={handleDecision}
              rowStates={rowStates} onRowStateChange={handleRowStateChange} />
          )}
          {activeTab === 'ci' && (() => {
            const abcMap = Object.fromEntries(computeABCClass(SKU_DATA).map(s => [s.id, s.abcClass]));
            const skuLookup = Object.fromEntries(SKU_DATA.map(k => [k.id, k]));
            const optimized = optimizeInventory(SKU_DATA, scenario, ssMultipliers).map(s => ({
              ...s,
              abcClass: abcMap[s.id] ?? 'C',
              onHand: skuLookup[s.id]?.onHand ?? 0,
            }));
            return (
              <div className="space-y-4 fade-in">
                <div>
                  <h1 className="text-base font-bold text-ink">Continuous Improvement Opportunities</h1>
                  <p className="text-xs text-muted mt-1">AI-identified structural improvements to inventory policy, sourcing, and supply chain design.</p>
                </div>
                <CIAgentPanel skus={SKU_DATA} optimized={optimized} />
              </div>
            );
          })()}
          {activeTab === 'simulate' && (
            <SimulationChat skus={SKU_DATA} onDecision={handleDecision} scenarios={scenarios} onScenariosChange={setScenarios} onApply={handleApply} />
          )}
          {activeTab === 'ops' && (
            <OperationsDashboard
              skus={SKU_DATA}
              {...sharedCtx}
              scenarios={scenarios}
              decisions={decisions}
              onRevertToBaseline={handleRevertToBaseline}
              rowStates={rowStates}
              onRowStateChange={handleRowStateChange}
              onDecision={handleDecision}
            />
          )}
          {activeTab === 'log' && (
            <DecisionLog decisions={decisions} onResolve={handleResolveDecision} />
          )}
        </div>
      </main>

      {/* Floating chatbot — always on, scenario-aware */}
      <ChatBot skus={SKU_DATA} scenario={scenario} ssMultiplier={ssMultipliers} />
    </div>
  );
}
