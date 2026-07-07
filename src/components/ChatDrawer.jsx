import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Minimize2 } from 'lucide-react';
import { SKU_DATA } from '../data/mockData';
import { callClaude } from '../api/claude';

// Snapshot of current inventory state injected into every Claude call
function buildContextSnapshot() {
  const critical = SKU_DATA.filter(s => s.status === 'CRITICAL_OOS');
  const excess = SKU_DATA.filter(s => s.status === 'EXCESS');
  const atRisk = SKU_DATA.filter(s => s.status === 'AT_RISK');
  const healthy = SKU_DATA.filter(s => s.status === 'HEALTHY');
  const totalPnL = SKU_DATA.reduce((a, s) => a + s.pnlImpact, 0);

  return `You are the MEIO Agent Cockpit assistant — an expert in multi-echelon inventory optimisation for biopharma supply chains. You specialise in biologics: Drug Substance (DS) manufacturing, Fill-Finish (F&F), cold chain distribution, batch release, shelf life risk, and patient supply continuity. You use biopharma terminology naturally: DoS (days of supply), CMO, GxP, batch release, upstream/downstream, cold chain, fractionation, vein-to-vein. You have full visibility into the current network state and answer questions based on the live data below.

CURRENT NETWORK SNAPSHOT:
- Total SKUs monitored: ${SKU_DATA.length}
- Critical OOS Risk (${critical.length}): ${critical.map(s => `${s.id} (${s.name}, DOH ${s.currentDOH}/${s.targetDOH}d, SL ${s.currentServiceLevel}%)`).join('; ')}
- Excess Stock (${excess.length}): ${excess.map(s => `${s.id} (${s.name}, DOH ${s.currentDOH}/${s.targetDOH}d)`).join('; ')}
- At Risk (${atRisk.length}): ${atRisk.map(s => `${s.id} (${s.name})`).join('; ')}
- Healthy (${healthy.length}): ${healthy.map(s => s.id).join(', ')}
- Total network P&L impact: ${totalPnL > 0 ? '+' : ''}$${(Math.abs(totalPnL) / 1000000).toFixed(2)}M

FULL SKU DETAIL:
${SKU_DATA.map(s =>
  `${s.id} | ${s.name} | ${s.category} | ${s.echelon} @ ${s.location} | Status: ${s.status} | DOH: ${s.currentDOH}/${s.targetDOH}d | SL: ${s.currentServiceLevel}%/${s.targetServiceLevel}% | SS: ${s.currentSafetyStock}→${s.recommendedSafetyStock} units | LT: ${s.leadTime}d | CV: ${(s.demandCV*100).toFixed(0)}% | ABC: ${s.abcClass} | P&L: ${s.pnlImpact > 0 ? '+' : ''}$${(s.pnlImpact/1000).toFixed(0)}K`
).join('\n')}

Answer questions about inventory status, exceptions, safety stock recommendations, service levels, and supply chain decisions. Be concise and quantitative. Use plain prose — no markdown headers or bullet lists with dashes. You may use numbered lists when listing multiple items.`;
}

const CANNED_RESPONSES = [
  "Which biologics are at risk of patient stockout?",
  "What's the total P&L at risk across the network?",
  "Explain the batch release delay on BIO-A100",
  "Which cold chain SKUs have shelf life risk?",
  "How does CAR-T supply differ from standard biologics?",
  "Compare Cold Chain DC East vs DC Central",
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? 'bg-blue-600' : 'bg-bcg-green/20 border border-bcg-green/30'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-bcg-green" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : 'bg-slate-border/40 text-slate-200 rounded-tl-sm'
      }`}>
        {msg.text}
        {msg.streaming && (
          <span className="inline-block w-1 h-4 bg-bcg-green ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! I\'m your MEIO-GPT biopharma assistant. I have full visibility across your biologics network — 12 SKUs spanning Drug Substance, Fill-Finish, and Cold Chain Distribution. Ask me anything about DoS positions, batch release delays, shelf life risks, cold chain compliance, or patient supply continuity.',
      streaming: false,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const systemPrompt = useRef(buildContextSnapshot());

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg = { id: Date.now().toString(), role: 'user', text: userText, streaming: false };
    const replyId = (Date.now() + 1).toString();
    const replyMsg = { id: replyId, role: 'assistant', text: '', streaming: true };

    setMessages(prev => [...prev, userMsg, replyMsg]);
    setLoading(true);

    abortRef.current = new AbortController();

    try {
      // Build conversation history for Claude (last 8 messages for context)
      const history = [...messages.slice(-8), userMsg].map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const response = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: systemPrompt.current,
          messages: history,
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`API ${response.status}`);

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
              setMessages(prev => prev.map(m =>
                m.id === replyId ? { ...m, text: m.text + parsed.delta.text } : m
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === replyId
            ? { ...m, text: 'Unable to reach the AI — check your API key configuration. In the meantime, try the Agent Feed on the MEIO Cockpit tab for pre-loaded analysis.' }
            : m
        ));
      }
    } finally {
      setMessages(prev => prev.map(m => m.id === replyId ? { ...m, streaming: false } : m));
      setLoading(false);
      if (!open) setUnread(u => u + 1);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full bg-bcg-green hover:bg-green-500 text-white shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52 }}
        title="Open MEIO Assistant"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Drawer */}
      <div
        className={`fixed bottom-0 right-0 z-40 flex flex-col transition-all duration-300 ease-in-out ${
          open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
        style={{ width: 380, height: 560, bottom: 72, right: 16 }}
      >
        <div className="flex flex-col h-full bg-navy border border-slate-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-border bg-slate-card shrink-0">
            <div className="w-7 h-7 rounded-full bg-bcg-green/20 border border-bcg-green/30 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-bcg-green" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">MEIO Assistant</div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-bcg-green animate-pulse" />
                Biologics network · {SKU_DATA.length} SKUs · Cold chain aware
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => <Message key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Canned questions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 shrink-0">
              <div className="text-xs text-slate-500 mb-2">Try asking:</div>
              <div className="flex flex-wrap gap-1.5">
                {CANNED_RESPONSES.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-border text-slate-400 hover:border-bcg-green/40 hover:text-white transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 shrink-0">
            <div className="flex gap-2 items-end bg-slate-card border border-slate-border rounded-xl px-3 py-2 focus-within:border-bcg-green/50 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your inventory…"
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 resize-none outline-none disabled:opacity-50"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-lg bg-bcg-green disabled:bg-slate-border flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div className="text-xs text-slate-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      </div>
    </>
  );
}
