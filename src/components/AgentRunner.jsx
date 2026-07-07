import { useState, useRef, useEffect } from 'react';
import { Play, CheckCircle, XCircle, Clock, Zap, Bot, ChevronDown, ChevronUp, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { AGENT_STEPS, PROPOSED_ACTIONS, buildSynthesisPrompt } from '../data/agentScript';
import AgentThinkingPulse from './common/AgentThinkingPulse';

const URGENCY_COLOR = { IMMEDIATE: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#3B82F6' };
const URGENCY_BG = { IMMEDIATE: 'bg-red-500/10 border-red-500/30', HIGH: 'bg-amber-500/10 border-amber-500/30', MEDIUM: 'bg-blue-500/10 border-blue-500/30' };

const STATUS = { idle: 'idle', running: 'running', synthesizing: 'synthesizing', done: 'done' };

function ToolCard({ step, state, expanded, onToggle }) {
  // state: 'pending' | 'running' | 'done'
  const isDone = state === 'done';
  const isRunning = state === 'running';
  const isPending = state === 'pending';

  return (
    <div className={`rounded-xl border transition-all duration-300 ${
      isDone ? 'border-bcg-green/30 bg-bcg-green/5' :
      isRunning ? 'border-bcg-green/50 bg-bcg-green/10' :
      'border-slate-border bg-slate-card opacity-40'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={isDone ? onToggle : undefined}>
        {/* Status icon */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isDone ? 'bg-bcg-green/20' : isRunning ? 'bg-bcg-green/20' : 'bg-slate-border/30'
        }`}>
          {isDone && <CheckCircle className="w-4 h-4 text-bcg-green" />}
          {isRunning && <div className="w-3 h-3 rounded-full bg-bcg-green animate-pulse" />}
          {isPending && <Clock className="w-4 h-4 text-slate-600" />}
        </div>

        {/* Tool info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">{step.icon}</span>
            <span className={`font-mono text-xs font-semibold ${isDone || isRunning ? 'text-bcg-green' : 'text-slate-600'}`}>
              {step.tool}
            </span>
            <span className="text-xs text-slate-500 truncate hidden sm:block">
              ({Object.entries(step.params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})
            </span>
          </div>
          {(isRunning || isDone) && (
            <div className="text-xs text-slate-400 mt-0.5">{step.label}</div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning && <AgentThinkingPulse size="sm" label="Executing…" />}
          {isDone && (
            <button className="text-slate-500 hover:text-white transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Result expansion */}
      {isDone && expanded && (
        <div className="px-4 pb-3 border-t border-bcg-green/10 mt-0 pt-3 fade-slide-in">
          <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Tool Result</div>
          <pre className="text-xs text-slate-300 bg-navy rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">
            {JSON.stringify(step.result, null, 2)}
          </pre>
          <div className="mt-2 text-xs text-bcg-green font-medium">{step.resultSummary}</div>
        </div>
      )}
    </div>
  );
}

function ActionRow({ action, approved, rejected, onApprove, onReject }) {
  const color = URGENCY_COLOR[action.urgency];
  const isApproved = approved.has(action.id);
  const isRejected = rejected.has(action.id);

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isApproved ? 'border-bcg-green/40 bg-bcg-green/10' :
      isRejected ? 'border-red-500/30 bg-red-500/5 opacity-50' :
      URGENCY_BG[action.urgency]
    }`}>
      <div className="shrink-0">
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: color + '20', color }}>
          {action.urgency}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-bcg-green">{action.sku}</span>
          <span className="text-xs text-white font-medium">{action.action}</span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{action.detail}</div>
      </div>
      <div className={`text-xs font-bold shrink-0 ${action.pnl > 0 ? 'text-amber-400' : 'text-bcg-green'}`}>
        {action.pnl > 0 ? '+' : ''}${(Math.abs(action.pnl) / 1000).toFixed(0)}K
      </div>
      {!isApproved && !isRejected && (
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onApprove(action.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-bcg-green text-white hover:bg-green-500 transition-colors">
            <ThumbsUp className="w-3 h-3" /> Approve
          </button>
          <button onClick={() => onReject(action.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-white/5 border border-slate-border text-slate-400 hover:text-white transition-colors">
            <ThumbsDown className="w-3 h-3" />
          </button>
        </div>
      )}
      {isApproved && (
        <div className="flex items-center gap-1 text-bcg-green text-xs font-medium shrink-0">
          <CheckCircle className="w-3.5 h-3.5" /> Approved
        </div>
      )}
      {isRejected && (
        <div className="flex items-center gap-1 text-slate-500 text-xs shrink-0">
          <XCircle className="w-3.5 h-3.5" /> Rejected
        </div>
      )}
    </div>
  );
}

export default function AgentRunner({ onLogAction }) {
  const [runStatus, setRunStatus] = useState(STATUS.idle);
  const [stepStates, setStepStates] = useState({});
  const [expandedSteps, setExpandedSteps] = useState({});
  const [synthesis, setSynthesis] = useState('');
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [approved, setApproved] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [runCount, setRunCount] = useState(0);
  const abortRef = useRef(null);
  const stepResults = useRef({});

  function toggleExpand(stepId) {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  }

  function approveAction(id) {
    setApproved(prev => new Set([...prev, id]));
    const action = PROPOSED_ACTIONS.find(a => a.id === id);
    if (action && onLogAction) {
      onLogAction({
        id: `agent-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: action.action,
        sku: action.sku,
        oldValue: '—',
        newValue: action.detail,
        plannerDecision: 'Approved',
        outcome: 'Queued',
        planner: 'Planner',
      });
    }
  }

  function rejectAction(id) {
    setRejected(prev => new Set([...prev, id]));
  }

  async function runAgent() {
    if (runStatus === STATUS.running || runStatus === STATUS.synthesizing) return;

    // Reset
    setRunStatus(STATUS.running);
    setStepStates({});
    setExpandedSteps({});
    setSynthesis('');
    setSynthesisLoading(false);
    setApproved(new Set());
    setRejected(new Set());
    stepResults.current = {};
    setRunCount(c => c + 1);

    // Execute each step sequentially with scripted delays
    for (const step of AGENT_STEPS) {
      await new Promise(r => setTimeout(r, step.delayMs));
      setStepStates(prev => ({ ...prev, [step.id]: 'running' }));
      await new Promise(r => setTimeout(r, step.durationMs));
      stepResults.current[step.id] = step;
      setStepStates(prev => ({ ...prev, [step.id]: 'done' }));
      setExpandedSteps(prev => ({ ...prev, [step.id]: false }));
    }

    // Final Claude synthesis call
    setRunStatus(STATUS.synthesizing);
    setSynthesisLoading(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          messages: [{ role: 'user', content: buildSynthesisPrompt(stepResults.current) }],
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (response.ok) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                setSynthesis(prev => prev + parsed.delta.text);
              }
            } catch { /* skip */ }
          }
        }
      } else {
        // Fallback synthesis if no API key
        setSynthesis(
          `Agent run complete. The MEIO analysis identified ${AGENT_STEPS.find(s => s.id === 'get_critical').result.skus.length} critical OOS SKUs requiring immediate replenishment totaling $1.76M in orders. PROD-A100 (Oncology API) is the highest priority with a 3-day stockout window and $487K P&L at risk — an emergency order of 1,650 units should be placed within 24 hours. Simultaneously, $245K in working capital can be released from excess positions in PROD-D400 and PROD-E500 through replenishment deferral and lateral transfer. Approve the 4 replenishment orders below to protect network service levels across critical biopharma SKUs.`
        );
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setSynthesis('Synthesis unavailable — approve actions below based on the tool results above.');
      }
    } finally {
      setSynthesisLoading(false);
      setRunStatus(STATUS.done);
    }
  }

  const totalApprovedValue = PROPOSED_ACTIONS
    .filter(a => approved.has(a.id))
    .reduce((sum, a) => sum + Math.abs(a.pnlImpact || a.pnl), 0);

  const approvedCount = approved.size;
  const totalActions = PROPOSED_ACTIONS.length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-bcg-green/20 border border-bcg-green/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-bcg-green" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">AI Replenishment Engine</h2>
            <p className="text-sm text-slate-400">Agentic planning run · biologics network · Com Ops review &amp; approval</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {runCount > 0 && (
            <span className="text-xs text-slate-500">Run #{runCount}</span>
          )}
          <button
            onClick={runAgent}
            disabled={runStatus === STATUS.running || runStatus === STATUS.synthesizing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              runStatus === STATUS.running || runStatus === STATUS.synthesizing
                ? 'bg-slate-card border border-slate-border text-slate-500 cursor-not-allowed'
                : 'bg-bcg-green hover:bg-green-500 text-white shadow-lg shadow-bcg-green/20 hover:scale-105 active:scale-95'
            }`}
          >
            {runStatus === STATUS.running || runStatus === STATUS.synthesizing ? (
              <><div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-bcg-green animate-spin" /> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> {runCount > 0 ? 'Re-run Agent' : 'Run Agent'}</>
            )}
          </button>
        </div>
      </div>

      {/* How it works — shown only before first run */}
      {runStatus === STATUS.idle && (
        <div className="bg-slate-card border border-slate-border rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-3">How this agent works</div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { step: '1', icon: '🔍', label: 'Consumption Scan', desc: 'Engine reads DoS, batch release status, and cold chain position across all biologics nodes' },
              { step: '2', icon: '🧮', label: 'Order Generation', desc: 'Calculates replenishment orders, shelf life risk, and rebalancing moves by echelon' },
              { step: '3', icon: '🤖', label: 'AI Synthesis', desc: 'Claude synthesises outputs into a prioritised executive order plan with patient impact context' },
              { step: '4', icon: '✅', label: 'Com Ops Approval', desc: 'Com Ops reviews and approves or rejects each order — approved actions flow to ERP' },
            ].map(s => (
              <div key={s.step} className="text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-bcg-green/10 border border-bcg-green/20 flex items-center justify-center text-lg mx-auto">
                  {s.icon}
                </div>
                <div className="text-xs font-semibold text-white">{s.label}</div>
                <div className="text-xs text-slate-500 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-slate-400">
            <span className="text-blue-400 font-medium">Demo note: </span>
            Tool steps 1–7 simulate the biopharma planning engine (batch yield model, CMO allocation, shelf life logic). Only the final AI Synthesis step makes a live Claude API call (~400 tokens). In production, steps 1–7 connect to your ERP, WMS, and LIMS.
          </div>
        </div>
      )}

      {/* Tool call steps */}
      {runStatus !== STATUS.idle && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Agent Tool Calls</div>
          {AGENT_STEPS.map(step => (
            <ToolCard
              key={step.id}
              step={step}
              state={stepStates[step.id] || 'pending'}
              expanded={expandedSteps[step.id]}
              onToggle={() => toggleExpand(step.id)}
            />
          ))}
        </div>
      )}

      {/* AI Synthesis */}
      {(runStatus === STATUS.synthesizing || runStatus === STATUS.done) && (
        <div className="bg-slate-card border border-bcg-green/30 rounded-xl p-4 fade-slide-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-bcg-green" />
              <span className="text-sm font-semibold text-white">Claude AI Synthesis</span>
              <span className="text-xs text-slate-500">— live API call</span>
            </div>
            {synthesisLoading && <AgentThinkingPulse size="sm" />}
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {synthesis}
            {synthesisLoading && <span className="inline-block w-1 h-4 bg-bcg-green ml-0.5 animate-pulse align-middle" />}
          </p>
        </div>
      )}

      {/* Approval panel */}
      {runStatus === STATUS.done && (
        <div className="space-y-3 fade-slide-in">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">AI-Generated Order Plan — Com Ops Approval Required</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {approvedCount}/{totalActions} approved
                {approvedCount > 0 && <span className="ml-2 text-bcg-green font-medium">· ${(totalApprovedValue / 1000).toFixed(0)}K queued</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => PROPOSED_ACTIONS.forEach(a => approveAction(a.id))}
                disabled={approvedCount === totalActions}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-bcg-green/20 text-bcg-green hover:bg-bcg-green/30 transition-colors disabled:opacity-30"
              >
                Approve All
              </button>
              <button
                onClick={() => PROPOSED_ACTIONS.forEach(a => setRejected(prev => new Set([...prev, a.id])))}
                disabled={rejected.size === totalActions}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-slate-border text-slate-400 hover:text-white transition-colors disabled:opacity-30"
              >
                Reject All
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {PROPOSED_ACTIONS.map(action => (
              <ActionRow
                key={action.id}
                action={action}
                approved={approved}
                rejected={rejected}
                onApprove={approveAction}
                onReject={rejectAction}
              />
            ))}
          </div>

          {approvedCount > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-bcg-green/10 border border-bcg-green/30 fade-slide-in">
              <CheckCircle className="w-5 h-5 text-bcg-green shrink-0" />
              <div>
                <div className="text-sm font-semibold text-bcg-green">{approvedCount} action{approvedCount > 1 ? 's' : ''} approved and queued</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Orders submitted to ERP · Cold chain logistics notified · Batch release team alerted · Full audit trail recorded
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
