import { SKU_DATA, NETWORK_DEMAND } from '../../data/mockData';
import { TrendingUp, TrendingDown, Minus, MapPin } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const STATUS_COLOR = {
  CRITICAL_OOS: '#EF4444', EXCESS: '#F59E0B', AT_RISK: '#F59E0B',
  HEALTHY: '#00A651', POLICY_BREACH: '#8B5CF6',
};

const STATUS_BG = {
  CRITICAL_OOS: 'bg-red-500', EXCESS: 'bg-amber-400', AT_RISK: 'bg-amber-500',
  HEALTHY: 'bg-bcg-green', POLICY_BREACH: 'bg-purple-500',
};

// Simplified world map using SVG regions
function WorldMap({ nodes }) {
  return (
    <div className="relative w-full" style={{ height: 260 }}>
      {/* SVG world outline — simplified continents */}
      <svg viewBox="0 0 800 400" className="absolute inset-0 w-full h-full" style={{ opacity: 0.25 }}>
        {/* North America */}
        <path d="M 80 60 L 220 60 L 240 100 L 220 160 L 180 200 L 140 220 L 100 200 L 70 160 L 60 120 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* South America */}
        <path d="M 160 230 L 210 230 L 220 260 L 210 330 L 180 360 L 150 330 L 140 280 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* Europe */}
        <path d="M 360 50 L 440 50 L 460 80 L 450 120 L 400 130 L 360 110 L 345 80 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* Africa */}
        <path d="M 370 140 L 440 140 L 460 180 L 450 270 L 410 300 L 370 270 L 355 200 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* Asia */}
        <path d="M 460 40 L 680 40 L 700 100 L 680 160 L 600 180 L 500 160 L 460 120 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* Australia */}
        <path d="M 600 250 L 680 250 L 700 290 L 680 320 L 620 320 L 590 290 Z" fill="#2A3A52" stroke="#3A4D66" strokeWidth="1.5" />
        {/* Grid lines */}
        {[0,1,2,3,4].map(i => (
          <line key={`h${i}`} x1="0" y1={i * 80} x2="800" y2={i * 80} stroke="#1E2A3B" strokeWidth="0.5" />
        ))}
        {[0,1,2,3,4,5,6,7,8].map(i => (
          <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="400" stroke="#1E2A3B" strokeWidth="0.5" />
        ))}
      </svg>

      {/* Node overlays — positioned as approximate lat/lng on the SVG */}
      {nodes.map(node => {
        // Map lng (-180..180) → x (0..800), lat (90..-90) → y (0..400)
        const x = ((node.lng + 180) / 360) * 800;
        const y = ((90 - node.lat) / 180) * 400;
        const color = STATUS_COLOR[node.status] || '#64748B';
        const size = Math.max(16, Math.min(36, (node.weeklyDemand / 1500)));

        return (
          <div
            key={node.node}
            className="absolute flex flex-col items-center"
            style={{ left: `${(x / 800) * 100}%`, top: `${(y / 400) * 100}%`, transform: 'translate(-50%, -50%)' }}
            title={`${node.node}: ${node.weeklyDemand.toLocaleString()} u/wk`}
          >
            <div
              className="rounded-full border-2 border-white/30 flex items-center justify-center font-bold text-white animate-pulse"
              style={{ width: size, height: size, background: color, fontSize: size * 0.3 }}
            >
              {node.fill > 100 ? '▲' : node.fill < 50 ? '▼' : '●'}
            </div>
            <div className="text-white text-xs font-semibold mt-0.5 whitespace-nowrap" style={{ fontSize: 9, textShadow: '0 1px 3px #000' }}>
              {node.node}
            </div>
          </div>
        );
      })}

      {/* Connection lines */}
      <svg viewBox="0 0 800 400" className="absolute inset-0 w-full h-full pointer-events-none">
        {nodes.filter(n => n.echelon !== 'Plant').map((dest, i) => {
          const srcNode = nodes.find(n => n.node.includes('Plant'));
          if (!srcNode) return null;
          const x1 = ((srcNode.lng + 180) / 360) * 800;
          const y1 = ((90 - srcNode.lat) / 180) * 400;
          const x2 = ((dest.lng + 180) / 360) * 800;
          const y2 = ((90 - dest.lat) / 180) * 400;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#00A651" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="4 4" />
          );
        })}
      </svg>
    </div>
  );
}

// Weekly avg demand summary — colored boxes like the reference image
function DemandSummaryBox({ node }) {
  const color = STATUS_COLOR[node.status];
  const fillClass = STATUS_BG[node.status];
  return (
    <div className="rounded-xl p-3 text-white flex flex-col gap-1" style={{ background: color + 'CC' }}>
      <div className="text-xs font-semibold opacity-80">{node.node}</div>
      <div className="text-xl font-black">{(node.weeklyDemand / 1000).toFixed(1)}K</div>
      <div className="text-xs opacity-70">units/wk</div>
      <div className="text-xs font-medium mt-1 flex items-center gap-1">
        {node.fill > 100 ? <TrendingUp className="w-3 h-3" /> : node.fill < 60 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        {node.fill}% DOH fill
      </div>
    </div>
  );
}

// ABC demand breakdown
const abcBreakdown = ['A', 'B', 'C'].map(cls => ({
  class: cls,
  count: SKU_DATA.filter(s => s.abcClass === cls).length,
  weeklyDemand: SKU_DATA.filter(s => s.abcClass === cls).reduce((a, s) => a + s.forecastMean, 0),
  pnlAtRisk: Math.abs(SKU_DATA.filter(s => s.abcClass === cls).reduce((a, s) => a + s.pnlImpact, 0)),
}));

const locationDemand = [
  { loc: 'Plant A', demand: SKU_DATA.filter(s => s.location === 'Plant A').reduce((a, s) => a + s.forecastMean, 0) },
  { loc: 'Plant B', demand: SKU_DATA.filter(s => s.location === 'Plant B').reduce((a, s) => a + s.forecastMean, 0) },
  { loc: 'DC East', demand: SKU_DATA.filter(s => s.location === 'DC East').reduce((a, s) => a + s.forecastMean, 0) },
  { loc: 'DC West', demand: SKU_DATA.filter(s => s.location === 'DC West').reduce((a, s) => a + s.forecastMean, 0) },
  { loc: 'DC Central', demand: SKU_DATA.filter(s => s.location === 'DC Central').reduce((a, s) => a + s.forecastMean, 0) },
];

export default function NetworkSummary() {
  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Network Nodes', value: NETWORK_DEMAND.length, color: '#3B82F6' },
          { label: 'Total Weekly Demand', value: SKU_DATA.reduce((a,s) => a + s.forecastMean, 0).toLocaleString() + ' u', color: '#00A651' },
          { label: 'Nodes At Risk', value: NETWORK_DEMAND.filter(n => n.status !== 'HEALTHY').length, color: '#F59E0B' },
          { label: 'Critical OOS Nodes', value: NETWORK_DEMAND.filter(n => n.status === 'CRITICAL_OOS').length, color: '#EF4444' },
          { label: 'Total P&L at Risk', value: '$' + (SKU_DATA.reduce((a,s) => a + Math.abs(s.pnlImpact), 0) / 1000000).toFixed(1) + 'M', color: '#EF4444' },
        ].map(k => (
          <div key={k.label} className="bg-slate-card border border-slate-border rounded-xl p-3">
            <div className="text-xs text-slate-400">{k.label}</div>
            <div className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Network Map */}
        <div className="col-span-2 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-semibold text-white">Network Map</div>
              <div className="text-xs text-slate-400">Node size = weekly demand · color = inventory health</div>
            </div>
            <div className="flex gap-2">
              {[['Critical', '#EF4444'], ['At Risk', '#F59E0B'], ['Healthy', '#00A651'], ['Excess', '#F59E0B']].map(([l, c]) => (
                <div key={l} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span className="text-xs text-slate-500">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <WorldMap nodes={NETWORK_DEMAND} />
        </div>

        {/* Weekly Avg Demand Summary — colored boxes */}
        <div className="bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-3">Weekly Avg Demand Summary</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {NETWORK_DEMAND.map(n => <DemandSummaryBox key={n.node} node={n} />)}
          </div>
          <div className="text-xs text-slate-400 text-center">Click map nodes to filter</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Demand by location */}
        <div className="col-span-2 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-1">Weekly Avg Dependent Demand by Location</div>
          <div className="text-xs text-slate-400 mb-3">Avg units/week · scroll right for full detail</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={locationDemand} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" vertical={false} />
              <XAxis dataKey="loc" tick={{ fill: '#94A3B8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1E2A3B', border: '1px solid #2A3A52', borderRadius: 8, fontSize: 11 }}
                formatter={v => [v.toLocaleString() + ' u/wk', 'Demand']} />
              <Bar dataKey="demand" fill="#00A651" fillOpacity={0.8} radius={[3,3,0,0]} name="Weekly Demand" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ABC breakdown */}
        <div className="bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-3">ABC Class Summary</div>
          <div className="space-y-3">
            {abcBreakdown.map(cls => {
              const color = cls.class === 'A' ? '#EF4444' : cls.class === 'B' ? '#F59E0B' : '#64748B';
              return (
                <div key={cls.class} className="rounded-lg p-3 border" style={{ borderColor: color + '40', background: color + '10' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg font-black" style={{ color }}>Class {cls.class}</span>
                    <span className="text-xs text-slate-400">{cls.count} SKUs</span>
                  </div>
                  <div className="text-sm font-bold text-white">{cls.weeklyDemand.toLocaleString()} <span className="text-xs font-normal text-slate-400">u/wk</span></div>
                  <div className="text-xs text-slate-400 mt-0.5">P&L at risk: <span style={{ color }} className="font-medium">${(cls.pnlAtRisk / 1000).toFixed(0)}K</span></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
