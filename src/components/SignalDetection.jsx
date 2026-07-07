import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Zap, AlertTriangle, Bot, X, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { callClaudeChat } from '../api/claude';
import { optimizeInventory } from '../data/simulationEngine';
import { computeABCClass } from '../data/skuData';

// ── Signal definitions ────────────────────────────────────────────────────────
const SIGNALS = [
  {
    id: 'sig-1',
    type: 'Demand Spike Detected',
    detail: 'Class A oncology SKUs showing +38% demand uplift vs forecast — 6 SKUs exposed',
    affected: 'A-001, A-003, A-004 + 3 others',
    severity: 'CRITICAL',
    severityColor: '#DC2626',
    severityBg: '#FEF2F2',
    severityBorder: '#FCA5A5',
    ctaLabel: 'Analyze',
    ctaIcon: Zap,
    agentPrompt: (portfolioCtx) => `You are a biopharma supply chain agent triaging an active external demand shock.

SIGNAL: Demand Spike +38% on Class A oncology SKUs (A-001 Lumexia mAb, A-003 Nexovir CAR-T, A-004 Protazen mAb DP and 3 others), active April through July.

PORTFOLIO CONTEXT:
${portfolioCtx}

Respond in exactly three labelled sections. One sentence each. No markdown, no lists — direct prose only.

RISK: Which SKU is most exposed and why, given its current safety stock and lead time.

IMPACTS: When the first breach occurs and the estimated revenue at risk.

RECOMMENDATION: One specific action — name the SKU, the action, and the expected outcome.`,
  },
  {
    id: 'sig-2',
    type: 'Supplier Delay Flagged',
    detail: 'CMO Alpha batch release delayed 2 weeks — affects A-001, A-003, A-005',
    affected: 'CMO Alpha · 3 SKUs',
    severity: 'HIGH',
    severityColor: '#D97706',
    severityBg: '#FFFBEB',
    severityBorder: '#FDE68A',
    ctaLabel: 'Analyze',
    ctaIcon: AlertTriangle,
    agentPrompt: (portfolioCtx) => `You are a biopharma supply chain agent triaging a confirmed supplier disruption.

SIGNAL: CMO Alpha has confirmed a 2-week batch release delay. Affected SKUs: A-001 (Lumexia mAb), A-003 (Nexovir CAR-T), A-005 (Carizumab DS). Zero supply from CMO Alpha for 2 weeks starting now.

PORTFOLIO CONTEXT:
${portfolioCtx}

Respond in exactly three labelled sections. One sentence each. No markdown, no lists — direct prose only.

RISK: Which of the three affected SKUs is most vulnerable and why, given its on-hand inventory and lead time.

IMPACTS: When the first SKU will breach safety stock and the estimated revenue exposure.

RECOMMENDATION: One specific bridging action — name the SKU, the action (e.g. activate secondary CMO, expedite, draw buffer), and the expected outcome.`,
  },
];

const AGENT_SYSTEM = `You are a senior biopharma supply chain agent. You triage external signals and produce sharp, one-sentence assessments per section. Be direct and specific — cite SKU IDs, numbers, timelines. Three sections: RISK, IMPACTS, RECOMMENDATION. One sentence each. No markdown, no lists.`;

// ── Build live portfolio context ──────────────────────────────────────────────
function buildPortfolioContext(skus) {
  const abcSkus  = computeABCClass(skus);
  const optimized = optimizeInventory(skus, 'baseline', 1.0);
  const optMap   = Object.fromEntries(optimized.map(s => [s.id, s]));
  return abcSkus.map(sku => {
    const avgD = sku.monthlyDemand.reduce((a,b)=>a+b,0) / sku.monthlyDemand.length;
    const doh  = avgD > 0 ? Math.round(sku.onHand / (avgD / 30)) : 0;
    const opt  = optMap[sku.id];
    return `${sku.id} ${sku.name} (Class ${sku.abcClass}): on-hand ${sku.onHand.toLocaleString()} units / ${doh}d DoH · MEIO SS ${sku.meioSafetyStock.toLocaleString()} · decision: ${opt?.decision ?? '—'} · supplier: ${sku.supplier} · lead time: ${sku.leadTimeWeeks}w · CV: ${(sku.demandCV*100).toFixed(0)}%`;
  }).join('\n');
}

// ── Parse three-section response ──────────────────────────────────────────────
function parseReport(text) {
  const sections = {};
  const keys = ['RISK', 'IMPACTS', 'RECOMMENDATION'];
  for (let i = 0; i < keys.length; i++) {
    const key  = keys[i];
    const next = keys[i + 1];
    const start = text.indexOf(key + ':');
    if (start === -1) continue;
    const end  = next ? text.indexOf(next + ':') : text.length;
    sections[key] = text.slice(start + key.length + 1, end !== -1 ? end : undefined).trim();
  }
  return sections;
}

// ── Agent report ──────────────────────────────────────────────────────────────
function AgentReport({ sig, skus, onClose, onDecision }) {
  const [rawText, setRawText]   = useState('');
  const [status, setStatus]     = useState('running'); // running | done | error
  const [decision, setDecision] = useState(null);      // null | 'accepted' | 'rejected'
  const abortRef = useRef(null);

  function commitDecision(d, sections) {
    setDecision(d);
    if (onDecision) {
      const now = new Date();
      onDecision({
        sigType:        sig.type,
        severity:       sig.severity,
        severityColor:  sig.severityColor,
        affected:       sig.affected,
        decision:       d,
        recommendation: sections['RECOMMENDATION'] ?? '',
        timestamp:      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }

  useEffect(() => {
    const portfolioCtx = buildPortfolioContext(skus);
    const prompt = sig.agentPrompt(portfolioCtx);
    abortRef.current = new AbortController();

    callClaudeChat(
      [{ role: 'user', content: prompt }],
      AGENT_SYSTEM,
      chunk => setRawText(prev => prev + chunk),
      abortRef.current.signal,
    )
      .then(() => setStatus('done'))
      .catch(err => { if (err.name !== 'AbortError') setStatus('error'); });

    return () => abortRef.current?.abort();
  }, [sig.id]);

  const sections      = parseReport(rawText);
  const isStreaming   = status === 'running';
  const hasRisk       = !!sections['RISK'];
  const hasImpacts    = !!sections['IMPACTS'];
  const hasRec        = !!sections['RECOMMENDATION'];

  return (
    <div className="mt-4 rounded-2xl border overflow-hidden shadow-lg" style={{ borderColor: sig.severityBorder }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 text-white" style={{ background: sig.severityColor }}>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Bot className="w-5 h-5" />
            {isStreaming && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white animate-ping" />}
          </div>
          <div>
            <div className="text-sm font-bold leading-none">Agent Analysis — {sig.type}</div>
            <div className="text-xs opacity-70 mt-0.5">
              {isStreaming ? 'Analysing signal against live portfolio data…' : decision ? (decision === 'accepted' ? '✓ Action accepted — logged for S&OP review' : '✗ Action rejected — signal remains open') : 'Analysis complete · Review and decide'}
            </div>
          </div>
        </div>
        <button onClick={() => { abortRef.current?.abort(); onClose(); }}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sections */}
      <div className="bg-white divide-y divide-slate-100">

        {/* RISK */}
        {(hasRisk || isStreaming) && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: sig.severityColor }}>
                <sig.ctaIcon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: sig.severityColor }}>Risk</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {sections['RISK'] || <span className="text-slate-400 italic">Assessing…</span>}
              {isStreaming && !hasRisk && <span className="inline-block w-1 h-4 bg-slate-300 ml-0.5 animate-pulse align-middle rounded" />}
            </p>
          </div>
        )}

        {/* IMPACTS */}
        {(hasImpacts || (isStreaming && hasRisk)) && (
          <div className="px-5 py-4" style={{ background: '#FFFBEB' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-700">Possible Impacts</span>
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">
              {sections['IMPACTS'] || <span className="text-amber-400 italic">Modelling impacts…</span>}
              {isStreaming && !hasImpacts && <span className="inline-block w-1 h-4 bg-amber-300 ml-0.5 animate-pulse align-middle rounded" />}
            </p>
          </div>
        )}

        {/* RECOMMENDATION + Accept / Reject */}
        {(hasRec || (isStreaming && hasImpacts)) && (
          <div className="px-5 py-4" style={{ background: '#F0FDFA' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-teal-700">Recommended Action</span>
            </div>
            <p className="text-sm text-teal-900 leading-relaxed mb-4">
              {sections['RECOMMENDATION'] || <span className="text-teal-400 italic">Formulating recommendation…</span>}
              {isStreaming && !hasRec && <span className="inline-block w-1 h-4 bg-teal-300 ml-0.5 animate-pulse align-middle rounded" />}
            </p>

            {/* Decision buttons — only when streaming is done and no decision yet */}
            {!isStreaming && hasRec && !decision && (
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => commitDecision('accepted', sections)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#0F766E' }}>
                  <ThumbsUp className="w-4 h-4" /> Accept Action
                </button>
                <button
                  onClick={() => commitDecision('rejected', sections)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-colors hover:bg-slate-50"
                  style={{ color: '#64748B', borderColor: '#CBD5E1' }}>
                  <ThumbsDown className="w-4 h-4" /> Reject
                </button>
              </div>
            )}

            {/* Post-decision state */}
            {decision === 'accepted' && (
              <div className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-teal-800 bg-teal-100 border border-teal-200">
                <Check className="w-4 h-4 text-teal-600 shrink-0" />
                Action accepted and logged for S&OP review. Supply planning team has been notified.
              </div>
            )}
            {decision === 'rejected' && (
              <div className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 border border-slate-200">
                <X className="w-4 h-4 text-slate-400 shrink-0" />
                Action rejected. Signal remains open and will resurface at next S&OP review.
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="px-5 py-4 text-xs text-danger bg-red-50">
            Agent error — check API connection and try again.
          </div>
        )}
      </div>
    </div>
  );
}


// ── Main export ───────────────────────────────────────────────────────────────
export default function SignalDetection({ skus, onDecision }) {
  const [open, setOpen]             = useState(true);
  const [dispatching, setDispatching] = useState(null);
  const [activeReport, setActiveReport] = useState(null);

  function handleDispatch(sig) {
    if (activeReport?.id === sig.id) { setActiveReport(null); return; }
    setDispatching(sig.id);
    setTimeout(() => { setDispatching(null); setActiveReport(sig); }, 500);
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-border-light rounded-xl overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface transition-colors text-left">
          <div className="flex items-center gap-2.5">
            <span className="text-base">⚡</span>
            <div>
              <span className="text-sm font-bold text-ink">Live Supply Intelligence</span>
              <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-danger text-white">2 signals require attention</span>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
        </button>

        {open && (
          <div className="border-t border-border-light px-5 pb-5">
            <div className="grid grid-cols-2 gap-4 mt-4">
              {SIGNALS.map(sig => {
                const isDispatching = dispatching === sig.id;
                const isActive = activeReport?.id === sig.id;
                const Icon = sig.ctaIcon;
                return (
                  <div key={sig.id}
                    className="rounded-xl border p-4 flex flex-col gap-3 transition-all"
                    style={{ background: sig.severityBg, borderColor: isActive ? sig.severityColor : sig.severityBorder }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ color: sig.severityColor, background: sig.severityColor + '18', border: `1px solid ${sig.severityColor}40` }}>
                        {sig.severity}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse ml-auto" style={{ background: sig.severityColor }} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink">{sig.type}</div>
                      <div className="text-xs text-muted mt-1 leading-relaxed">{sig.detail}</div>
                      <div className="text-xs font-semibold mt-1.5" style={{ color: sig.severityColor }}>
                        Affected: {sig.affected}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDispatch(sig)}
                      disabled={isDispatching}
                      className="mt-auto w-full py-2.5 rounded-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-80"
                      style={{ background: sig.severityColor }}>
                      {isDispatching ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Dispatching agent…
                        </>
                      ) : isActive ? (
                        <><X className="w-3 h-3" /> Close Analysis</>
                      ) : (
                        <><Icon className="w-3 h-3" /> {sig.ctaLabel} →</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {activeReport && skus && (
              <AgentReport
                key={activeReport.id}
                sig={activeReport}
                skus={skus}
                onClose={() => setActiveReport(null)}
                onDecision={onDecision}
              />
            )}
          </div>
        )}
      </div>

    </div>
  );
}
