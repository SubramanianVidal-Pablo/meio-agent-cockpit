import { useState, useRef } from 'react';
import { ArrowLeft, Bot, CheckCircle, XCircle, TrendingDown, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { generateTrajectoryData, generateServiceLevelDistribution } from '../data/mockData';
import { callClaude, buildDeepDivePrompt } from '../api/claude';
import AgentThinkingPulse from './common/AgentThinkingPulse';

const SCENARIOS = ['conservative', 'balanced', 'aggressive'];
const SCENARIO_COLORS = { conservative: '#3B82F6', balanced: '#00A651', aggressive: '#F59E0B' };
const SCENARIO_LABELS = { conservative: 'Conservative', balanced: 'Balanced', aggressive: 'Aggressive' };

const STATUS_LABELS = {
  CRITICAL_OOS:  { label: 'Critical OOS Risk', color: '#EF4444' },
  EXCESS:        { label: 'Excess Stock',       color: '#F59E0B' },
  AT_RISK:       { label: 'At Risk',            color: '#F59E0B' },
  HEALTHY:       { label: 'Healthy',            color: '#00A651' },
  POLICY_BREACH: { label: 'Policy Breach',      color: '#8B5CF6' },
};

function MetricCard({ label, current, recommended }) {
  const curr = String(current);
  const rec  = String(recommended);
  const changed = curr !== rec;
  return (
    <div className="bg-navy border border-slate-border rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{curr}</div>
      {changed && (
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-3 h-3 text-bcg-green" />
          <span className="text-xs text-bcg-green">→ {rec}</span>
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-card border border-slate-border rounded-lg p-3 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function SKUDeepDive({ sku, onBack, onApprove, onReject }) {
  const [selectedScenario, setSelectedScenario] = useState('balanced');
  const [rationale, setRationale] = useState('');
  const [rationaleLoading, setRationaleLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const abortRef = useRef(null);

  const trajectoryData = generateTrajectoryData(sku, selectedScenario);
  const slData = generateServiceLevelDistribution(sku);
  const statusCfg = STATUS_LABELS[sku.status] || STATUS_LABELS.HEALTHY;

  async function loadRationale() {
    if (rationaleLoading || rationale) return;
    abortRef.current = new AbortController();
    setRationaleLoading(true);
    setRationale('');
    try {
      await callClaude(
        buildDeepDivePrompt(sku, selectedScenario),
        (chunk) => setRationale(prev => prev + chunk),
        abortRef.current.signal
      );
    } catch (e) {
      if (e.name !== 'AbortError') setRationale('[Rationale unavailable — check API key configuration]');
    } finally {
      setRationaleLoading(false);
    }
  }

  function handleScenarioChange(s) {
    setSelectedScenario(s);
    setRationale('');
    setRationaleLoading(false);
    abortRef.current?.abort();
  }

  function handleApprove() {
    setApproved(true);
    setTimeout(() => onApprove(sku, selectedScenario), 800);
  }

  function handleReject() {
    setRejected(true);
    setTimeout(() => onReject(sku), 600);
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Cockpit
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-bcg-green font-semibold">{sku.id}</span>
            <span className="text-white font-semibold">{sku.name}</span>
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: statusCfg.color + '20', color: statusCfg.color }}>
              {statusCfg.label}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{sku.category} · {sku.location} · ABC: {sku.abcClass} · {sku.echelon}</div>
        </div>
        <div className={`text-sm font-semibold ${sku.pnlImpact < 0 ? 'text-red-400' : 'text-amber-400'}`}>
          P&L: {sku.pnlImpact > 0 ? '+' : ''}${(Math.abs(sku.pnlImpact) / 1000).toFixed(0)}K
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="Days on Hand" current={`${sku.currentDOH}d`} recommended={`${sku.targetDOH}d`} />
        <MetricCard label="Service Level" current={`${sku.currentServiceLevel}%`} recommended={`${sku.targetServiceLevel}%`} />
        <MetricCard label="Safety Stock" current={sku.currentSafetyStock?.toLocaleString()} recommended={sku.recommendedSafetyStock?.toLocaleString()} />
        <MetricCard label="Lead Time" current={`${sku.leadTime}d`} recommended={`${sku.leadTime}d`} />
        <MetricCard label="Demand CV" current={`${(sku.demandCV * 100).toFixed(0)}%`} recommended={`${(sku.demandCV * 100).toFixed(0)}%`} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Trajectory Chart */}
        <div className="col-span-2 bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Inventory Trajectory — 12 Week Forecast</div>
              <div className="text-xs text-slate-400 mt-0.5">Units projection by scenario</div>
            </div>
            <div className="flex gap-1">
              {SCENARIOS.map(s => (
                <button key={s} onClick={() => handleScenarioChange(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    selectedScenario === s ? 'text-white border-transparent' : 'border-slate-border text-slate-400 hover:text-white'
                  }`}
                  style={selectedScenario === s ? { background: SCENARIO_COLORS[s] } : {}}
                >
                  {SCENARIO_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trajectoryData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" />
              <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="currentPolicy" stroke="#3B82F6" strokeWidth={selectedScenario === 'conservative' ? 2.5 : 1.5} dot={false} name="Current Policy" />
              <Line type="monotone" dataKey="recommended" stroke="#00A651" strokeWidth={selectedScenario === 'balanced' ? 2.5 : 1.5} dot={false} name="Recommended" />
              <Line type="monotone" dataKey="riskBoundary" stroke="#EF4444" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Risk Boundary" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* SL Distribution */}
        <div className="bg-slate-card border border-slate-border rounded-xl p-4">
          <div className="text-sm font-semibold text-white mb-1">Service Level Distribution</div>
          <div className="text-xs text-slate-400 mb-3">Current vs Optimized</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={slData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3A52" />
              <XAxis dataKey="sl" tick={{ fill: '#64748B', fontSize: 9 }} interval={4} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1E2A3B', border: '1px solid #2A3A52', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="current" fill="#3B82F6" opacity={0.7} name="Current" radius={[2,2,0,0]} />
              <Bar dataKey="optimized" fill="#00A651" opacity={0.7} name="Optimized" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded bg-blue-500/70" />
              <span className="text-xs text-slate-400">Now: {sku.currentServiceLevel}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded bg-bcg-green/70" />
              <span className="text-xs text-slate-400">Target: {sku.targetServiceLevel}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Rationale */}
      <div className="bg-slate-card border border-slate-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-bcg-green" />
            <span className="text-sm font-semibold text-white">Agent Rationale — {SCENARIO_LABELS[selectedScenario]} Scenario</span>
          </div>
          {rationaleLoading && <AgentThinkingPulse size="sm" />}
          {!rationale && !rationaleLoading && (
            <button onClick={loadRationale}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bcg-green/20 text-bcg-green hover:bg-bcg-green/30 transition-colors">
              <Bot className="w-3 h-3" /> Generate Rationale
            </button>
          )}
        </div>
        {rationale ? (
          <p className="text-sm text-slate-300 leading-relaxed">
            {rationale}
            {rationaleLoading && <span className="inline-block w-1 h-4 bg-bcg-green ml-0.5 animate-pulse" />}
          </p>
        ) : !rationaleLoading ? (
          <p className="text-sm text-slate-500 italic">Click "Generate Rationale" to get Claude's analysis of the {SCENARIO_LABELS[selectedScenario].toLowerCase()} recommendation.</p>
        ) : (
          <p className="text-sm text-slate-500">Analyzing scenario…</p>
        )}
      </div>

      {/* Action Bar */}
      {!approved && !rejected && (
        <div className="bg-slate-card border border-slate-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Approve {SCENARIO_LABELS[selectedScenario]} Recommendation?</div>
            <div className="text-xs text-slate-400 mt-0.5">Order submitted to ERP · Cold chain logistics notified · Batch release team alerted</div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReject}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-border text-slate-300 hover:text-white hover:border-slate-400 text-sm font-medium transition-colors">
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button onClick={handleApprove}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-bcg-green hover:bg-green-500 text-white text-sm font-semibold transition-colors">
              <CheckCircle className="w-4 h-4" /> Approve Replenishment Order
            </button>
          </div>
        </div>
      )}
      {approved && (
        <div className="bg-bcg-green/10 border border-bcg-green/30 rounded-xl p-4 flex items-center gap-3 fade-slide-in">
          <CheckCircle className="w-5 h-5 text-bcg-green" />
          <span className="text-sm text-bcg-green font-medium">Recommendation approved — policy update queued for {sku.id}</span>
        </div>
      )}
      {rejected && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 fade-slide-in">
          <XCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400 font-medium">Recommendation rejected — returning to cockpit</span>
        </div>
      )}
    </div>
  );
}
