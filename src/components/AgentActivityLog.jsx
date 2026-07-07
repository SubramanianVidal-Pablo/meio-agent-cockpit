import { useState } from 'react';
import { Clock, CheckCircle2, XCircle, Bot, AlertTriangle, User } from 'lucide-react';
import { AGENT_LOG_DATA, SKU_DATA } from '../data/mockData';

function decisionBadge(decision) {
  if (!decision || decision === 'Pending') return <span className="text-xs text-slate-500">Pending</span>;
  const color = decision === 'Approved' ? '#00A651' : decision === 'Rejected' ? '#EF4444' : '#64748B';
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: color + '20', color }}>
      {decision}
    </span>
  );
}

const criticalCount = SKU_DATA.filter(s => s.status === 'CRITICAL_OOS').length;
const excessCount = SKU_DATA.filter(s => s.status === 'EXCESS').length;

export default function AgentActivityLog({ extraLogs = [] }) {
  const [filter, setFilter] = useState('All');

  const allLogs = [
    ...extraLogs,
    ...AGENT_LOG_DATA,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const actionTypes = ['All', ...new Set(allLogs.map(l => l.action))];
  const filtered = filter === 'All' ? allLogs : allLogs.filter(l => l.action === filter);

  const approvedCount = allLogs.filter(l => l.plannerDecision === 'Approved' || l.plannerDecision === 'APPROVED').length;
  const rejectedCount = allLogs.filter(l => l.plannerDecision === 'Rejected' || l.plannerDecision === 'REJECTED').length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Agent Activity Log</h2>
          <p className="text-sm text-slate-400">Full audit trail of agent actions and planner decisions</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Actions', value: allLogs.length, color: '#3B82F6', Icon: Bot },
          { label: 'Approved', value: approvedCount, color: '#00A651', Icon: CheckCircle2 },
          { label: 'Rejected', value: rejectedCount, color: '#EF4444', Icon: XCircle },
          { label: 'Open Exceptions', value: criticalCount + excessCount, color: '#F59E0B', Icon: AlertTriangle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="bg-slate-card border border-slate-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 flex-wrap">
        {['All', ...new Set(allLogs.map(l => l.action))].slice(0, 8).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
              filter === f
                ? 'bg-bcg-green/20 border-bcg-green/40 text-bcg-green'
                : 'border-slate-border text-slate-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-card border border-slate-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-border">
              {['Timestamp', 'SKU', 'Action', 'Change', 'Outcome', 'Planner', 'Decision'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={log.id || i} className="border-b border-slate-border/50 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-bcg-green">{log.sku}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">{log.action}</td>
                <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                  {log.oldValue && log.newValue ? (
                    <span className="flex items-center gap-1">
                      <span className="text-slate-500">{log.oldValue}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-white">{log.newValue}</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{log.outcome || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-300">{log.planner || log.actor || '—'}</td>
                <td className="px-4 py-3">{decisionBadge(log.plannerDecision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">No log entries match this filter</div>
        )}
      </div>
    </div>
  );
}
