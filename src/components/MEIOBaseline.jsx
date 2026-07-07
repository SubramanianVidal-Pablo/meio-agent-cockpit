import { TIERS } from '../data/skuData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function fmt$(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function TierBadge({ tier }) {
  const t = TIERS[tier];
  return (
    <span
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
    >
      {tier === 1 ? 'T1' : tier === 2 ? 'T2' : tier === 3 ? 'T3' : 'T4'}
    </span>
  );
}

function StatusBadge({ pct }) {
  if (pct >= 1) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success-50 text-success border border-green-200">On Target</span>;
  if (pct >= 0.8) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-50 text-warning border border-amber-200">Under-Deployed</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-danger-50 text-danger border border-red-200">Critical Gap</span>;
}

export default function MEIOBaseline({ skus }) {
  // KPIs
  const totalMEIOValue = skus.reduce((s, k) => s + k.meioSafetyStock * k.unitRevenue, 0);
  const totalGapValue = skus.reduce((s, k) => s + Math.max(0, k.meioSafetyStock - k.currentSafetyStock) * k.unitRevenue, 0);
  const skusBelowTarget = skus.filter(k => k.currentSafetyStock < k.meioSafetyStock).length;

  // Tier summary
  const tierSummary = [1, 2, 3, 4].map(tier => {
    const group = skus.filter(k => k.tier === tier);
    const avgMargin = group.reduce((s, k) => s + k.unitMargin, 0) / group.length;
    const totalVal = group.reduce((s, k) => s + k.meioSafetyStock * k.unitRevenue, 0);
    const belowPct = group.filter(k => k.currentSafetyStock < k.meioSafetyStock).length / group.length * 100;
    return { tier, count: group.length, avgMargin, totalVal, belowPct };
  });

  // Chart data — T1 + T2 only (first 12 SKUs by tier)
  const chartSkus = skus.filter(k => k.tier <= 2).slice(0, 12);
  const chartData = chartSkus.map(k => ({
    id: k.id,
    'MEIO Target': k.meioSafetyStock,
    'Current SS': k.currentSafetyStock,
    atRisk: k.currentSafetyStock < k.meioSafetyStock,
  }));

  // Table — all 25, sort by tier asc, then gap desc
  const tableSkus = [...skus].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const gapA = a.currentSafetyStock - a.meioSafetyStock;
    const gapB = b.currentSafetyStock - b.meioSafetyStock;
    return gapA - gapB; // most negative first
  });

  const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 },
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">MEIO Baseline — Q3 2025 Optimization Run</h1>
          <p className="text-sm text-muted mt-0.5">Static quarterly snapshot · safety stock targets by SKU</p>
        </div>
        {/* KPI tiles */}
        <div className="flex gap-3">
          <div className="bg-white border border-border-light rounded-xl shadow-card px-4 py-3 text-right">
            <div className="text-xs text-muted font-medium">MEIO Portfolio Value</div>
            <div className="text-lg font-bold text-ink">{fmt$(totalMEIOValue)}</div>
          </div>
          <div className="bg-white border border-border-light rounded-xl shadow-card px-4 py-3 text-right">
            <div className="text-xs text-muted font-medium">Coverage Gap</div>
            <div className="text-lg font-bold text-danger">{fmt$(totalGapValue)} <span className="text-xs font-normal text-muted">under-deployed</span></div>
          </div>
          <div className="bg-white border border-border-light rounded-xl shadow-card px-4 py-3 text-right">
            <div className="text-xs text-muted font-medium">SKUs Below Target</div>
            <div className="text-lg font-bold text-warning">{skusBelowTarget} <span className="text-xs font-normal text-muted">of {skus.length}</span></div>
          </div>
        </div>
      </div>

      {/* Tier summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {tierSummary.map(t => {
          const tierInfo = TIERS[t.tier];
          return (
            <div
              key={t.tier}
              className="bg-white rounded-xl shadow-card p-4"
              style={{ borderLeft: `4px solid ${tierInfo.color}`, border: `1px solid ${tierInfo.border}` }}
            >
              <div className="text-xs font-semibold mb-2" style={{ color: tierInfo.color }}>{tierInfo.label}</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">SKUs</span>
                  <span className="font-semibold text-ink">{t.count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Avg Margin</span>
                  <span className="font-semibold text-ink">{(t.avgMargin * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">MEIO SS Value</span>
                  <span className="font-semibold text-ink">{fmt$(t.totalVal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Below Target</span>
                  <span className="font-semibold text-danger">{t.belowPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar chart */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-ink">Safety Stock: Current vs MEIO Target</div>
            <div className="text-xs text-muted">Showing Tier 1 & 2 SKUs</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#0F766E', opacity: 0.4 }} />MEIO Target</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-brand" />Current SS</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="id" tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <Tooltip {...tooltipStyle} formatter={(v) => v.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="MEIO Target" fill="#0F766E" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Current SS" fill="#0F766E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SKU Table */}
      <div className="bg-white border border-border-light rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="text-sm font-semibold text-ink">SKU Detail — All 25 Products</div>
          <div className="text-xs text-muted mt-0.5">Sorted by tier ascending, gap descending</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
                <th className="text-left px-4 py-2.5">Tier</th>
                <th className="text-left px-4 py-2.5">SKU ID</th>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-right px-4 py-2.5">Lead Time</th>
                <th className="text-right px-4 py-2.5">MEIO Target SS</th>
                <th className="text-right px-4 py-2.5">Current SS</th>
                <th className="text-right px-4 py-2.5">Gap</th>
                <th className="text-right px-4 py-2.5">% Coverage</th>
                <th className="text-right px-4 py-2.5">Margin</th>
                <th className="text-center px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableSkus.map((sku, i) => {
                const gap = sku.currentSafetyStock - sku.meioSafetyStock;
                const pct = sku.currentSafetyStock / sku.meioSafetyStock;
                return (
                  <tr key={sku.id} className={`border-b border-border-light hover:bg-surface transition-colors ${i % 2 === 0 ? '' : 'bg-surface/40'}`}>
                    <td className="px-4 py-2.5"><TierBadge tier={sku.tier} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink font-semibold">{sku.id}</td>
                    <td className="px-4 py-2.5 text-ink font-medium">{sku.name}</td>
                    <td className="px-4 py-2.5 text-muted">{sku.category}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{sku.leadTimeWeeks}w</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-ink">{sku.meioSafetyStock.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-ink">{sku.currentSafetyStock.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${gap < 0 ? 'text-danger' : 'text-success'}`}>
                      {gap >= 0 ? '+' : ''}{gap.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-semibold ${pct >= 1 ? 'text-success' : pct >= 0.8 ? 'text-warning' : 'text-danger'}`}>
                        {(pct * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{(sku.unitMargin * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge pct={pct} /></td>
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
