import { useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { SKU_DATA } from '../../data/mockData';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

// Build scatter data: model (recommended) vs actual (current)
const scatterData = SKU_DATA.map(s => ({
  ...s,
  model: s.recommendedSafetyStock,
  actual: s.currentSafetyStock,
  diff: s.recommendedSafetyStock - s.currentSafetyStock,
  diffPct: ((s.recommendedSafetyStock - s.currentSafetyStock) / s.currentSafetyStock * 100).toFixed(1),
  isOutlier: Math.abs(s.recommendedSafetyStock - s.currentSafetyStock) / s.currentSafetyStock > 0.4,
}));

const COLOR = {
  CRITICAL_OOS: '#EF4444', EXCESS: '#F59E0B', AT_RISK: '#F59E0B',
  HEALTHY: '#00A651', POLICY_BREACH: '#8B5CF6',
};

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  const color = COLOR[payload.status] || '#64748B';
  const isOutlier = payload.isOutlier;
  return (
    <circle
      cx={cx} cy={cy}
      r={isOutlier ? 8 : 5}
      fill={color}
      fillOpacity={0.85}
      stroke={isOutlier ? '#fff' : 'none'}
      strokeWidth={isOutlier ? 1.5 : 0}
    />
  );
};

const ScatterTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-card border border-slate-border rounded-lg p-3 text-xs shadow-xl">
      <div className="font-mono text-bcg-green font-semibold mb-1">{d.id} — {d.name}</div>
      <div className="space-y-1 text-slate-300">
        <div>Model SS: <span className="text-white font-medium">{d.model.toLocaleString()}</span></div>
        <div>Actual SS: <span className="text-white font-medium">{d.actual.toLocaleString()}</span></div>
        <div>Gap: <span className={d.diff > 0 ? 'text-red-400' : 'text-bcg-green'} >
          {d.diff > 0 ? '+' : ''}{d.diff.toLocaleString()} ({d.diffPct}%)
        </span></div>
        <div>Status: <span style={{ color: COLOR[d.status] }}>{d.status.replace(/_/g, ' ')}</span></div>
      </div>
    </div>
  );
};

const sortedByDiff = [...scatterData].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

export default function ModelVsActual() {
  const [selectedSku, setSelectedSku] = useState(null);
  const [echelonFilter, setEchelonFilter] = useState('All');

  const echelons = ['All', 'Plant', 'DC', 'Customer'];
  const filtered = echelonFilter === 'All' ? scatterData : scatterData.filter(s => s.echelon === echelonFilter);

  const totalModelSS = SKU_DATA.reduce((a, s) => a + s.recommendedSafetyStock, 0);
  const totalActualSS = SKU_DATA.reduce((a, s) => a + s.currentSafetyStock, 0);
  const outliers = scatterData.filter(s => s.isOutlier);

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Model Total SS', value: (totalModelSS / 1000).toFixed(1) + 'K', sub: 'units recommended', color: '#00A651' },
          { label: 'Actual Total SS', value: (totalActualSS / 1000).toFixed(1) + 'K', sub: 'units deployed', color: '#3B82F6' },
          { label: 'Total Gap', value: ((totalModelSS - totalActualSS) / 1000).toFixed(1) + 'K', sub: 'units understocked', color: '#EF4444' },
          { label: 'Outlier SKUs', value: outliers.length, sub: '>40% deviation', color: '#F59E0B' },
        ].map(k => (
          <div key={k.label} className="bg-slate-card border border-slate-border rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">{k.label}</div>
            <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Scatter Plot */}
        <div className="col-span-3 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-white">Model vs Actual — Safety Stock ($Sum Inventory Value)</div>
              <div className="text-xs text-slate-400 mt-0.5">Each dot = one SKU · outliers circled in white · diagonal = perfect fit</div>
            </div>
            <div className="flex gap-1">
              {echelons.map(e => (
                <button key={e} onClick={() => setEchelonFilter(e)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                    echelonFilter === e ? 'bg-bcg-green text-white border-bcg-green' : 'border-slate-border text-slate-400 hover:text-white'
                  }`}>{e}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" />
              <XAxis
                dataKey="actual" type="number" name="Actual SS"
                tick={{ fill: '#64748B', fontSize: 10 }}
                label={{ value: 'Actual Safety Stock (units)', position: 'bottom', fill: '#64748B', fontSize: 11 }}
              />
              <YAxis
                dataKey="model" type="number" name="Model SS"
                tick={{ fill: '#64748B', fontSize: 10 }}
                label={{ value: 'Model Safety Stock (units)', angle: -90, position: 'insideLeft', fill: '#64748B', fontSize: 11 }}
              />
              <Tooltip content={<ScatterTooltip />} />
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: 50000, y: 50000 }]}
                stroke="#2A3A52" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: 'Perfect fit', fill: '#475569', fontSize: 10, position: 'insideTopLeft' }}
              />
              <Scatter data={filtered} shape={<CustomDot />} />
            </ScatterChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex gap-4 mt-2 justify-center">
            {Object.entries({ 'OOS Risk': '#EF4444', 'Excess': '#F59E0B', 'At Risk': '#F59E0B', 'Healthy': '#00A651', 'Policy': '#8B5CF6' }).map(([l, c]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-xs text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Table */}
        <div className="col-span-2 bg-slate-card border border-slate-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-border">
            <div className="text-sm font-semibold text-white">Output Detail — Top Outliers</div>
            <div className="text-xs text-slate-400 mt-0.5">Ranked by absolute SS gap</div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-navy">
                <tr className="border-b border-slate-border">
                  {['SKU', 'Echelon', 'Model SS', 'Actual SS', 'Gap %'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedByDiff.map(s => {
                  const pct = parseFloat(s.diffPct);
                  const gapColor = pct > 40 ? '#EF4444' : pct > 15 ? '#F59E0B' : '#00A651';
                  const bg = s.isOutlier ? 'bg-red-500/5' : '';
                  return (
                    <tr key={s.id} className={`border-b border-slate-border/40 hover:bg-white/5 cursor-pointer ${bg}`}
                      onClick={() => setSelectedSku(s.id === selectedSku ? null : s.id)}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-bcg-green">{s.id}</div>
                        <div className="text-slate-500 truncate max-w-[70px]">{s.name}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{s.echelon}</td>
                      <td className="px-3 py-2 text-white font-medium">{s.model.toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-300">{s.actual.toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: gapColor }}>
                        {pct > 0 ? '+' : ''}{pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Gap bar chart */}
      <div className="bg-slate-card border border-slate-border rounded-xl p-4">
        <div className="text-sm font-semibold text-white mb-1">Model vs Actual — By SKU (Safety Stock Units)</div>
        <div className="text-xs text-slate-400 mb-3">Green = model ≥ actual (well-covered) · Red = model &gt; actual (understocked)</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={scatterData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" vertical={false} />
            <XAxis dataKey="id" tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={v => v.replace('PROD-', '')} />
            <YAxis tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
            <Tooltip contentStyle={{ background: '#1E2A3B', border: '1px solid #2A3A52', borderRadius: 8, fontSize: 11 }}
              formatter={(v, n) => [v.toLocaleString(), n]} />
            <Bar dataKey="model" name="Model SS" radius={[2,2,0,0]}>
              {scatterData.map(s => <Cell key={s.id} fill={s.model > s.actual ? '#EF4444' : '#00A651'} fillOpacity={0.8} />)}
            </Bar>
            <Bar dataKey="actual" name="Actual SS" fill="#3B82F6" fillOpacity={0.5} radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
