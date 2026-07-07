import { runSimulation, getPortfolioSummary, getScenarioComparison } from '../data/simulationEngine';
import { TIERS, MONTH_LABELS, EVENTS } from '../data/skuData';
import { Target, Zap, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function fmt$(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function TierBadge({ tier }) {
  const t = TIERS[tier];
  return (
    <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full">
      {tier === 1 ? 'T1' : tier === 2 ? 'T2' : tier === 3 ? 'T3' : 'T4'}
    </span>
  );
}

const SCENARIO_META = {
  baseline: {
    icon: Target, label: 'Baseline', color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4',
    desc: 'MEIO static targets maintained. No disruption modelled.',
  },
  reactive: {
    icon: Zap, label: 'Reactive', color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5',
    desc: 'Capacity shortfall (70% M3–M5) + demand spike +40% M6–M8 on Tier 1/2. Tests exposure under concurrent supply and demand stress.',
  },
  proactive: {
    icon: TrendingUp, label: 'Proactive', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE',
    desc: 'Same events but early mitigation: capacity managed to 85%, demand spike modelled at +25%. Shows benefit of advance planning.',
  },
};

export default function ScenarioManager({ skus, ssMultiplier, scenario }) {
  const baselineSim = runSimulation(skus, 'baseline', ssMultiplier);
  const reactiveSim = runSimulation(skus, 'reactive', ssMultiplier);
  const proactiveSim = runSimulation(skus, 'proactive', ssMultiplier);
  const comparison = getScenarioComparison(skus, ssMultiplier);

  const baseSum = getPortfolioSummary(baselineSim);
  const reactSum = getPortfolioSummary(reactiveSim);
  const proactSum = getPortfolioSummary(proactiveSim);

  const summaryMap = { baseline: baseSum, reactive: reactSum, proactive: proactSum };

  // Comparison chart data
  const chartData = [
    {
      name: 'Margin at Risk ($M)',
      Baseline: +(comparison.baseline.totalMarginAtRisk / 1e6).toFixed(2),
      Reactive: +(comparison.reactive.totalMarginAtRisk / 1e6).toFixed(2),
      Proactive: +(comparison.proactive.totalMarginAtRisk / 1e6).toFixed(2),
    },
    {
      name: 'SKUs at Risk',
      Baseline: comparison.baseline.skusAtRisk,
      Reactive: comparison.reactive.skusAtRisk,
      Proactive: comparison.proactive.skusAtRisk,
    },
    {
      name: 'Fulfillment Rate (%)',
      Baseline: +comparison.baseline.avgFulfillmentRate.toFixed(1),
      Reactive: +comparison.reactive.avgFulfillmentRate.toFixed(1),
      Proactive: +comparison.proactive.avgFulfillmentRate.toFixed(1),
    },
  ];

  // SKU impact table
  function riskMonths(sim, skuId) {
    const sku = sim.find(s => s.id === skuId);
    if (!sku) return 0;
    return sku.timeline.filter(t => t.atRisk).length;
  }

  const impactedSkus = skus
    .map(sku => ({
      ...sku,
      baselineRisk: riskMonths(baselineSim, sku.id),
      reactiveRisk: riskMonths(reactiveSim, sku.id),
      proactiveRisk: riskMonths(proactiveSim, sku.id),
    }))
    .filter(s => s.baselineRisk + s.reactiveRisk + s.proactiveRisk > 0)
    .sort((a, b) => b.reactiveRisk - a.reactiveRisk);

  function bestScenario(sku) {
    const scores = { baseline: sku.baselineRisk, reactive: sku.reactiveRisk, proactive: sku.proactiveRisk };
    return Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
  }

  function recommendedAction(sku) {
    if (sku.tier === 1 && sku.reactiveRisk > 2) return { label: 'Protect — build SS buffer', color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' };
    if (sku.tier === 2 && sku.reactiveRisk > 2) return { label: 'Monitor — review in 4 weeks', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' };
    return { label: 'Deprioritize — absorb short', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
  }

  // Top affected SKUs per event (reactive scenario)
  function topAffectedForEvent(eventMonth) {
    return reactiveSim
      .map(sku => {
        const entry = sku.timeline[eventMonth - 1];
        return { id: sku.id, name: sku.name, gap: entry.gap, inventory: entry.inventory };
      })
      .filter(s => s.gap < 0)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3);
  }

  // Proactive gains
  const reactiveRiskTotal = reactiveSim.reduce((s, sku) => s + sku.timeline.filter(t => t.atRisk).length, 0);
  const proactiveRiskTotal = proactiveSim.reduce((s, sku) => s + sku.timeline.filter(t => t.atRisk).length, 0);
  const riskMonthsSaved = reactiveRiskTotal - proactiveRiskTotal;
  const marginSaved = reactSum.totalMarginAtRisk - proactSum.totalMarginAtRisk;

  const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 },
  };

  // Tier risk months saved
  const tierRiskSaved = [1, 2, 3, 4].map(tier => {
    const reactTier = reactiveSim.filter(s => s.tier === tier).reduce((s, sku) => s + sku.timeline.filter(t => t.atRisk).length, 0);
    const proactTier = proactiveSim.filter(s => s.tier === tier).reduce((s, sku) => s + sku.timeline.filter(t => t.atRisk).length, 0);
    return { tier, saved: Math.max(0, reactTier - proactTier), total: reactTier };
  });

  return (
    <div className="space-y-5 fade-in">
      {/* Scenario explainer cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(SCENARIO_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const sum = summaryMap[key];
          const isActive = scenario === key;
          return (
            <div
              key={key}
              className="bg-white rounded-xl shadow-card p-5"
              style={{
                border: isActive ? `2px solid ${meta.color}` : '1px solid #E2E8F0',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.bg }}>
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </div>
                <div className="font-semibold text-ink">{meta.label}</div>
                {isActive && <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>Active</span>}
              </div>
              <p className="text-xs text-muted mb-3">{meta.desc}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-muted">Margin at Risk</div>
                  <div className="text-sm font-bold text-danger">{fmt$(sum.totalMarginAtRisk)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Fulfillment</div>
                  <div className="text-sm font-bold text-brand">{sum.avgFulfillmentRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted">SKUs at Risk</div>
                  <div className="text-sm font-bold text-warning">{sum.skusAtRisk}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison chart */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="text-sm font-semibold text-ink mb-4">Scenario Comparison</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Baseline" fill="#0F766E" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Reactive" fill="#DC2626" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Proactive" fill="#4F46E5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SKU Impact Table */}
      <div className="bg-white border border-border-light rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="text-sm font-semibold text-ink">SKU Impact — Products with Risk Exposure</div>
          <div className="text-xs text-muted mt-0.5">Sorted by reactive risk months descending</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
                <th className="text-left px-4 py-2.5">Tier</th>
                <th className="text-left px-4 py-2.5">SKU</th>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-center px-4 py-2.5">Baseline Risk Mths</th>
                <th className="text-center px-4 py-2.5">Reactive Risk Mths</th>
                <th className="text-center px-4 py-2.5">Proactive Risk Mths</th>
                <th className="text-center px-4 py-2.5">Best Scenario</th>
                <th className="text-left px-4 py-2.5">Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {impactedSkus.map((sku, i) => {
                const action = recommendedAction(sku);
                const best = bestScenario(sku);
                return (
                  <tr key={sku.id} className="border-b border-border-light hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5"><TierBadge tier={sku.tier} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">{sku.id}</td>
                    <td className="px-4 py-2.5 text-ink">{sku.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-semibold ${sku.baselineRisk > 0 ? 'text-warning' : 'text-muted'}`}>{sku.baselineRisk}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-semibold ${sku.reactiveRisk > 2 ? 'text-danger' : sku.reactiveRisk > 0 ? 'text-warning' : 'text-muted'}`}>{sku.reactiveRisk}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-semibold ${sku.proactiveRisk > 0 ? 'text-warning' : 'text-success'}`}>{sku.proactiveRisk}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-semibold capitalize text-brand">{best}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: action.bg, color: action.color, border: `1px solid ${action.border}` }}>
                        {action.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-2 gap-5">
        {/* Reactive detail */}
        <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
          <div className="text-sm font-semibold text-ink mb-1">Reactive Scenario — Event Response</div>
          <div className="text-xs text-muted mb-4">Events and their most-affected SKUs</div>
          <div className="space-y-4">
            {EVENTS.map((ev, i) => {
              const affected = topAffectedForEvent(ev.month);
              const isHigh = ev.severity === 'high';
              const color = isHigh ? (ev.type === 'capacity' ? '#DC2626' : '#4F46E5') : '#059669';
              const bg = isHigh ? (ev.type === 'capacity' ? '#FEF2F2' : '#EEF2FF') : '#ECFDF5';
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: bg, color }}>{MONTH_LABELS[ev.month - 1]}</span>
                    <span className="text-xs font-semibold text-ink">{ev.label}</span>
                  </div>
                  <p className="text-xs text-muted mb-1.5">{ev.desc}</p>
                  {affected.length > 0 ? (
                    <div className="flex gap-2">
                      {affected.map(s => (
                        <span key={s.id} className="text-xs px-2 py-0.5 rounded bg-danger-50 text-danger border border-red-200 font-medium">
                          {s.id} (gap {Math.round(s.gap).toLocaleString()})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted italic">No at-risk SKUs this month</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Proactive gains */}
        <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
          <div className="text-sm font-semibold text-ink mb-1">Proactive Scenario — Mitigation Gains</div>
          <div className="text-xs text-muted mb-3">
            By managing capacity to 85% and modelling demand conservatively, <strong>{riskMonthsSaved}</strong> fewer SKU-risk-months vs reactive.
            Estimated margin protected: <strong>{fmt$(marginSaved)}</strong>.
          </div>
          <div className="space-y-3">
            {tierRiskSaved.map(t => (
              <div key={t.tier}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: TIERS[t.tier].color }} className="font-semibold">{TIERS[t.tier].label}</span>
                  <span className="text-muted">{t.saved} risk months saved vs reactive</span>
                </div>
                <div className="h-2 rounded-full bg-surface border border-border-light overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: t.total > 0 ? `${Math.min(100, (t.saved / Math.max(t.total, 1)) * 100)}%` : '0%',
                      background: TIERS[t.tier].color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
