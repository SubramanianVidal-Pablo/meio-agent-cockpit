import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Minimize2, ChevronDown } from 'lucide-react';
import { callClaudeChat } from '../api/claude';
import { runSimulation, getPortfolioSummary, optimizeInventory } from '../data/simulationEngine';

// Build a rich system prompt from live portfolio state
function buildSystemPrompt(skus, scenario, ssMultiplier) {
  const simulated  = runSimulation(skus, scenario, ssMultiplier);
  const summary    = getPortfolioSummary(simulated);
  const optimized  = optimizeInventory(skus, scenario, ssMultiplier);

  const fmt$ = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + (n / 1e3).toFixed(0) + 'K';

  // ssMultiplier can be a single number or per-tier object {1,2,3,4}
  const ssLabel = typeof ssMultiplier === 'object'
    ? `A:${ssMultiplier.A ?? ssMultiplier[1] ?? 1}× B:${ssMultiplier.B ?? ssMultiplier[2] ?? 1}× C:${ssMultiplier.C ?? ssMultiplier[3] ?? 1}×`
    : `${ssMultiplier}×`;

  const toReduce   = optimized.filter(s => s.decision === 'REDUCE');
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE');

  const top5Risk = simulated
    .filter(s => s.timeline.some(t => t.atRisk))
    .sort((a, b) =>
      b.timeline.reduce((s, t) => s + t.marginAtRisk, 0) -
      a.timeline.reduce((s, t) => s + t.marginAtRisk, 0))
    .slice(0, 5);

  const shortfallMonths = ['Mar', 'Apr', 'May'];
  const demandSpikeMonths = ['Jun', 'Jul', 'Aug'];

  return `You are a supply chain planning assistant embedded in an AI-powered inventory management tool for a biopharma portfolio. You have full access to the live simulation state and can answer any question the user asks about inventory, risk, decisions, or supply chain concepts.

CURRENT SIMULATION STATE
Scenario: ${scenario} | Safety Stock Multipliers: ${ssLabel} (per tier vs MEIO target)
SKUs at risk: ${summary.skusAtRisk} of ${skus.length} | Worst risk month: ${summary.worstMonth}
Total margin at risk: ${fmt$(summary.totalMarginAtRisk)} | Average fulfillment rate: ${summary.avgFulfillmentRate.toFixed(1)}%

SCENARIO DETAILS
${scenario === 'baseline' ? 'Baseline: No supply disruptions. Normal planned supply and demand.' :
  scenario === 'reactive' ? `Reactive: Capacity shortfall ${shortfallMonths.join('/')} (supply drops to 70%). Demand spike ${demandSpikeMonths.join('/')} for Class A & B (+40%). No pre-positioning done.` :
  `Proactive: Capacity shortfall ${shortfallMonths.join('/')} (supply at 85%). Demand spike ${demandSpikeMonths.join('/')} for Class A & B (+25%). Pre-built buffers in place.`}

OPTIMISATION DECISIONS
SKUs to REDUCE (over-buffered — "just in case" inventory): ${toReduce.length} SKUs
  → ${toReduce.slice(0,5).map(s => `${s.id} ${s.name} (excess: ${s.delta} units, WC: ${fmt$(s.wcImpact)})`).join('; ')}
SKUs to INCREASE (under-buffered — at risk): ${toIncrease.length} SKUs
  → ${toIncrease.slice(0,5).map(s => `${s.id} ${s.name} (short: ${Math.abs(s.delta)} units, ${s.riskMonths} risk months)`).join('; ')}
Total WC to release: ${fmt$(toReduce.reduce((s, x) => s + x.wcImpact, 0))}
Total WC needed: ${fmt$(toIncrease.reduce((s, x) => s + Math.abs(x.wcImpact), 0))}

TOP AT-RISK SKUs
${top5Risk.map(s => {
  const riskMths = s.timeline.filter(t => t.atRisk).length;
  const totalRisk = s.timeline.reduce((a, t) => a + t.marginAtRisk, 0);
  return `${s.id} ${s.name} — ${riskMths} risk months, ${fmt$(totalRisk)} margin at risk, current SS: ${s.currentSafetyStock} vs MEIO target: ${s.meioSafetyStock}`;
}).join('\n')}

PORTFOLIO STRUCTURE
25 SKUs classified using ABC methodology (revenue contribution):
  Class A (top 20% of SKUs · 80% of portfolio revenue): High-margin biologics — mAbs, gene therapy, CAR-T, plasma-derived. Highest service level target (99.5%).
  Class B (next 30% of SKUs · 15% of portfolio revenue): Mid-revenue biosimilars and specialty biologics. Standard MEIO safety stock policy (98% service).
  Class C (remaining 50% of SKUs · 5% of portfolio revenue): Lower-revenue generics, established biologics, commoditised products. Primary candidates for working capital release (95% service).

All SKUs have: monthly demand[12], planned supply[12], MEIO safety stock target, current safety stock, lead time, demand CV, service target, unit revenue/cost/margin, holding cost %.

SHORTFALL MANAGEMENT PLAN (Agent-Managed Drawdown)
The tool shows a time-phased SS schedule during shortfall — Class C is used as a shock absorber (SS stepped down to 55%) while Class A/B is protected at 100% of MEIO target. This is the "controlled descent" vs "cliff edge" approach.
Pre-build phase (Jan–Feb): Class A/B at 110%, Class C at 100%.
Shortfall (Mar–May): Class A/B at 100%, Class C stepped from 75% → 55%.
Demand spike (Jun–Aug): Class A/B at 105%, Class C rebuilding.
Normalising (Sep–Dec): All classes returning to standard MEIO target.

RESPONSE STYLE
Be direct, quantitative, and practical. Cite specific numbers from the portfolio data. Use supply chain terminology naturally (DoS = Days of Supply, SS = Safety Stock, MEIO = Multi-Echelon Inventory Optimisation, CMO = Contract Manufacturing Organisation, WC = Working Capital, CV = Coefficient of Variation, IBP = Integrated Business Planning). When answering, connect to what the user can see or do in the tool. Keep answers concise — 2–4 sentences for simple questions, 5–8 for complex ones. Do not use markdown headers. You may use bullet points for lists.`;
}

// Suggested starter questions
const SUGGESTIONS = [
  'Which SKUs need immediate action?',
  'How does the agent manage the capacity shortfall?',
  'Where can I safely reduce safety stock?',
  'Explain the "Where to Play" matrix',
  'What margin is at risk if I do nothing?',
  'How does the SS multiplier affect risk?',
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold
        ${isUser ? 'bg-brand' : 'bg-ink'}`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
        ${isUser
          ? 'bg-brand text-white rounded-tr-sm'
          : 'bg-surface border border-border-light text-ink rounded-tl-sm'
        }`}>
        {msg.content}
        {msg.streaming && (
          <span className="inline-block w-1.5 h-4 bg-current opacity-60 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

export default function ChatBot({ skus, scenario, ssMultiplier }) {
  const [open, setOpen]         = useState(false);
  const [minimised, setMin]     = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm your supply chain planning assistant. I have full visibility of the current ${scenario} scenario — ${(runSimulation(skus, scenario, ssMultiplier), getPortfolioSummary(runSimulation(skus, scenario, ssMultiplier))).skusAtRisk} SKUs are at risk. Ask me anything about the portfolio, inventory targets, or what actions to take.`,
    }
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const abortRef  = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Re-seed greeting when scenario changes
  useEffect(() => {
    const summary = getPortfolioSummary(runSimulation(skus, scenario, ssMultiplier));
    setMessages([{
      role: 'assistant',
      content: `Hi! I'm your supply chain planning assistant. I have full visibility of the current ${scenario} scenario — ${summary.skusAtRisk} of ${skus.length} SKUs are at risk, with ${summary.avgFulfillmentRate.toFixed(1)}% average fulfillment. Ask me anything about the portfolio, inventory targets, or what actions to take.`,
    }]);
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, ssMultiplier]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && !minimised) inputRef.current?.focus();
  }, [open, minimised]);

  async function send(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');
    setError('');

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    // Add streaming assistant placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    abortRef.current = new AbortController();
    const systemPrompt = buildSystemPrompt(skus, scenario, ssMultiplier);

    // Build API messages (omit streaming flag)
    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      await callClaudeChat(apiMessages, systemPrompt, chunk => {
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
          }
          return copy;
        });
      }, abortRef.current.signal);

      // Remove streaming flag when done
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last.streaming) copy[copy.length - 1] = { ...last, streaming: false };
        return copy;
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Could not reach Claude API — check your API key.');
        setMessages(prev => prev.filter((_, i) => i !== prev.length - 1));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const unread = !open && messages.length > 1;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => { setOpen(true); setMin(false); }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-brand text-white shadow-xl flex items-center justify-center hover:bg-brand-800 transition-all"
        style={{ display: open && !minimised ? 'none' : 'flex' }}
        title="Open supply chain assistant"
      >
        <MessageCircle className="w-6 h-6" />
        {unread && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-danger rounded-full border-2 border-white text-white text-[9px] font-bold flex items-center justify-center">
            {messages.filter(m => m.role === 'assistant').length - 1}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-border-light bg-white overflow-hidden"
          style={{ width: 400, height: minimised ? 56 : 580, transition: 'height 0.2s ease' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-ink text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-none">Supply Chain Assistant</div>
              <div className="text-xs text-slate-400 mt-0.5 capitalize">
                {scenario} · {typeof ssMultiplier === 'object' ? `A:${ssMultiplier.A ?? ssMultiplier[1] ?? 1}× B:${ssMultiplier.B ?? ssMultiplier[2] ?? 1}×` : `${ssMultiplier}×`} SS · {loading ? 'Typing...' : 'Online'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMin(m => !m)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                {minimised ? <ChevronDown className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimised && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((msg, i) => <Message key={i} msg={msg} />)}

                {/* Suggestion chips — only show after greeting */}
                {messages.length === 1 && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted font-medium">Try asking:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map(s => (
                        <button key={s} onClick={() => send(s)}
                          className="text-xs px-2.5 py-1.5 rounded-full border border-border-mid text-muted hover:border-brand hover:text-brand hover:bg-brand-50 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-xs text-danger bg-danger-50 border border-red-200 rounded-xl px-3 py-2">
                    {error}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-border-light px-3 py-3 bg-white">
                <div className="flex items-end gap-2 bg-surface border border-border-mid rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask about inventory, risk, decisions…"
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-ink placeholder-faint resize-none outline-none leading-snug"
                    style={{ maxHeight: 80 }}
                    disabled={loading}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading}
                    className="shrink-0 w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-800 transition-colors"
                  >
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-xs text-faint mt-1.5 text-center">Enter to send · Shift+Enter for new line</div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
