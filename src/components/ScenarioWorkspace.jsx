import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Edit2, Check, X, Loader2 } from 'lucide-react';
import { callClaudeChat } from '../api/claude';
import { computeABCClass } from '../data/skuData';

/* ─────────────────────────────────────────────────────────────────────────────
   EXPORTED KPI HELPERS — ScenarioLibrary depends on these; do not remove.
───────────────────────────────────────────────────────────────────────────── */

function cleanNum(value, fallback) {
  if (value == null) return fallback;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? fallback : n;
}

export function computeVariantKPIs(skus, ssMult = 1.0) {
  if (!skus?.length) return null;
  const enriched = computeABCClass(skus);

  let totalInvValue = 0, totalAnnualDemandValue = 0;
  let invWeightedSSWeeks = 0, totalInvWeight = 0;
  const atRiskSkus = [];

  for (const sku of enriched) {
    const avgMonthlyDemand = sku.monthlyDemand.reduce((a, b) => a + b, 0) / 12;
    const avgWeeklyDemand  = avgMonthlyDemand * 12 / 52;
    const targetSS         = sku.meioSafetyStock * ssMult;
    const invValue         = targetSS * sku.unitCost;
    const ssWeeks          = avgWeeklyDemand > 0 ? targetSS / avgWeeklyDemand : 0;

    totalInvValue          += invValue;
    totalAnnualDemandValue += avgMonthlyDemand * 12 * sku.unitCost;
    invWeightedSSWeeks     += ssWeeks * invValue;
    totalInvWeight         += invValue;

    if (sku.onHand < targetSS) atRiskSkus.push(sku);
  }

  const baseSSWeeks     = totalInvWeight > 0 ? invWeightedSSWeeks / totalInvWeight : 0;
  const inventoryValueM = totalInvValue / 1e6;
  const wcExposureM     = inventoryValueM * 0.27;
  const turns           = totalInvValue > 0 ? totalAnnualDemandValue / totalInvValue : 0;
  const weeksOnHand     = baseSSWeeks + 2.2;

  const riskByClass = { A: 0, B: 0, C: 0 };
  atRiskSkus.forEach(s => { riskByClass[s.abcClass] = (riskByClass[s.abcClass] ?? 0) + 1; });

  // Projected service level: anchored to 97.0% at baseline SS (6.2 wks avg).
  // +0.3pp per additional week of SS coverage above reference; −0.3pp per week below.
  const slAdj          = (baseSSWeeks - 6.2) * 0.3;
  const serviceLevelPct = Math.min(99.5, Math.max(85, 97.0 + slAdj));

  return {
    inventoryValue: '$' + inventoryValueM.toFixed(1) + 'M',
    wcExposure:     '$' + wcExposureM.toFixed(1) + 'M',
    inventoryTurns: turns.toFixed(1) + 'x',
    stockoutRisk:   atRiskSkus.length + ' SKUs',
    serviceLevel:   serviceLevelPct.toFixed(1) + '%',
    weeksOnHand:    weeksOnHand.toFixed(1) + ' wks',
    _invValueM: inventoryValueM, _turns: turns, _weeksOnHand: weeksOnHand,
    _baseSSWeeks: baseSSWeeks, _riskByClass: riskByClass, _totalSkus: skus.length,
  };
}

export function computeScenarioKPIs(skus, params = {}) {
  if (!skus?.length) return null;
  const enriched  = computeABCClass(skus);
  const ss        = cleanNum(params.safetyStockWeeks, null);
  const dem       = cleanNum(params.demandAdjPct,     0);
  const lt        = cleanNum(params.leadTimeAdjWeeks, 0);
  const wcCapRaw  = params.wcCapM != null ? cleanNum(params.wcCapM, undefined) : undefined;
  const baseline  = computeVariantKPIs(skus, 1.0);
  const baseSSWks = baseline._baseSSWeeks;
  const ssMult    = ss != null ? ss / baseSSWks : 1.0;
  const demFactor = Math.max(0.5, 1 + dem / 100);
  const ltFactor  = 1 + Math.max(0, lt) / 20;
  const rawInvM   = baseline._invValueM * ssMult * demFactor * ltFactor;
  const wcUncon   = rawInvM * 0.27;
  const wcCap     = wcCapRaw != null ? wcCapRaw : undefined;
  const wcUsed    = wcCap != null ? Math.min(wcCap, wcUncon) : wcUncon;
  const wcCon     = wcCap != null && wcCap < wcUncon;
  const rawTurns  = (baseline._turns * demFactor) / (ssMult * ltFactor);
  const rawWoH    = (baseSSWks * ssMult / demFactor) + 2.2;
  let skusAtRisk  = 0;
  const riskByClass = { A: 0, B: 0, C: 0 };
  for (const sku of enriched) {
    const adjTarget = sku.meioSafetyStock * ssMult * (1 + Math.max(0, lt) / (sku.leadTimeWeeks * 4));
    const effTarget = wcCon ? adjTarget * (wcUsed / wcUncon) : adjTarget;
    if (sku.onHand < effTarget) { skusAtRisk++; riskByClass[sku.abcClass] = (riskByClass[sku.abcClass] ?? 0) + 1; }
  }
  const scenSSWks      = rawWoH - 2.2; // strip cycle stock to get SS weeks
  const slAdj          = (scenSSWks - 6.2) * 0.3;
  const serviceLevelPct = Math.min(99.5, Math.max(85, 97.0 + slAdj));

  return {
    inventoryValue: '$' + rawInvM.toFixed(1) + 'M',
    wcExposure:     '$' + wcUsed.toFixed(1) + 'M',
    inventoryTurns: rawTurns.toFixed(1) + 'x',
    stockoutRisk:   skusAtRisk + ' SKUs',
    serviceLevel:   serviceLevelPct.toFixed(1) + '%',
    weeksOnHand:    rawWoH.toFixed(1) + ' wks',
    _riskByClass:   riskByClass, _totalSkus: skus.length,
  };
}

export const mockKPIs = computeScenarioKPIs;

/* ─────────────────────────────────────────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a supply chain planning agent specializing in multi-echelon inventory optimization (MEIO) for biopharma networks. Your role is to help planners respond to supply chain disruptions and capacity constraints.

When a user describes a situation, always:
1. Confirm your understanding of the situation briefly
2. Give a direct recommendation — do not ask the user what to optimize or what trade-offs they are willing to accept before giving your view
3. Show trade-offs across affected products, including safety stock impact, service level with policy bounds, and net working capital effect
4. Offer two alternative approaches (one more conservative, one more aggressive)

Format every recommendation response using this exact structure:

SITUATION
[1–2 sentences confirming what you understood. Reference the specific product, node, or constraint mentioned.]

RECOMMENDED COURSE OF ACTION
[2–3 sentences. Direct and specific. Reference the policy change, the trade-off being accepted, and the expected outcome.]

TRADE-OFFS

[Product or affected item name]
  Safety stock impact:    [from X to Y, change in weeks]
  Service level risk:     [X% → Y% — whether within or outside policy floor]
  Stockout risk change:   [+/– Xpp]
  Status:                 [Within / Outside policy bounds]

[Second product if applicable — always show cross-product trade-offs]
  Demand fulfillment:     [+X% of forecast covered]
  Inventory required:     [+$XM]
  Coverage period:        [X weeks]
  Status:                 [Fully covered / Partially covered / At risk]

Net working capital impact:   [+/– $XM (net release / net increase)]
Risk summary: [One sentence summarizing the overall risk posture]

ALTERNATIVE APPROACHES
1. Conservative — [One sentence. More cautious than the recommendation.]
2. Aggressive — [One sentence. More aggressive than the recommendation. Include the policy bound consequence if it breaches it.]

Key principles:
- Always recommend first — never ask the user what they want to optimize before giving your view
- Always reference Class A/B/C service floors when assessing service level risk
- Always show net working capital impact
- Always show whether each product stays within or outside its policy floor
- Be concise. Use supply chain terminology naturally. No padding.
- For follow-up questions, pushback, or "what if" variants — maintain full context from the conversation and update the trade-off analysis as needed. You do not need to repeat the full structured format for short follow-up answers, but always be quantitative.`;

/* ─────────────────────────────────────────────────────────────────────────────
   MESSAGE RENDERER
───────────────────────────────────────────────────────────────────────────── */

const SECTION_HEADERS = new Set([
  'SITUATION',
  'RECOMMENDED COURSE OF ACTION',
  'TRADE-OFFS',
  'ALTERNATIVE APPROACHES',
]);

const HEADER_COLORS = {
  'SITUATION':                    { bg: '#F8FAFC', border: '#CBD5E1', label: '#475569' },
  'RECOMMENDED COURSE OF ACTION': { bg: '#F0FDF4', border: '#86EFAC', label: '#15803D' },
  'TRADE-OFFS':                   { bg: '#EFF6FF', border: '#BFDBFE', label: '#1D4ED8' },
  'ALTERNATIVE APPROACHES':       { bg: '#FFFBEB', border: '#FCD34D', label: '#B45309' },
};

function renderAgentContent(content, isStreaming) {
  const lines = content.split('\n');
  const elements = [];
  let currentSection = null;
  let currentSectionLines = [];

  function flushSection() {
    if (!currentSection) return;
    const colors = HEADER_COLORS[currentSection] ?? { bg: '#F8FAFC', border: '#E2E8F0', label: '#64748B' };
    elements.push(
      <div key={`sec-${elements.length}`} style={{
        background: colors.bg, border: `1px solid ${colors.border}`,
        borderRadius: 10, padding: '10px 14px', marginTop: 8,
      }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: colors.label, textTransform: 'uppercase', marginBottom: 6 }}>
          {currentSection}
        </div>
        {renderSectionLines(currentSectionLines, currentSection)}
      </div>
    );
    currentSection = null;
    currentSectionLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADERS.has(trimmed)) {
      flushSection();
      currentSection = trimmed;
    } else if (currentSection) {
      currentSectionLines.push(line);
    } else {
      // Pre-section content (should be rare)
      if (trimmed) elements.push(
        <p key={`pre-${elements.length}`} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: '2px 0' }}>{trimmed}</p>
      );
    }
  }
  flushSection();

  if (isStreaming) {
    elements.push(
      <span key="cursor" style={{ display: 'inline-block', width: 6, height: 14, background: '#6366F1', borderRadius: 2, animation: 'pulse 1s infinite', verticalAlign: 'middle', marginLeft: 3 }} />
    );
  }

  return elements;
}

function renderSectionLines(lines, section) {
  if (section === 'ALTERNATIVE APPROACHES') {
    return lines
      .filter(l => l.trim())
      .map((l, i) => {
        const isNumbered = /^\d+\./.test(l.trim());
        return (
          <div key={i} style={{ display: 'flex', gap: 8, marginTop: i > 0 ? 6 : 0 }}>
            {isNumbered && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', flexShrink: 0, marginTop: 1 }}>
                {l.trim().match(/^(\d+)\./)?.[1]}.
              </span>
            )}
            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>
              {isNumbered ? l.trim().replace(/^\d+\.\s*/, '') : l.trim()}
            </p>
          </div>
        );
      });
  }

  if (section === 'TRADE-OFFS') {
    const elements = [];
    let productBlock = null;
    let productLines = [];

    function flushProduct() {
      if (!productBlock) return;
      elements.push(
        <div key={`prod-${elements.length}`} style={{
          background: '#fff', border: '1px solid #BFDBFE', borderRadius: 8,
          padding: '8px 12px', marginTop: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF', marginBottom: 4 }}>{productBlock}</div>
          {productLines.map((pl, i) => {
            const colonIdx = pl.indexOf(':');
            if (colonIdx > -1 && colonIdx < 35) {
              const key = pl.slice(0, colonIdx).trim();
              const val = pl.slice(colonIdx + 1).trim();
              const isStatus = key === 'Status';
              const statusGood = val.toLowerCase().includes('within') || val.toLowerCase().includes('fully');
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#64748B', flexShrink: 0 }}>{key}</span>
                  <span style={{
                    fontSize: 10, fontWeight: isStatus ? 700 : 500,
                    color: isStatus ? (statusGood ? '#15803D' : '#B91C1C') : '#1E293B',
                    textAlign: 'right',
                  }}>{val}</span>
                </div>
              );
            }
            return pl.trim() ? (
              <p key={i} style={{ fontSize: 11, color: '#374151', margin: '2px 0' }}>{pl.trim()}</p>
            ) : null;
          })}
        </div>
      );
      productBlock = null;
      productLines = [];
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect "Net working capital" or "Risk summary" — they're footer lines
      if (trimmed.startsWith('Net working capital') || trimmed.startsWith('Risk summary')) {
        flushProduct();
        const colonIdx = trimmed.indexOf(':');
        const key = colonIdx > -1 ? trimmed.slice(0, colonIdx).trim() : trimmed;
        const val = colonIdx > -1 ? trimmed.slice(colonIdx + 1).trim() : '';
        elements.push(
          <div key={`footer-${elements.length}`} style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid #BFDBFE',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8' }}>{key}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>{val}</span>
          </div>
        );
        continue;
      }

      // Detect product header — line that isn't indented and doesn't have a colon near start
      const isProductHeader = !line.startsWith(' ') && !line.startsWith('\t') &&
        (trimmed.startsWith('Product ') || (!trimmed.includes(':') && trimmed.length < 40));

      if (isProductHeader) {
        flushProduct();
        productBlock = trimmed;
      } else if (productBlock !== null) {
        productLines.push(line);
      } else {
        if (trimmed) elements.push(
          <p key={`misc-${elements.length}`} style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: '2px 0' }}>{trimmed}</p>
        );
      }
    }
    flushProduct();
    return elements;
  }

  // Default: plain text
  return lines
    .filter(l => l.trim())
    .map((l, i) => (
      <p key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, margin: '2px 0' }}>{l.trim()}</p>
    ));
}

function AgentMessage({ content, isStreaming }) {
  const isStructured = SECTION_HEADERS.has(
    (content.split('\n').find(l => SECTION_HEADERS.has(l.trim())) ?? '').trim()
  );

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#7C3AED)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
      }}>
        <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>AI</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {isStructured
          ? <div>{renderAgentContent(content, isStreaming)}</div>
          : (
            <div style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '10px 14px',
            }}>
              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
                {content}
              </p>
              {isStreaming && (
                <span style={{ display: 'inline-block', width: 6, height: 14, background: '#6366F1', borderRadius: 2, verticalAlign: 'middle', marginLeft: 3 }} />
              )}
            </div>
          )
        }
      </div>
    </div>
  );
}

function UserMessage({ content }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: '#4F46E5', borderRadius: 12, padding: '10px 14px',
        maxWidth: '75%',
      }}>
        <p style={{ fontSize: 12, color: '#fff', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{content}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────
   KPI EXTRACTION PROMPT
   Sent as a final user turn at save time. Claude returns JSON only.
───────────────────────────────────────────────────────────────────────────── */
const KPI_EXTRACTION_PROMPT = `Based on the supply chain scenario conversation above, estimate the portfolio-level KPI impact if the recommended course of action is implemented.

Return ONLY valid JSON — no markdown, no explanation, just the JSON object:
{
  "inventoryValue": "$XXX.XM",
  "wcExposure": "$XX.XM",
  "stockoutRisk": "X SKUs",
  "serviceLevel": "XX.X%"
}

Rules:
- inventoryValue: total portfolio inventory value post-recommendation (reference baseline: $122.3M)
- wcExposure: working capital tied up in inventory post-recommendation (reference baseline: $33.0M; typically ~27% of inventory value)
- stockoutRisk: number of SKUs at elevated stockout risk after the recommendation is applied (reference baseline: 0 SKUs)
- serviceLevel: projected portfolio fill rate post-recommendation (reference baseline: 97.0%)
- Use the specific numbers from the TRADE-OFFS section to calculate realistic deltas from the baseline
- If the conversation shows no completed recommendation yet, return baseline values`;

export default function ScenarioWorkspace({ scenario, onSave, onBack, onUpdate }) {
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);  // KPI extraction in progress
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]   = useState(scenario.name);
  const [saved, setSaved]           = useState(scenario.status === 'active' || scenario.status === 'applied');
  const messagesRef                 = useRef(null);
  const abortRef                    = useRef(null);
  const textareaRef                 = useRef(null);

  const chatHistory = scenario.chatHistory ?? [];

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [chatHistory.length, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    textareaRef.current?.focus();

    const userMsg    = { role: 'user', content: text };
    const newHistory = [...chatHistory, userMsg];
    onUpdate({ chatHistory: newHistory });

    // Build API messages — role must alternate user/assistant
    const apiMessages = newHistory.map(m => ({ role: m.role, content: m.content }));

    setLoading(true);
    let assistantContent = '';

    // Add placeholder streaming message
    onUpdate({ chatHistory: [...newHistory, { role: 'assistant', content: '' }] });

    try {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      await callClaudeChat(
        apiMessages,
        SYSTEM_PROMPT,
        (chunk) => {
          assistantContent += chunk;
          onUpdate({ chatHistory: [...newHistory, { role: 'assistant', content: assistantContent }] });
        },
        controller.signal
      );
    } catch (e) {
      if (e.name !== 'AbortError') {
        onUpdate({ chatHistory: [...newHistory, { role: 'assistant', content: 'Something went wrong — please try again.' }] });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  async function handleSave() {
    if (saving) return;
    const firstUser = chatHistory.find(m => m.role === 'user');
    const desc = firstUser
      ? firstUser.content.slice(0, 80) + (firstUser.content.length > 80 ? '…' : '')
      : '';

    // Attempt to extract KPIs from conversation via Claude
    let kpis = null;
    const hasConversation = chatHistory.some(m => m.role === 'user');

    if (hasConversation) {
      setSaving(true);
      try {
        // Build the API messages: full chat history + extraction request as final user turn
        const apiMessages = [
          ...chatHistory.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: KPI_EXTRACTION_PROMPT },
        ];

        let raw = '';
        await callClaudeChat(apiMessages, SYSTEM_PROMPT, chunk => { raw += chunk; });

        // Extract JSON from response (strip any accidental markdown fences)
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          // Validate expected keys are present
          if (parsed.inventoryValue && parsed.wcExposure && parsed.stockoutRisk && parsed.serviceLevel) {
            kpis = parsed;
          }
        }
      } catch {
        // If extraction fails, save without KPIs — silently degrade
        kpis = null;
      } finally {
        setSaving(false);
      }
    }

    onSave(scenario.id, { name: draftName, description: desc, status: 'active', ...(kpis ? { kpis } : {}) });
    setSaved(true);
  }

  function confirmName() {
    setEditingName(false);
    onUpdate({ name: draftName });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: 480 }}>

      {/* ── Header ── */}
      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6366F1',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600,
        }}>
          <ArrowLeft size={14} /> Library
        </button>

        <div style={{ width: 1, height: 18, background: '#E2E8F0' }} />

        {/* Editable name */}
        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmName(); if (e.key === 'Escape') setEditingName(false); }}
              style={{
                fontSize: 13, fontWeight: 600, color: '#1E293B', border: 'none',
                borderBottom: '2px solid #6366F1', outline: 'none', background: 'transparent',
                flex: 1, padding: '2px 0',
              }}
            />
            <button onClick={confirmName} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803D' }}><Check size={15} /></button>
            <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={15} /></button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{draftName}</span>
            <button onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
              <Edit2 size={12} />
            </button>
          </div>
        )}

        {/* Save button */}
        <button onClick={handleSave} disabled={saving} style={{
          padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
          cursor: saving ? 'default' : 'pointer',
          background: saved ? '#F0FDF4' : saving ? '#EEF2FF' : '#4F46E5',
          color: saved ? '#15803D' : saving ? '#6366F1' : '#fff',
          border: saved ? '1px solid #86EFAC' : saving ? '1px solid #C7D2FE' : 'none',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}>
          {saving && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
          {saved ? '✓ Saved' : saving ? 'Analysing…' : 'Save'}
        </button>
      </div>

      {/* ── Chat area ── */}
      <div ref={messagesRef} style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
        padding: '4px 2px 12px',
      }}>
        {chatHistory.map((msg, i) => {
          const isLast     = i === chatHistory.length - 1;
          const isStreaming = isLast && loading && msg.role === 'assistant';
          return msg.role === 'assistant'
            ? <AgentMessage key={i} content={msg.content} isStreaming={isStreaming} />
            : <UserMessage key={i} content={msg.content} />;
        })}
        {loading && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>AI</span>
            </div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px' }}>
              <Loader2 size={14} className="animate-spin" style={{ color: '#6366F1' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8,
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the situation — a disruption, a capacity issue, a demand signal…"
          rows={2}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none', fontSize: 12,
            color: '#1E293B', lineHeight: 1.6, background: 'transparent',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            width: 34, height: 34, borderRadius: 8, border: 'none', cursor: !input.trim() || loading ? 'default' : 'pointer',
            background: !input.trim() || loading ? '#E2E8F0' : '#4F46E5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background .15s',
          }}
        >
          {loading
            ? <Loader2 size={14} style={{ color: '#94A3B8', animation: 'spin 1s linear infinite' }} />
            : <Send size={14} style={{ color: !input.trim() ? '#94A3B8' : '#fff' }} />
          }
        </button>
      </div>
      <p style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 6 }}>
        Press Enter to send · Shift+Enter for new line
      </p>

    </div>
  );
}
