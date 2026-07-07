import { useState } from 'react';
import { runSimulation, getPortfolioSummary, getRiskHeatmapData, optimizeInventory, getShortfallManagementPlan } from '../data/simulationEngine';
import { TIERS, MONTH_LABELS, EVENTS } from '../data/skuData';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceArea,
} from 'recharts';

const TIER_COLORS = { 1: '#0F766E', 2: '#4F46E5', 3: '#D97706', 4: '#94A3B8' };

function fmt$(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function heatColor(entry) {
  const ratio = entry.ssTarget > 0 ? entry.inventory / entry.ssTarget : 1;
  if (ratio > 1.2) return '#D1FAE5'; // green
  if (ratio >= 1.0) return '#FEF3C7'; // yellow
  if (ratio >= 0.5) return '#FED7AA'; // orange
  return '#FCA5A5'; // red
}

function heatTextColor(entry) {
  const ratio = entry.ssTarget > 0 ? entry.inventory / entry.ssTarget : 1;
  if (ratio > 1.2) return '#059669';
  if (ratio >= 1.0) return '#D97706';
  if (ratio >= 0.5) return '#EA580C';
  return '#DC2626';
}

export default function SimulationEngine({ skus, scenario, ssMultiplier, onSsMultiplierChange, onScenarioChange }) {
  const [selectedTier, setSelectedTier] = useState(1);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [optFilter, setOptFilter] = useState('ALL');

  const simulated = runSimulation(skus, scenario, ssMultiplier);
  const summary = getPortfolioSummary(simulated);
  const heatmap = getRiskHeatmapData(simulated);
  const optimized = optimizeInventory(skus, scenario, ssMultiplier);
  const { managedSkus, monthlyPlan, comparison } = getShortfallManagementPlan(skus, scenario, ssMultiplier);

  // Chart data: pick the most exposed T1 SKU for the "controlled descent" comparison
  const focusSku = managedSkus
    .filter(s => s.tier === 1)
    .sort((a, b) =>
      b.timeline.filter(t => t.atRiskStatic).length -
      a.timeline.filter(t => t.atRiskStatic).length
    )[0] || managedSkus[0];

  const descentChartData = focusSku.timeline.map(t => ({
    month: t.label,
    'Inventory': Math.round(t.inventory),
    'Static Target (No Agent)': Math.round(t.staticSS),
    'Agent-Managed Target': Math.round(t.managedSS),
  }));

  // Optimization summary stats
  const toReduce   = optimized.filter(s => s.decision === 'REDUCE');
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE');
  const toMaintain = optimized.filter(s => s.decision === 'MAINTAIN');
  const totalWcRelease = toReduce.reduce((sum, s) => sum + s.wcImpact, 0);
  const totalWcNeeded  = toIncrease.reduce((sum, s) => sum + Math.abs(s.wcImpact), 0);
  const totalHoldingSave = toReduce.reduce((sum, s) => sum + s.annualHoldingImpact, 0);

  // Build chart data for selected tier
  const tierSkus = simulated.filter(s => s.tier === selectedTier);
  const chartData = MONTH_LABELS.map((label, m) => {
    const entry = { month: label };
    tierSkus.forEach(sku => {
      entry[`${sku.id} Inv`] = Math.round(sku.timeline[m].inventory);
      entry[`${sku.id} SS`] = Math.round(sku.timeline[m].ssTarget);
    });
    return entry;
  });

  const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11 },
  };

  return (
    <div className="space-y-5 fade-in">
      {/* Control Bar */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="flex items-start gap-8">
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink mb-3">Simulation Controls</div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-muted font-medium">Scenario:</span>
              {['baseline', 'reactive', 'proactive'].map(s => (
                <button
                  key={s}
                  onClick={() => onScenarioChange(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    scenario === s
                      ? 'bg-brand text-white'
                      : 'bg-white border border-border-light text-muted hover:text-ink'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted font-medium">SS Multiplier: <span className="text-brand font-bold">{ssMultiplier.toFixed(2)}x</span> MEIO Target</span>
              </div>
              <input
                type="range"
                min={0.5} max={1.5} step={0.05}
                value={ssMultiplier}
                onChange={e => onSsMultiplierChange(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-faint mt-1">
                <span>0.5x (50%)</span>
                <span className="text-brand font-semibold">1.0x target</span>
                <span>1.5x (150%)</span>
              </div>
            </div>
          </div>
          <div className="border-l border-border-light pl-6 shrink-0 space-y-2">
            <div className="text-xs text-muted font-medium">Effective SS</div>
            <div className="text-sm font-bold text-ink">MEIO Target × {ssMultiplier.toFixed(2)}</div>
            <div className="mt-2 text-xs text-muted">SKUs at risk</div>
            <div className="text-2xl font-bold text-danger">{summary.skusAtRisk}</div>
            <div className="text-xs text-muted">of {skus.length} SKUs</div>
          </div>
        </div>
      </div>

      {/* Event Timeline */}
      <div className="bg-white border border-border-light rounded-xl shadow-card px-5 py-3">
        <div className="text-xs font-semibold text-muted mb-2">Event Timeline</div>
        <div className="flex items-center gap-3 flex-wrap">
          {EVENTS.map((ev, i) => {
            const isHigh = ev.severity === 'high';
            const isCapacity = ev.type === 'capacity';
            const bg = isHigh ? (isCapacity ? '#FEF2F2' : '#EEF2FF') : '#ECFDF5';
            const color = isHigh ? (isCapacity ? '#DC2626' : '#4F46E5') : '#059669';
            const border = isHigh ? (isCapacity ? '#FCA5A5' : '#C7D2FE') : '#A7F3D0';
            return (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: bg, color, border: `1px solid ${border}` }}>
                <span className="font-bold">{MONTH_LABELS[ev.month - 1]}</span>
                <span>{ev.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inventory Trajectory Chart */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-ink">Inventory Trajectory</div>
            <div className="text-xs text-muted">Solid = inventory, dashed = SS target</div>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(t => (
              <button
                key={t}
                onClick={() => setSelectedTier(t)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: selectedTier === t ? TIER_COLORS[t] : '#F8FAFC',
                  color: selectedTier === t ? '#fff' : '#64748B',
                  border: `1px solid ${selectedTier === t ? TIER_COLORS[t] : '#E2E8F0'}`,
                }}
              >
                Tier {t}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <Tooltip {...tooltipStyle} formatter={(v) => v.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {tierSkus.map((sku, idx) => {
              const color = TIER_COLORS[selectedTier];
              const opacity = 0.5 + idx * 0.1;
              return [
                <Line
                  key={`${sku.id}-inv`}
                  type="monotone"
                  dataKey={`${sku.id} Inv`}
                  stroke={color}
                  strokeOpacity={opacity}
                  strokeWidth={2}
                  dot={false}
                  name={`${sku.id} Inv`}
                />,
                <Line
                  key={`${sku.id}-ss`}
                  type="monotone"
                  dataKey={`${sku.id} SS`}
                  stroke={color}
                  strokeOpacity={opacity * 0.6}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name={`${sku.id} SS`}
                />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Risk Exposure Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'SKUs at Risk', value: summary.skusAtRisk, sub: `of ${skus.length}`, color: 'text-danger' },
          { label: 'Peak Risk Month', value: summary.worstMonth, sub: 'most SKUs at risk', color: 'text-warning' },
          { label: 'Total Margin at Risk', value: fmt$(summary.totalMarginAtRisk), sub: 'across simulation', color: 'text-danger' },
          { label: 'Avg Fulfillment Rate', value: summary.avgFulfillmentRate.toFixed(1) + '%', sub: 'portfolio average', color: 'text-brand' },
        ].map((m, i) => (
          <div key={i} className="bg-white border border-border-light rounded-xl shadow-card p-4">
            <div className="text-xs text-muted font-medium mb-1">{m.label}</div>
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-faint mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Agent Shortfall Management Plan ──────────────────────────────── */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-sm font-semibold text-ink flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-brand" />
              Agent Shortfall Management Plan
            </div>
            <div className="text-xs text-muted mt-0.5 max-w-2xl">
              The agent's value is replacing a flat SS floor with a <span className="font-semibold text-ink">time-phased drawdown schedule</span>.
              Instead of watching inventory crash through a fixed target (red months), the agent steps SS targets
              down in a controlled way — T3/T4 absorbs the shortfall; T1/T2 stays protected throughout.
            </div>
          </div>
          {scenario === 'baseline' && (
            <div className="shrink-0 text-xs bg-warning-50 border border-amber-200 text-warning rounded-lg px-3 py-1.5 font-medium">
              Switch to Reactive or Proactive to see the agent plan
            </div>
          )}
        </div>

        {/* Outcome tiles */}
        {scenario !== 'baseline' && (
          <div className="grid grid-cols-4 gap-3 my-4">
            {[
              {
                label: 'T1/T2 Risk Months Avoided',
                value: comparison.t12.staticRiskMonths - comparison.t12.managedRiskMonths,
                sub: `${comparison.t12.staticRiskMonths} → ${comparison.t12.managedRiskMonths} risk months`,
                color: '#059669', bg: '#ECFDF5', border: '#A7F3D0',
              },
              {
                label: 'T3/T4 Risk Months Accepted',
                value: comparison.t34.managedRiskMonths - comparison.t34.staticRiskMonths,
                sub: 'Deliberate shock-absorber role',
                color: '#D97706', bg: '#FFFBEB', border: '#FDE68A',
              },
              {
                label: 'Net Portfolio Risk Months',
                value: (comparison.t12.staticRiskMonths + comparison.t34.staticRiskMonths)
                     - (comparison.t12.managedRiskMonths + comparison.t34.managedRiskMonths),
                sub: 'vs no-action baseline',
                color: '#0F766E', bg: '#F0FDFA', border: '#5EEAD4',
              },
              {
                label: 'Peak WC Released (month)',
                value: '$' + (Math.max(...monthlyPlan.map(m => m.wcReleased)) / 1e6).toFixed(1) + 'M',
                sub: 'Freed by stepping down T3/T4 SS',
                color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE',
              },
            ].map((tile, i) => (
              <div key={i} className="rounded-xl border p-3" style={{ background: tile.bg, borderColor: tile.border }}>
                <div className="text-xs text-muted">{tile.label}</div>
                <div className="text-2xl font-bold mt-0.5" style={{ color: tile.color }}>{tile.value}</div>
                <div className="text-xs text-faint mt-0.5">{tile.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Controlled descent chart — No-action vs Agent-managed */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-muted mb-1">
            Controlled Descent vs Cliff Edge — <span className="text-ink">{focusSku?.name}</span> (most exposed T1 SKU)
          </div>
          <div className="text-xs text-faint mb-3">
            Red zone = inventory below the flat "no-agent" target · Teal dashed = agent-managed target that steps down during shortfall
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={descentChartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              {/* Shortfall band */}
              <ReferenceArea x1="Mar" x2="May" fill="#FEF2F2" fillOpacity={0.6} label={{ value: 'Capacity shortfall', position: 'insideTop', fontSize: 9, fill: '#DC2626' }} />
              {/* Demand spike band */}
              <ReferenceArea x1="Jun" x2="Aug" fill="#EEF2FF" fillOpacity={0.5} label={{ value: 'Demand spike', position: 'insideTop', fontSize: 9, fill: '#4F46E5' }} />
              <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11 }}
                formatter={(v, name) => [v.toLocaleString() + ' u', name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Inventory"
                stroke="#0F172A" strokeWidth={2.5} dot={false} name="Inventory (units)" />
              <Line type="monotone" dataKey="Static Target (No Agent)"
                stroke="#DC2626" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              <Line type="monotone" dataKey="Agent-Managed Target"
                stroke="#0F766E" strokeWidth={2} strokeDasharray="8 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-ink" /><span className="text-muted">Inventory</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-danger" style={{ borderTop: '2px dashed #DC2626' }} /><span className="text-muted">Static SS target (no agent) — inventory below this = risk</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-brand" style={{ borderTop: '2px dashed #0F766E' }} /><span className="text-muted">Agent-managed target — steps down, then rebuilds</span></div>
          </div>
        </div>

        {/* Month-by-month plan table */}
        <div className="text-xs font-semibold text-muted mb-2">Month-by-Month Agent Decision Plan — Portfolio Level</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface border-b border-border-light text-muted font-semibold">
                <th className="text-left px-3 py-2">Month</th>
                <th className="text-left px-3 py-2">Phase</th>
                <th className="text-center px-3 py-2">Supply %</th>
                <th className="text-center px-3 py-2">T1/T2 SS Target</th>
                <th className="text-center px-3 py-2">T3/T4 SS Target</th>
                <th className="text-center px-3 py-2">SKUs at Risk<br/><span className="font-normal">(no-agent)</span></th>
                <th className="text-center px-3 py-2">SKUs at Risk<br/><span className="font-normal">(managed)</span></th>
                <th className="text-left px-3 py-2">Agent Action</th>
              </tr>
            </thead>
            <tbody>
              {monthlyPlan.map((row, i) => {
                const phaseColor =
                  row.phase === 'Shortfall starts' || row.phase === 'Peak shortfall'
                    ? { bg: '#FEF2F2', text: '#DC2626' }
                  : row.phase === 'Demand spike'
                    ? { bg: '#EEF2FF', text: '#4F46E5' }
                  : row.phase === 'Pre-build'
                    ? { bg: '#ECFDF5', text: '#059669' }
                  : { bg: '#F8FAFC', text: '#64748B' };
                const savedSkus = row.staticRiskSkus - row.managedRiskSkus;
                return (
                  <tr key={i} className="border-b border-border-light hover:bg-surface transition-colors"
                    style={{ background: phaseColor.bg + '55' }}>
                    <td className="px-3 py-2 font-semibold text-ink">{row.label}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: phaseColor.text }}>{row.phase}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold ${row.supplyPct < 85 ? 'text-danger' : 'text-success'}`}>
                        {row.supplyPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-brand">{row.t12Target}%</td>
                    <td className="px-3 py-2 text-center font-bold"
                      style={{ color: row.t34Target < 80 ? '#D97706' : '#64748B' }}>
                      {row.t34Target}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.staticRiskSkus > 0
                        ? <span className="font-bold text-danger">{row.staticRiskSkus}</span>
                        : <span className="text-faint">0</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.managedRiskSkus > 0
                        ? <span className="font-bold text-warning">{row.managedRiskSkus}</span>
                        : <span className="font-bold text-success">0</span>}
                      {savedSkus > 0 && (
                        <span className="ml-1 text-success font-semibold">↓{savedSkus}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted leading-relaxed">{row.action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Heatmap */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="text-sm font-semibold text-ink mb-1">Risk Heatmap — All SKUs × 12 Months</div>
        <div className="text-xs text-muted mb-3">Green = healthy · Yellow = adequate · Orange = at risk · Red = critical</div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            {/* Month headers */}
            <div className="flex items-center mb-1">
              <div style={{ width: 140 }} className="text-xs text-muted font-semibold shrink-0">SKU</div>
              {MONTH_LABELS.map(m => (
                <div key={m} style={{ width: 32 }} className="text-xs text-muted text-center font-semibold">{m}</div>
              ))}
            </div>

            {/* Tier groups */}
            {[1, 2, 3, 4].map(tier => {
              const rows = heatmap.filter(r => r.tier === tier);
              return (
                <div key={tier}>
                  <div className="flex items-center py-0.5 mb-1 mt-2">
                    <div
                      style={{ width: 140, color: TIERS[tier].color, fontSize: 10, fontWeight: 700 }}
                      className="uppercase tracking-wide"
                    >
                      {TIERS[tier].label}
                    </div>
                  </div>
                  {rows.map(row => (
                    <div key={row.skuId} className="flex items-center mb-0.5">
                      <div style={{ width: 140 }} className="text-xs text-muted truncate pr-2 shrink-0" title={row.skuName}>
                        {row.skuId}
                      </div>
                      {row.months.map(cell => (
                        <div
                          key={cell.month}
                          style={{
                            width: 32, height: 28, background: heatColor(cell),
                            flexShrink: 0, borderRadius: 3, margin: '0 1px', cursor: 'pointer',
                            position: 'relative',
                          }}
                          onMouseEnter={() => setHoveredCell({ ...cell, skuName: row.skuName })}
                          onMouseLeave={() => setHoveredCell(null)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredCell && (
          <div className="mt-3 inline-block bg-surface border border-border-light rounded-lg px-3 py-2 text-xs">
            <span className="font-semibold text-ink">{hoveredCell.skuName}</span>
            <span className="text-muted ml-2">Month {hoveredCell.month}</span>
            <span className="ml-2">Inv: <span className="font-semibold">{Math.round(hoveredCell.inventory).toLocaleString()}</span></span>
            <span className="ml-2">SS Target: <span className="font-semibold">{Math.round(hoveredCell.ssTarget).toLocaleString()}</span></span>
            <span className="ml-2">Gap: <span className={`font-semibold ${hoveredCell.gap < 0 ? 'text-danger' : 'text-success'}`}>{Math.round(hoveredCell.gap).toLocaleString()}</span></span>
          </div>
        )}
      </div>

      {/* ── Inventory Optimisation Plan ───────────────────────────────────── */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-ink">Inventory Optimisation Plan</div>
            <div className="text-xs text-muted mt-0.5">
              "Just enough" SS targets for the <span className="capitalize font-medium text-ink">{scenario}</span> scenario ·
              target = statistical optimal anchored to MEIO policy
            </div>
          </div>
          <div className="flex gap-1.5">
            {['ALL', 'REDUCE', 'MAINTAIN', 'INCREASE'].map(f => {
              const activeColors = {
                REDUCE:   { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' },
                MAINTAIN: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
                INCREASE: { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
                ALL:      { bg: '#F1F5F9', color: '#0F172A', border: '#CBD5E1' },
              };
              const isActive = optFilter === f;
              const c = activeColors[f];
              return (
                <button key={f} onClick={() => setOptFilter(f)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                  style={{
                    background: isActive ? c.bg : '#F8FAFC',
                    color: isActive ? c.color : '#64748B',
                    border: `1px solid ${isActive ? c.border : '#E2E8F0'}`,
                  }}>
                  {f === 'ALL' ? 'All SKUs' : f.charAt(0) + f.slice(1).toLowerCase()}
                  {f !== 'ALL' && (
                    <span className="ml-1 font-normal">
                      ({f === 'REDUCE' ? toReduce.length : f === 'INCREASE' ? toIncrease.length : toMaintain.length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'SKUs to Reduce SS', value: toReduce.length, sub: 'over-buffered ("just in case")', color: '#DC2626', bg: '#FEF2F2' },
            { label: 'WC to Release', value: fmt$(totalWcRelease), sub: 'from SS reduction', color: '#DC2626', bg: '#FEF2F2' },
            { label: 'SKUs to Increase SS', value: toIncrease.length, sub: 'under-buffered (at risk)', color: '#4F46E5', bg: '#EEF2FF' },
            { label: 'Holding Cost Saving', value: fmt$(totalHoldingSave) + '/yr', sub: 'from right-sizing', color: '#059669', bg: '#ECFDF5' },
          ].map((tile, i) => (
            <div key={i} className="rounded-xl p-3 border" style={{ background: tile.bg, borderColor: tile.color + '30' }}>
              <div className="text-xs text-muted">{tile.label}</div>
              <div className="text-xl font-bold mt-0.5" style={{ color: tile.color }}>{tile.value}</div>
              <div className="text-xs text-faint mt-0.5">{tile.sub}</div>
            </div>
          ))}
        </div>

        {/* Optimisation table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
                <th className="text-left px-3 py-2.5">SKU</th>
                <th className="text-left px-3 py-2.5">Name</th>
                <th className="text-right px-3 py-2.5">Current SS</th>
                <th className="text-right px-3 py-2.5">Optimal Target</th>
                <th className="text-right px-3 py-2.5">Delta</th>
                <th className="text-center px-3 py-2.5">Decision</th>
                <th className="text-right px-3 py-2.5">WC Impact</th>
                <th className="text-center px-3 py-2.5">Risk Months</th>
                <th className="text-left px-3 py-2.5">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {optimized
                .filter(s => optFilter === 'ALL' || s.decision === optFilter)
                .sort((a, b) => {
                  const order = { INCREASE: 0, REDUCE: 1, MAINTAIN: 2 };
                  return order[a.decision] - order[b.decision] || a.tier - b.tier;
                })
                .map((sku, i) => {
                  const decisionStyle = {
                    REDUCE:   { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5', label: '↓ Reduce' },
                    INCREASE: { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE', label: '↑ Increase' },
                    MAINTAIN: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: '✓ Maintain' },
                  }[sku.decision];
                  const urgencyColor = {
                    Immediate: '#DC2626', 'This Quarter': '#D97706', 'Next Review': '#0F766E', Monitor: '#94A3B8',
                  }[sku.urgency];
                  const tierC = TIER_COLORS[sku.tier];
                  return (
                    <tr key={sku.id + i} className="border-b border-border-light hover:bg-surface transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold" style={{ color: tierC }}>{sku.id}</td>
                      <td className="px-3 py-2.5 text-xs text-ink">{sku.name}</td>
                      <td className="px-3 py-2.5 text-xs text-right text-muted">{sku.currentSS.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-semibold text-ink">{sku.effectiveOptimal.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-semibold"
                        style={{ color: sku.delta > 0 ? '#DC2626' : sku.delta < 0 ? '#4F46E5' : '#64748B' }}>
                        {sku.delta > 0 ? '+' : ''}{sku.delta.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: decisionStyle.bg, color: decisionStyle.color, border: `1px solid ${decisionStyle.border}` }}>
                          {decisionStyle.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right font-semibold"
                        style={{ color: sku.wcImpact > 0 ? '#059669' : '#4F46E5' }}>
                        {sku.wcImpact > 0 ? '+' : ''}{fmt$(sku.wcImpact)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {sku.riskMonths > 0
                          ? <span className="text-xs font-bold text-danger">{sku.riskMonths}</span>
                          : <span className="text-xs text-faint">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: urgencyColor }}>{sku.urgency}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
