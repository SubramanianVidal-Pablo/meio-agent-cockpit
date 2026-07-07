import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { SKU_DATA, generateDemandTimeSeries, LEAD_TIME_BREAKDOWN, TRANSPORT_LEAD_TIME } from '../../data/mockData';
import { Filter } from 'lucide-react';

const STATUS_COLOR = {
  CRITICAL_OOS: '#EF4444', EXCESS: '#F59E0B', AT_RISK: '#F59E0B',
  HEALTHY: '#00A651', POLICY_BREACH: '#8B5CF6',
};

const DemandTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-card border border-slate-border rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-1 font-medium">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function SKUProfileDashboard() {
  const [selectedSkuId, setSelectedSkuId] = useState('PROD-A100');
  const [regionFilter, setRegionFilter] = useState('All');

  const sku = SKU_DATA.find(s => s.id === selectedSkuId) || SKU_DATA[0];
  const demandData = generateDemandTimeSeries(sku);

  const regions = ['All', 'Plant', 'DC', 'Customer'];
  const filteredSkus = regionFilter === 'All' ? SKU_DATA : SKU_DATA.filter(s => s.echelon === regionFilter);

  // Weekly demand breakdown — top 5 SKUs by demand
  const weeklyBreakdown = [...SKU_DATA]
    .sort((a, b) => b.forecastMean - a.forecastMean)
    .slice(0, 8)
    .map(s => ({
      id: s.id.replace('PROD-', ''),
      name: s.name,
      weekly: s.forecastMean,
      status: s.status,
    }));

  // Business constraints table
  const constraints = SKU_DATA.map(s => ({
    id: s.id,
    name: s.name,
    minOrder: Math.round(s.forecastMean * s.leadTime * 0.5),
    maxStorage: Math.round(s.currentSafetyStock * 3.5),
    shelfLife: s.category.includes('API') ? 24 : 18,
    frozen: Math.round(s.leadTime * 0.6),
    compliant: s.currentDOH <= s.targetDOH * 1.3,
  }));

  const totalWeeklyDemand = SKU_DATA.reduce((a, s) => a + s.forecastMean, 0);

  return (
    <div className="space-y-4">
      {/* SKU selector + header */}
      <div className="bg-slate-card border border-slate-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white mb-2">
              SKU Profile Dashboard
              <span className="ml-2 text-xs font-normal text-slate-400">— Filter left-hand side first to view</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {regions.map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                    regionFilter === r ? 'bg-bcg-green text-white border-bcg-green' : 'border-slate-border text-slate-400 hover:text-white'
                  }`}>{r}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap max-w-md">
            {filteredSkus.map(s => (
              <button key={s.id} onClick={() => setSelectedSkuId(s.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
                  s.id === selectedSkuId
                    ? 'text-white border-transparent'
                    : 'border-slate-border text-slate-400 hover:text-white'
                }`}
                style={s.id === selectedSkuId ? { background: STATUS_COLOR[s.status], borderColor: STATUS_COLOR[s.status] } : {}}
              >
                {s.id.replace('PROD-', '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Demand Over Time */}
        <div className="col-span-3 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-sm font-semibold text-white">Demand Over Time — Weekly</div>
              <div className="text-xs text-slate-400">{sku.name} ({sku.id}) · {sku.echelon} · {sku.location}</div>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-slate-400">Forecast MAPE: <span className="text-white font-medium">{(sku.demandCV * 55 + 6).toFixed(1)}%</span></span>
              <span className="text-slate-400">Trend: <span style={{ color: sku.forecastTrend === 'up' ? '#00A651' : sku.forecastTrend === 'down' ? '#EF4444' : '#F59E0B' }} className="font-medium capitalize">{sku.forecastTrend}</span></span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={demandData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" />
              <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} />
              <Tooltip content={<DemandTooltip />} />
              <Line type="monotone" dataKey="upperBound" stroke="#2A3A52" strokeWidth={1} dot={false} name="Upper Bound" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="lowerBound" stroke="#2A3A52" strokeWidth={1} dot={false} name="Lower Bound" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="actual" stroke="#3B82F6" strokeWidth={2} dot={false} name="Actual Demand" />
              <Line type="monotone" dataKey="forecast" stroke="#00A651" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="5 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Demand Breakdown */}
        <div className="col-span-2 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-1">Weekly Demand Breakdown</div>
          <div className="text-xs text-slate-400 mb-3">Avg units/week · all SKUs</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyBreakdown} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748B', fontSize: 9 }} />
              <YAxis type="category" dataKey="id" tick={{ fill: '#94A3B8', fontSize: 10 }} width={35} />
              <Tooltip contentStyle={{ background: '#1E2A3B', border: '1px solid #2A3A52', borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [v.toLocaleString() + ' u/wk', 'Weekly Demand']} />
              <Bar dataKey="weekly" radius={[0,3,3,0]}>
                {weeklyBreakdown.map(s => (
                  <Cell key={s.id} fill={STATUS_COLOR[s.status] || '#3B82F6'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-right text-xs text-slate-400">
            Network total: <span className="text-white font-semibold">{totalWeeklyDemand.toLocaleString()} u/wk</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* ETE Lead Time Breakdown */}
        <div className="col-span-3 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-1">ETE Production Lead Time Breakdown</div>
          <div className="text-xs text-slate-400 mb-3">Days by stage · min/avg/max range</div>
          <div className="space-y-2.5">
            {LEAD_TIME_BREAKDOWN.map(lt => {
              const total = LEAD_TIME_BREAKDOWN.reduce((a, b) => a + b.ete, 0);
              const pct = (lt.ete / total) * 100;
              const isLong = lt.ete >= 10;
              return (
                <div key={lt.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 w-44 truncate">{lt.stage}</span>
                    <div className="flex gap-3 text-slate-500">
                      <span>Min: <span className="text-slate-300">{lt.min}d</span></span>
                      <span>Avg: <span className="text-white font-medium">{lt.ete}d</span></span>
                      <span>Max: <span className="text-slate-300">{lt.max}d</span></span>
                      <span className="text-slate-500">σ: {lt.stdDev}</span>
                    </div>
                  </div>
                  <div className="h-5 bg-navy rounded overflow-hidden relative">
                    <div
                      className="h-full rounded flex items-center px-2 text-xs text-white font-medium transition-all"
                      style={{ width: `${pct * 2.5}%`, background: isLong ? '#EF4444' : '#00A651', minWidth: 30 }}
                    >
                      {lt.ete}d
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="pt-1 border-t border-slate-border text-xs flex justify-between">
              <span className="text-slate-400">Total ETE Lead Time</span>
              <span className="text-white font-bold">{LEAD_TIME_BREAKDOWN.reduce((a, b) => a + b.ete, 0)} days</span>
            </div>
          </div>
        </div>

        {/* Business Constraints + Transport */}
        <div className="col-span-2 space-y-3">
          <div className="bg-slate-card border border-slate-border rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-2">Transport Lead Time</div>
            <div className="space-y-2">
              {TRANSPORT_LEAD_TIME.map(r => {
                const pct = (r.avg / 6) * 100;
                const p95pct = (r.p95 / 10) * 100;
                return (
                  <div key={r.route}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-slate-400 truncate w-36">{r.route}</span>
                      <span className="text-slate-500 text-right">{r.avg}d avg · p95: {r.p95}d</span>
                    </div>
                    <div className="h-3 bg-navy rounded overflow-hidden flex gap-0.5">
                      <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                      <div className="h-full bg-blue-900 rounded" style={{ width: `${p95pct - pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Business Constraints mini-table */}
          <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-border text-xs font-semibold text-white">Business Constraints</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-border/50">
                    {['SKU', 'MOQ', 'Shelf', 'Frozen', 'OK'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {constraints.slice(0, 5).map(c => (
                    <tr key={c.id} className="border-b border-slate-border/30 hover:bg-white/5">
                      <td className="px-2 py-1.5 font-mono text-bcg-green">{c.id.replace('PROD-', '')}</td>
                      <td className="px-2 py-1.5 text-slate-300">{(c.minOrder / 1000).toFixed(1)}K</td>
                      <td className="px-2 py-1.5 text-slate-300">{c.shelfLife}m</td>
                      <td className="px-2 py-1.5 text-slate-300">{c.frozen}d</td>
                      <td className="px-2 py-1.5">
                        <span className={`font-bold ${c.compliant ? 'text-bcg-green' : 'text-red-400'}`}>
                          {c.compliant ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
