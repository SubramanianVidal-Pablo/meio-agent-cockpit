import { useState } from 'react';
import { GitCompare, BarChart2, Globe, Flag, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import ModelVsActual from './results/ModelVsActual';
import SKUProfileDashboard from './results/SKUProfileDashboard';
import NetworkSummary from './results/NetworkSummary';
import { SKU_DATA } from '../data/mockData';

const FORECAST_TIERS = [
  { tier: 'Tier 1', desc: 'Life-saving · Class A',  skuCount: 6, mape: 18.1, bias: +4.2,  serviceLevel: 96.2, target: 99.5, color: '#EF4444' },
  { tier: 'Tier 2', desc: 'Essential · Class A/B',   skuCount: 4, mape: 24.3, bias: +7.8,  serviceLevel: 94.8, target: 98.0, color: '#F59E0B' },
  { tier: 'Tier 3', desc: 'Tail · Class B/C',        skuCount: 2, mape: 38.7, bias: +11.4, serviceLevel: 87.4, target: 96.0, color: '#64748B' },
];
const OVERALL_MAPE = 28.4;
const OVERALL_BIAS = 8.2;

const DASHBOARDS = [
  {
    id: 'plan-vs-actual',
    label: 'Plan vs Actual',
    icon: GitCompare,
    description: 'Safety stock model vs actual deployment — identify outlier biologics',
    component: ModelVsActual,
  },
  {
    id: 'sku-profile',
    label: 'Biologic Profile',
    icon: BarChart2,
    description: 'Demand over time, batch lead time breakdown, business constraints',
    component: SKUProfileDashboard,
  },
  {
    id: 'network',
    label: 'Territory View',
    icon: Globe,
    description: 'Regional DoS, cold chain compliance, and service hotspots',
    component: NetworkSummary,
  },
];

// Territory / account data for leadership view
const TERRITORIES = [
  { id: 't1', name: 'Northeast Oncology', gm: 'D. Okafor', accounts: 12, avgDoS: 28, targetDoS: 45, serviceRate: 91.2, hotspots: 3, coldChainCompliance: 97.8, flagged: false },
  { id: 't2', name: 'West Coast Haematology', gm: 'S. Park', accounts: 9, avgDoS: 52, targetDoS: 45, serviceRate: 98.9, hotspots: 0, coldChainCompliance: 99.1, flagged: false },
  { id: 't3', name: 'Southeast Rare Disease', gm: 'M. Williams', accounts: 7, avgDoS: 18, targetDoS: 60, serviceRate: 82.4, hotspots: 5, coldChainCompliance: 95.2, flagged: true },
  { id: 't4', name: 'Central Immunology', gm: 'R. Chen', accounts: 11, avgDoS: 41, targetDoS: 45, serviceRate: 96.1, hotspots: 1, coldChainCompliance: 98.5, flagged: false },
  { id: 't5', name: 'Gulf States Cell Therapy', gm: 'A. Hassan', accounts: 4, avgDoS: 14, targetDoS: 30, serviceRate: 88.7, hotspots: 2, coldChainCompliance: 99.8, flagged: true },
];

function ForecastQualitySection() {
  return (
    <div className="bg-slate-card border border-slate-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-bcg-green" />
        <span className="text-sm font-semibold text-white">Forecast Quality &amp; Service Segmentation</span>
        <span className="text-xs text-slate-400 ml-1">PLAN.ai statistical model</span>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {/* Left: 2 overall KPIs — col-span-1 */}
        <div className="col-span-1 space-y-3">
          <div className="bg-navy border border-slate-border rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-1">Overall MAPE</div>
            <div className="text-2xl font-bold text-amber-400">{OVERALL_MAPE}%</div>
            <div className="text-xs text-slate-500 mt-0.5">target &lt;20%</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium">+8.4pp above target</span>
            </div>
          </div>
          <div className="bg-navy border border-slate-border rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-1">Forecast Bias</div>
            <div className="text-2xl font-bold text-amber-400">+{OVERALL_BIAS}%</div>
            <div className="text-xs text-slate-500 mt-0.5">systematic over-forecast</div>
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium">Action required</span>
            </div>
          </div>
        </div>

        {/* Right: tier table — col-span-4 */}
        <div className="col-span-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-border">
                {['Tier', 'Description', 'SKUs', 'MAPE', 'Bias', 'Service Level', 'Target', 'Gap'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FORECAST_TIERS.map(t => {
                const gap = t.serviceLevel - t.target;
                const gapColor = gap >= -1 ? '#00A651' : gap >= -3 ? '#F59E0B' : '#EF4444';
                return (
                  <tr key={t.tier} className="border-b border-slate-border/40 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: t.color + '20', color: t.color }}>{t.tier}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{t.desc}</td>
                    <td className="px-3 py-2.5 text-white font-semibold">{t.skuCount}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-semibold ${t.mape < 20 ? 'text-bcg-green' : t.mape < 30 ? 'text-amber-400' : 'text-red-400'}`}>{t.mape}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-amber-400 font-semibold">+{t.bias}%</td>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: gapColor }}>{t.serviceLevel}%</td>
                    <td className="px-3 py-2.5 text-slate-400">{t.target}%</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold" style={{ color: gapColor }}>
                        {gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-400 bg-navy border border-slate-border rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>Tier 3 tail SKUs are dragging overall service metrics — agent has flagged the 2 worst offenders in the action queue.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerritoryRow({ territory, onFlag }) {
  const dosOk = territory.avgDoS >= territory.targetDoS * 0.8;
  const dosColor = territory.avgDoS < territory.targetDoS * 0.6 ? '#EF4444' : territory.avgDoS < territory.targetDoS * 0.9 ? '#F59E0B' : '#00A651';
  const slColor = territory.serviceRate >= 97 ? '#00A651' : territory.serviceRate >= 92 ? '#F59E0B' : '#EF4444';

  return (
    <tr className="border-b border-slate-border/50 hover:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-white">{territory.name}</div>
        <div className="text-xs text-slate-400">GM: {territory.gm} · {territory.accounts} accounts</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-navy rounded-full overflow-hidden" style={{ width: 60 }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (territory.avgDoS / territory.targetDoS) * 100)}%`, background: dosColor }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: dosColor }}>{territory.avgDoS}d</span>
          <span className="text-xs text-slate-500">/ {territory.targetDoS}d</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-semibold" style={{ color: slColor }}>{territory.serviceRate}%</span>
      </td>
      <td className="px-4 py-3">
        {territory.hotspots > 0 ? (
          <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
            <AlertTriangle className="w-3 h-3" />{territory.hotspots} hotspot{territory.hotspots > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-bcg-green flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Clear</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${territory.coldChainCompliance >= 99 ? 'text-bcg-green' : territory.coldChainCompliance >= 97 ? 'text-amber-400' : 'text-red-400'}`}>
          {territory.coldChainCompliance}%
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onFlag(territory.id)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
            territory.flagged
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'border-slate-border text-slate-400 hover:text-amber-400 hover:border-amber-500/40'
          }`}
        >
          <Flag className="w-3 h-3" />
          {territory.flagged ? 'Flagged' : 'Flag for uplift'}
        </button>
      </td>
    </tr>
  );
}

export default function MEIOResults() {
  const [active, setActive] = useState('plan-vs-actual');
  const [territories, setTerritories] = useState(TERRITORIES);
  const [showLeadership, setShowLeadership] = useState(false);
  const ActiveComponent = DASHBOARDS.find(d => d.id === active)?.component || ModelVsActual;

  function flagTerritory(id) {
    setTerritories(prev => prev.map(t => t.id === id ? { ...t, flagged: !t.flagged } : t));
  }

  const flaggedCount = territories.filter(t => t.flagged).length;
  const hotspotCount = territories.reduce((a, t) => a + t.hotspots, 0);
  const avgServiceRate = (territories.reduce((a, t) => a + t.serviceRate, 0) / territories.length).toFixed(1);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Forecast Quality & Tier Segmentation */}
      <ForecastQualitySection />

      {/* Leadership toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Analytics &amp; Leadership View</h2>
          <p className="text-sm text-slate-400 mt-0.5">Plan vs actual performance · territory metrics · growth account flagging</p>
        </div>
        <button
          onClick={() => setShowLeadership(s => !s)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            showLeadership ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-slate-card border-slate-border text-slate-400 hover:text-white'
          }`}
        >
          <Flag className="w-4 h-4" />
          Territory View
          {flaggedCount > 0 && <span className="ml-1 text-xs bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-semibold">{flaggedCount}</span>}
        </button>
      </div>

      {/* Leadership / Territory Dashboard */}
      {showLeadership && (
        <div className="space-y-4 fade-slide-in">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Network Avg Service Rate', value: `${avgServiceRate}%`, color: parseFloat(avgServiceRate) >= 97 ? '#00A651' : '#F59E0B', icon: TrendingUp },
              { label: 'Service Hotspots', value: hotspotCount, color: hotspotCount > 3 ? '#EF4444' : '#F59E0B', icon: AlertTriangle },
              { label: 'Territories Flagged for Uplift', value: flaggedCount, color: '#F59E0B', icon: Flag },
              { label: 'Cold Chain Compliance', value: `${(territories.reduce((a,t) => a + t.coldChainCompliance, 0) / territories.length).toFixed(1)}%`, color: '#3B82F6', icon: CheckCircle2 },
            ].map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="bg-slate-card border border-slate-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5" style={{ color: k.color }} />
                    <span className="text-xs text-slate-400">{k.label}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
                </div>
              );
            })}
          </div>

          {/* Territory table */}
          <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-border flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Territory &amp; Account Metrics</span>
              <span className="text-xs text-slate-400">Flag territories to raise DoS targets in next planning cycle</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-border">
                  {['Territory / GM', 'Avg DoS vs Target', 'Service Rate', 'Hotspots', 'Cold Chain', 'Action'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {territories.map(t => <TerritoryRow key={t.id} territory={t} onFlag={flagTerritory} />)}
              </tbody>
            </table>
          </div>

          {flaggedCount > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 fade-slide-in">
              <Flag className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-amber-400">{flaggedCount} territory flagged for DoS target uplift</div>
                <div className="text-xs text-slate-400 mt-0.5">These inputs will flow into the next MEIO planning cycle — safety stock targets will be raised for affected biologics in flagged territories.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytical dashboards */}
      <div className="flex items-stretch gap-3">
        {DASHBOARDS.map(d => {
          const Icon = d.icon;
          const isActive = d.id === active;
          return (
            <button key={d.id} onClick={() => setActive(d.id)}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                isActive ? 'bg-bcg-green/15 border-bcg-green/50 text-white' : 'bg-slate-card border-slate-border text-slate-400 hover:text-white hover:border-slate-400'
              }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-bcg-green/20' : 'bg-white/5'}`}>
                <Icon className="w-4 h-4" style={{ color: isActive ? '#00A651' : undefined }} />
              </div>
              <div>
                <div className={`text-sm font-semibold ${isActive ? 'text-white' : ''}`}>{d.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{d.description}</div>
              </div>
              {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-bcg-green" />}
            </button>
          );
        })}
      </div>

      <ActiveComponent />
    </div>
  );
}
