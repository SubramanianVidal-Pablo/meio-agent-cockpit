import { runSimulation } from '../data/simulationEngine';
import { TIERS, MONTH_LABELS } from '../data/skuData';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
    <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full">
      {tier === 1 ? 'T1' : tier === 2 ? 'T2' : tier === 3 ? 'T3' : 'T4'}
    </span>
  );
}

export default function DemandSupplyBalance({ skus, scenario, ssMultiplier }) {
  const simulated = runSimulation(skus, scenario, ssMultiplier);

  // Imbalance summary
  const skusWithShortfall = simulated.filter(sku =>
    sku.timeline.some(t => t.inventory < t.demand)
  ).length;

  const monthsExposure = simulated.reduce((s, sku) =>
    s + sku.timeline.filter(t => t.atRisk).length, 0
  );

  const estimatedLostRevenue = simulated.reduce((sum, sku) =>
    sum + sku.timeline.reduce((s, t) => {
      if (t.atRisk) {
        const shortfall = Math.max(0, t.demand - t.inventory);
        return s + shortfall * sku.unitRevenue;
      }
      return s;
    }, 0), 0
  );

  // Aggregate supply vs demand per month
  const monthlyAgg = MONTH_LABELS.map((label, m) => {
    let totalSupply = 0, totalDemand = 0;
    simulated.forEach(sku => {
      totalSupply += sku.timeline[m].supply;
      totalDemand += sku.timeline[m].demand;
    });
    return { month: label, 'Planned Supply': Math.round(totalSupply), 'Total Demand': Math.round(totalDemand) };
  });

  // Product balance table
  const tableSkus = simulated.map(sku => {
    const riskMonths = sku.timeline.filter(t => t.atRisk);
    const worstEntry = riskMonths.length > 0
      ? riskMonths.reduce((worst, t) => t.gap < worst.gap ? t : worst, riskMonths[0])
      : null;
    const fulfillmentImpact = sku.timeline.reduce((s, t) => s + t.fulfillmentRate, 0) / 12;
    return {
      ...sku,
      riskMonthsCount: riskMonths.length,
      worstInventory: worstEntry ? Math.round(worstEntry.inventory) : sku.onHand,
      worstSsTarget: worstEntry ? Math.round(worstEntry.ssTarget) : sku.meioSafetyStock * ssMultiplier,
      worstGap: worstEntry ? Math.round(worstEntry.gap) : 0,
      fulfillmentImpact: fulfillmentImpact.toFixed(1),
    };
  }).sort((a, b) => a.worstGap - b.worstGap);

  function priorityAction(sku) {
    if (sku.tier <= 1 && sku.riskMonthsCount > 0) return { label: 'Prioritize supply', color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' };
    if (sku.tier === 2 && sku.riskMonthsCount > 0) return { label: 'Monitor supply', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' };
    if ((sku.tier === 3 || sku.tier === 4) && sku.riskMonthsCount > 0) return { label: 'Accept short', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
    return { label: 'No action', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' };
  }

  // Tier prioritization grid
  const tierGrid = [1, 2, 3, 4].map(tier => {
    const group = simulated.filter(s => s.tier === tier);
    const shorted = group.filter(s => s.timeline.some(t => t.inventory < t.demand)).length;
    const protected$ = group.reduce((sum, sku) => sum + sku.timeline.reduce((s, t) => s + t.inventory * sku.unitRevenue * sku.unitMargin / 12, 0), 0);
    const sacrificed$ = group.reduce((sum, sku) => sum + sku.timeline.reduce((s, t) => {
      const short = Math.max(0, t.demand - t.inventory);
      return s + short * sku.unitRevenue * sku.unitMargin;
    }, 0), 0);
    const strategies = {
      1: 'Protect fully — no shorting',
      2: 'Protect where possible',
      3: 'Accept partial short',
      4: 'Short to free capacity',
    };
    return { tier, strategy: strategies[tier], shorted, protected$, sacrificed$ };
  });

  const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 },
  };

  return (
    <div className="space-y-5 fade-in">
      {/* Imbalance summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Products with Supply Shortfall', value: skusWithShortfall, sub: 'SKUs with inventory < demand', color: 'text-danger' },
          { label: 'Months of Exposure', value: monthsExposure.toLocaleString(), sub: 'SKU × month pairs at risk', color: 'text-warning' },
          { label: 'Estimated Lost Revenue', value: fmt$(estimatedLostRevenue), sub: 'from at-risk months', color: 'text-danger' },
        ].map((m, i) => (
          <div key={i} className="bg-white border border-border-light rounded-xl shadow-card p-5">
            <div className="text-xs text-muted font-medium mb-1">{m.label}</div>
            <div className={`text-3xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-faint mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Area chart */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="text-sm font-semibold text-ink mb-1">Aggregate Supply vs Demand</div>
        <div className="text-xs text-muted mb-4">All SKUs combined — teal area = planned supply, red line = total demand</div>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={monthlyAgg} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
            <Tooltip {...tooltipStyle} formatter={(v) => v.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Planned Supply" stroke="#0F766E" fill="#CCFBF1" strokeWidth={2} />
            <Area type="monotone" dataKey="Total Demand" stroke="#DC2626" fill="#FEF2F2" fillOpacity={0.3} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Product Balance Table */}
      <div className="bg-white border border-border-light rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="text-sm font-semibold text-ink">Product Balance Table</div>
          <div className="text-xs text-muted mt-0.5">All 25 SKUs · sorted by worst gap</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
                <th className="text-left px-4 py-2.5">Tier</th>
                <th className="text-left px-4 py-2.5">SKU</th>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-center px-4 py-2.5">Mths at Risk</th>
                <th className="text-right px-4 py-2.5">Worst Inv</th>
                <th className="text-right px-4 py-2.5">SS Target</th>
                <th className="text-right px-4 py-2.5">Worst Gap</th>
                <th className="text-right px-4 py-2.5">Fulfillment %</th>
                <th className="text-left px-4 py-2.5">Priority Action</th>
              </tr>
            </thead>
            <tbody>
              {tableSkus.map((sku) => {
                const action = priorityAction(sku);
                return (
                  <tr key={sku.id} className="border-b border-border-light hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5"><TierBadge tier={sku.tier} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">{sku.id}</td>
                    <td className="px-4 py-2.5 text-ink">{sku.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-semibold ${sku.riskMonthsCount > 3 ? 'text-danger' : sku.riskMonthsCount > 0 ? 'text-warning' : 'text-success'}`}>
                        {sku.riskMonthsCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink">{sku.worstInventory.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{sku.worstSsTarget.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${sku.worstGap < 0 ? 'text-danger' : 'text-success'}`}>
                      {sku.worstGap >= 0 ? '+' : ''}{sku.worstGap.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-semibold ${parseFloat(sku.fulfillmentImpact) >= 99 ? 'text-success' : parseFloat(sku.fulfillmentImpact) >= 95 ? 'text-warning' : 'text-danger'}`}>
                        {sku.fulfillmentImpact}%
                      </span>
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

      {/* Cascading Effect Flow */}
      <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
        <div className="text-sm font-semibold text-ink mb-4">Cascading Effect Flow</div>
        <div className="flex items-start gap-2 overflow-x-auto pb-2">
          {[
            { label: 'Safety Stock Reduced', value: `${((1 - ssMultiplier) * 100).toFixed(0)}% reduction`, color: '#64748B', bg: '#F8FAFC' },
            { label: 'Supply Gap Opens', value: `${monthsExposure} exposure months`, color: '#D97706', bg: '#FFFBEB' },
            { label: 'Products Shorted', value: `${skusWithShortfall} SKUs`, color: '#DC2626', bg: '#FEF2F2' },
            { label: 'Revenue at Risk', value: fmt$(estimatedLostRevenue), color: '#DC2626', bg: '#FEF2F2' },
            { label: 'Patient/Customer Impact', value: 'Service disruption', color: '#7C3AED', bg: '#F5F3FF' },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <div className="rounded-xl p-3 text-center min-w-[130px]"
                style={{ background: step.bg, border: `1px solid ${step.color}20` }}>
                <div className="text-xs font-semibold mb-1" style={{ color: step.color }}>{step.label}</div>
                <div className="text-sm font-bold text-ink">{step.value}</div>
              </div>
              {i < arr.length - 1 && <div className="text-xl text-faint font-bold shrink-0">→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Tier Prioritization Grid */}
      <div className="bg-white border border-border-light rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="text-sm font-semibold text-ink">Tier Prioritization Strategy</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
              <th className="text-left px-5 py-2.5">Tier</th>
              <th className="text-left px-5 py-2.5">Strategy</th>
              <th className="text-center px-5 py-2.5">Products Shorted</th>
              <th className="text-right px-5 py-2.5">Revenue Protected</th>
              <th className="text-right px-5 py-2.5">Revenue Sacrificed</th>
            </tr>
          </thead>
          <tbody>
            {tierGrid.map(t => (
              <tr key={t.tier} className="border-b border-border-light">
                <td className="px-5 py-3"><TierBadge tier={t.tier} /></td>
                <td className="px-5 py-3 text-ink text-xs">{t.strategy}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`font-semibold ${t.shorted > 0 ? 'text-danger' : 'text-success'}`}>{t.shorted}</span>
                </td>
                <td className="px-5 py-3 text-right font-semibold text-success">{fmt$(t.protected$)}</td>
                <td className="px-5 py-3 text-right font-semibold text-danger">{t.sacrificed$ > 0 ? fmt$(t.sacrificed$) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
