import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, ArrowLeft, Edit2, Check, X, CheckCircle2, Loader2, CheckSquare,
} from 'lucide-react';
import { callClaudeChat } from '../api/claude';
import { computeABCClass } from '../data/skuData';

// ── Scenario type constants ───────────────────────────────────────────────────
export const SCENARIO_TYPES = [
  { id: 'yield-deviation', label: 'Manufacturing yield deviation', clause: 'Batch output below plan' },
  { id: 'supplier-delay',  label: 'Supplier raw material delay',   clause: 'Upstream input arriving late' },
  { id: 'quality-hold',    label: 'Quality hold / batch rejection', clause: 'Lot quarantined post-release' },
  { id: 'site-capacity',   label: 'Site capacity constraint',       clause: 'Line down or unplanned shutdown' },
  { id: 'tariff-change',   label: 'Tariff / trade policy change',   clause: 'New duty on raw material or finished goods' },
];

// ── KPI priority options (Step 2b) ────────────────────────────────────────────
const KPI_PRIORITIES = [
  { id: 'service-level',   label: 'Service Level'   },
  { id: 'inventory-cost',  label: 'Inventory Cost'  },
  { id: 'working-capital', label: 'Working Capital' },
  { id: 'stockout-risk',   label: 'Stockout Risk'   },
  { id: 'inventory-turns', label: 'Inventory Turns' },
];

// ── Signal helpers ────────────────────────────────────────────────────────────
function extractParams(text) {
  const m = text.match(/\[PARAMS:(\{[\s\S]*?\})\]/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
function isSavedSignal(text) { return text.includes('[SAVED]'); }
function stripSignals(text) {
  return text
    .replace(/\[PARAMS:\{[\s\S]*?\}?\]/g, '')
    .replace(/\[SAVED\]/g, '')
    .trim();
}

// ── Numeric coercion — strips units the AI may include ("96.8%", "8 wks", "$42M") ──
function cleanNum(value, fallback) {
  if (value == null) return fallback;
  const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? fallback : n;
}

// ── KPI Directional Logic Rules ───────────────────────────────────────────────
// These constraints govern how mockKPIs responds to parameter changes.
// ALL directions must be respected — magnitudes are approximate but signs are not.
//
// SS ↑  → invVal ↑, turns ↓, weeksOnHand ↑, stockoutRisk ↓, wcExposure ↑
// SS ↓  → invVal ↓, turns ↑, weeksOnHand ↓, stockoutRisk ↑, wcExposure ↓
// LT ↑  → invVal ↑, wcExposure ↑, stockoutRisk ↑ (unless SS also ↑)
// LT ↓  → invVal ↓, wcExposure ↓, stockoutRisk ↓
// dem ↑ → invVal ↑, weeksOnHand ↓, turns ↑, stockoutRisk ↑
// dem ↓ → invVal ↓, weeksOnHand ↑, turns ↓, stockoutRisk ↓
// sl  ↑ → fillRate ↑, stockoutRisk ↓
// sl  ↓ → fillRate ↓, stockoutRisk ↑
// wcCap ↓ (tighter) → stockoutRisk ↑, effective SL constrained ↓
//
// When opposing forces act (e.g. SS ↑ but wcCap ↓), net effect applies.
// Do not change this function in a way that violates the directions above.
export function mockKPIs(params = {}) {
  const ss  = cleanNum(params.safetyStockWeeks, 6.2);
  const sl  = cleanNum(params.serviceLevel,     96.8);
  const dem = cleanNum(params.demandAdjPct,     0);
  const lt  = cleanNum(params.leadTimeAdjWeeks, 0);
  const wcCapRaw = params.wcCapM != null ? cleanNum(params.wcCapM, undefined) : undefined;

  const invBase = 142.4; // baseline portfolio inventory value $M

  // Inventory value: scales with SS, demand volume, and lead-time buffer needed
  const invVal = invBase * (ss / 6.2) * (1 + dem / 100) * (1 + Math.max(0, lt) / 20);

  // Working capital: either capped at user limit or proportional to inventory value
  const wcUnconstrained = invVal * 0.27;
  const wcCap           = wcCapRaw != null ? wcCapRaw : undefined;
  const wcUsed          = wcCap != null ? Math.min(wcCap, wcUnconstrained) : wcUnconstrained;
  const wcConstrained   = wcCap != null && wcCap < wcUnconstrained;

  // Weeks on hand: cycle stock (2.2 wks) + SS, deflated by demand surge.
  // Higher demand → same inventory covers fewer weeks → weeksOnHand ↓, turns ↑ ✓
  const demandFactor = Math.max(0.5, 1 + dem / 100);
  const weeksOnHand  = (ss + 2.2) / demandFactor;

  // Inventory turns: 52 weeks ÷ weeks on hand ✓
  const turns = Math.round((52 / weeksOnHand) * 10) / 10;

  // Effective service level: slightly penalised when WC cap forces inventory cuts
  // Penalty proportional to the fraction of WC that must be cut (capped at −5 pp)
  const wcPenalty  = wcConstrained ? Math.min(5, ((wcUnconstrained - wcCap) / wcUnconstrained) * 15) : 0;
  const effectiveSL = Math.max(85, sl - wcPenalty);

  // Stockout risk (# SKUs at risk):
  //   Base from service level → modulated by SS vs baseline, LT, demand, WC constraint
  //   SS ↑ removes risk; LT ↑, dem ↑, wcConstrained each add risk ✓
  const slRisk    = effectiveSL >= 99 ? 2  : effectiveSL >= 97 ? 8  : effectiveSL >= 95 ? 16 : 24;
  const ssAdj     = -(ss - 6.2) * 0.5;          // extra SS week → ~0.5 fewer at-risk SKUs
  const ltAdj     = Math.max(0, lt) * 0.4;       // each extra LT week → ~0.4 more at-risk SKUs
  const demAdj    = Math.max(0, dem) / 8;        // 8% demand surge → ~1 more at-risk SKU
  const wcAdj     = wcConstrained ? ((wcUnconstrained - wcCap) / wcUnconstrained) * 10 : 0;
  const stockoutSkus = Math.round(Math.max(1, Math.min(30, slRisk + ssAdj + ltAdj + demAdj + wcAdj)));

  const fillRate = Math.min(99.5, effectiveSL - 2.2);

  return {
    inventoryValue: '$' + invVal.toFixed(1) + 'M',
    inventoryTurns: turns.toFixed(1) + 'x',
    serviceLevel:   effectiveSL.toFixed(1) + '%',
    ssWeeks:        ss.toFixed(1) + ' wks',
    weeksOnHand:    weeksOnHand.toFixed(1) + ' wks',
    stockoutRisk:   stockoutSkus + ' SKUs',
    wcExposure:     '$' + wcUsed.toFixed(1) + 'M',
    fillRate:       fillRate.toFixed(1) + '%',
  };
}

// ── Portfolio context for system prompt ───────────────────────────────────────
function buildPortfolioContext(skus) {
  if (!skus?.length) return '';
  const enriched = computeABCClass(skus);
  return enriched.map(s =>
    `  • ${s.id} | ${s.name} | ${s.category} | Class ${s.abcClass} | LT ${s.leadTimeWeeks}w | ${s.supplier}`
  ).join('\n');
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(skus, kpiPriority = null) {
  const kpiBlock = kpiPriority ? `

PLANNER'S CHOSEN KPI PRIORITY: ${kpiPriority}
Every RECOMMENDATION line must explain how the suggested value specifically improves ${kpiPriority}.
Every TRADEOFF line must name the exact KPI that worsens (e.g. "Working capital increases ~12%" — not "this may increase costs").
If the planner's value deviates >20% from your recommendation, add one flag line after your acknowledgment: "⚠ At this level, ${kpiPriority} is likely to move outside the target range."
` : '';

  return `You are a senior biopharma supply chain analyst. The planner has already selected a scenario type, affected products, and KPI priority via the UI. Your job is to ask MEIO parameter questions one at a time, then summarise and save.
${kpiBlock}
Portfolio context:
${buildPortfolioContext(skus)}

BEHAVIOR RULES:
- Ask ONE parameter per message — never bundle multiple questions.
- Use domain language: safety stock, service level, lead time, fill rate, CMO, echelon, MOQ.
- If the user says "use default" or "I don't know", apply a sensible baseline and state it.
- If the user says "skip" or "defaults for the rest", fill remaining with defaults and move to the summary.
- Reference specific SKU IDs and names from the portfolio when relevant.
- No filler phrases — no "Great choice!", no "That's a solid approach", no "Perfect".
- After the user responds, give a one-line acknowledgment only, then immediately ask the next parameter.

STEP 3 — PARAMETER QUESTIONS
Ask ONE parameter at a time. Use this EXACT format for every question — no exceptions, no preamble:

QUESTION
[One sentence ending with ?]

RECOMMENDATION
[Value first — then one sentence of reasoning for the chosen KPI]

TRADEOFF
[One sentence naming the specific KPI that moves unfavourably at this value]

PARAMETERS TO COVER (adapt to scenario type — not all may apply):
- Safety stock (weeks of supply, typical 4–12 weeks)
- Service level target (%) — default: 99.5% Class A, 98% B, 95% C
- Lead time adjustment (weeks added to baseline)
- Demand adjustment (% shift to forecast)
- Working capital cap ($M) — optional ceiling
- Reorder point — keep model-optimized or override?
- Review period — keep monthly or change?

STEP 4 — SUMMARY
Once all parameters are gathered, present a markdown table:

| Parameter | Value | vs. Baseline |
|---|---|---|
| Safety Stock | 8 weeks | +3 weeks |
| Service Level | 97.5% | No change |
| Lead Time Adj. | +10 weeks | New |
| Demand Adj. | No change | — |
| WC Cap | $42M | –10% |

Then output on its own line:
[PARAMS:{"safetyStockWeeks":8,"serviceLevel":97.5,"wcCapM":42,"leadTimeAdjWeeks":10,"demandAdjPct":0,"affectedSkus":"A-001, A-003","reviewPeriod":"monthly","reorderOverride":false}]

Then ask: "Does this look right? Say 'looks good' to save, or tell me what to change."

STEP 5 — SAVE
When the user confirms, output on its own line:
[SAVED]

Then 2 sentences: what this scenario tests and what to look for in the comparison table.

CRITICAL: [PARAMS:{...}] and [SAVED] must be on their own lines. Never embed them in prose.`;
}

// ── Structured message parsing ────────────────────────────────────────────────
// Detects the QUESTION / RECOMMENDATION / TRADEOFF block the AI emits in Step 3.
function parseStructuredParam(text) {
  const qMatch = text.match(/QUESTION\s*\n([\s\S]*?)(?=\nRECOMMENDATION\b)/i);
  const rMatch = text.match(/RECOMMENDATION\s*\n([\s\S]*?)(?=\nTRADEOFF\b)/i);
  const tMatch = text.match(/TRADEOFF\s*\n([\s\S]*?)(?:\n\n|$)/i);
  if (!qMatch || !rMatch || !tMatch) return null;
  return {
    question:       qMatch[1].trim(),
    recommendation: rMatch[1].trim(),
    tradeoff:       tMatch[1].trim(),
  };
}

// Pull the recommended value out of the RECOMMENDATION line:
// "10 weeks — maximizes service level…" → "10 weeks"
function extractRecommendedValue(rec) {
  const m = rec.match(/^([^—–\n]+?)(?:\s*[—–]|$)/);
  return m ? m[1].trim() : rec.split('\n')[0].trim();
}

// Returns true if the user's value deviates >20% from the recommendation
function checkDeviation(userVal, recVal) {
  const u = parseFloat(String(userVal).replace(/[^0-9.\-]/g, ''));
  const r = parseFloat(String(recVal).replace(/[^0-9.\-]/g, ''));
  if (isNaN(u) || isNaN(r) || r === 0) return false;
  return Math.abs((u - r) / Math.abs(r)) > 0.20;
}

// ── Apply confirmation modal ──────────────────────────────────────────────────
function ApplyModal({ scenario, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
        <h3 className="text-base font-semibold text-slate-800 mb-2">Apply this scenario to the inventory plan?</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          The current inventory plan will remain unchanged. This action records the scenario parameters as the new operating target and logs the decision.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
          <p className="text-xs font-semibold text-slate-700">{scenario.name}</p>
          {scenario.params?.scenarioType && <p className="text-xs text-slate-400 mt-0.5">{scenario.params.scenarioType}</p>}
          {scenario.params?.affectedSkus  && <p className="text-xs text-slate-400 mt-0.5">Products: {scenario.params.affectedSkus}</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors">
            <CheckSquare size={14} /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Scenario type selector ────────────────────────────────────────────
function ScenarioTypeSelector({ onSelect }) {
  const [custom, setCustom] = useState('');

  function handleCustomSubmit() {
    const text = custom.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const inferred =
      SCENARIO_TYPES.find(t => lower.includes(t.id.replace(/-/g, ' '))) ||
      SCENARIO_TYPES.find(t => t.label.split(' ').some(w => w.length > 4 && lower.includes(w.toLowerCase()))) ||
      (lower.includes('yield') || lower.includes('batch')    ? SCENARIO_TYPES[0] : null) ||
      (lower.includes('supplier') || lower.includes('delay') ? SCENARIO_TYPES[1] : null) ||
      (lower.includes('quality') || lower.includes('hold')   ? SCENARIO_TYPES[2] : null) ||
      (lower.includes('capacity') || lower.includes('site')  ? SCENARIO_TYPES[3] : null) ||
      (lower.includes('tariff') || lower.includes('trade')   ? SCENARIO_TYPES[4] : null) ||
      null;
    onSelect(inferred ?? { id: 'custom', label: text, clause: 'Custom scenario' }, text);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 leading-relaxed">Select a disruption type to model against your baseline MEIO plan.</p>
      <div className="flex flex-col gap-2">
        {SCENARIO_TYPES.map((type, i) => (
          <button
            key={type.id}
            onClick={() => onSelect(type, null)}
            className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
          >
            <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0 mt-0.5 group-hover:text-teal-500">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-700 group-hover:text-teal-700 leading-tight">{type.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{type.clause}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center mt-1">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
          placeholder="Or describe your own situation"
          className="flex-1 text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 placeholder-slate-300 transition"
        />
        <button
          onClick={handleCustomSubmit}
          disabled={!custom.trim()}
          className="px-3 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-30 text-white transition-colors shrink-0"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Product selector ──────────────────────────────────────────────────
function ProductSelector({ skus, onConfirm }) {
  const enriched  = computeABCClass(skus);
  const classById = Object.fromEntries(enriched.map(s => [s.id, s.abcClass]));
  const [selected, setSelected]     = useState(new Set());
  const [allSelected, setAllSelected] = useState(false);

  const classes = ['A', 'B', 'C'];
  const byClass = Object.fromEntries(classes.map(c => [c, enriched.filter(s => s.abcClass === c)]));

  function toggleAll() {
    if (allSelected) { setSelected(new Set()); setAllSelected(false); }
    else             { setSelected(new Set(skus.map(s => s.id))); setAllSelected(true); }
  }
  function toggleSku(id) {
    setAllSelected(false);
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleClass(cls) {
    setAllSelected(false);
    const ids = byClass[cls].map(s => s.id);
    const allOn = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      ids.forEach(id => allOn ? n.delete(id) : n.add(id));
      return n;
    });
  }
  function confirm() {
    const count = allSelected ? skus.length : selected.size;
    if (count === 0) return;
    if (allSelected) {
      onConfirm('All products', skus.map(s => s.id));
    } else {
      const names = [...selected].map(id => {
        const sku = skus.find(s => s.id === id);
        return `${id} (${sku?.name ?? id}, Class ${classById[id] ?? '?'})`;
      });
      onConfirm(names.join(', '), [...selected]);
    }
  }

  const classBadge = { A: 'bg-teal-100 text-teal-700', B: 'bg-indigo-100 text-indigo-700', C: 'bg-slate-100 text-slate-600' };
  const count = allSelected ? skus.length : selected.size;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <label className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-teal-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-700">All products</span>
        <span className="text-[10px] text-slate-400 ml-auto">{skus.length} SKUs</span>
      </label>
      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {classes.map(cls => {
          const group = byClass[cls];
          if (!group.length) return null;
          const allClassOn = !allSelected && group.every(s => selected.has(s.id));
          return (
            <div key={cls}>
              <button onClick={() => toggleClass(cls)} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 text-left">
                <input type="checkbox" readOnly checked={allSelected || allClassOn} className="w-3.5 h-3.5 accent-teal-600 pointer-events-none" />
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${classBadge[cls]}`}>Class {cls}</span>
                <span className="text-[11px] text-slate-400 ml-auto">{group.length}</span>
              </button>
              {group.map(sku => (
                <label key={sku.id} className="flex items-center gap-3 px-6 py-1.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected || selected.has(sku.id)}
                    onChange={() => !allSelected && toggleSku(sku.id)}
                    className="w-3.5 h-3.5 accent-teal-600 shrink-0"
                  />
                  <span className="text-[10px] text-slate-400 font-mono w-12 shrink-0">{sku.id}</span>
                  <span className="text-xs font-medium text-slate-700 flex-1 truncate">{sku.name}</span>
                  <span className="text-[10px] text-slate-400">{sku.leadTimeWeeks}w LT</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
        <span className="text-xs text-slate-400">{count} of {skus.length} selected</span>
        <button
          onClick={confirm}
          disabled={count === 0}
          className="px-3 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          Confirm selection →
        </button>
      </div>
    </div>
  );
}

// ── Step 2b: KPI priority selector ────────────────────────────────────────────
function KPIPrioritySelector({ onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {KPI_PRIORITIES.map(kpi => (
        <button
          key={kpi.id}
          onClick={() => onSelect(kpi.label)}
          className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 text-slate-700 transition-all"
        >
          {kpi.label}
        </button>
      ))}
    </div>
  );
}

// ── Structured parameter card ─────────────────────────────────────────────────
// Renders the QUESTION / RECOMMENDATION / TRADEOFF block with action buttons.
// isResponded=true (a user message follows this one) → buttons hidden.
function StructuredParamMessage({ parsed, isResponded, onUseRecommended, onEnterOwn }) {
  const [showInput, setShowInput] = useState(false);
  const [ownValue,  setOwnValue]  = useState('');
  const recValue = extractRecommendedValue(parsed.recommendation);

  function submitOwn() {
    const v = ownValue.trim();
    if (!v) return;
    onEnterOwn(v, recValue);
    setShowInput(false);
    setOwnValue('');
  }

  return (
    <div className="space-y-2.5">
      {/* Question */}
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Question</p>
        <p className="text-sm text-slate-800 leading-snug">{parsed.question}</p>
      </div>

      {/* Recommendation */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl px-3 py-2.5">
        <p className="text-[9px] font-bold text-teal-500 uppercase tracking-widest mb-1">Recommendation</p>
        <p className="text-xs text-teal-800 leading-relaxed">{parsed.recommendation}</p>
      </div>

      {/* Tradeoff */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
        <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-1">Tradeoff</p>
        <p className="text-xs text-amber-800 leading-relaxed">{parsed.tradeoff}</p>
      </div>

      {/* Action buttons — hidden once the user has responded */}
      {!isResponded && (
        <>
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => onUseRecommended(recValue)}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors text-left truncate"
            >
              Use recommended: {recValue}
            </button>
            <button
              onClick={() => setShowInput(v => !v)}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Enter your own
            </button>
          </div>

          {showInput && (
            <div className="flex gap-2">
              <input
                type="text"
                value={ownValue}
                onChange={e => setOwnValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitOwn()}
                placeholder="e.g. 8 weeks, 97.5%…"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 placeholder-slate-300"
                autoFocus
              />
              <button
                onClick={submitOwn}
                disabled={!ownValue.trim()}
                className="px-3 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Set →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Markdown table renderer (for non-structured messages) ─────────────────────
function renderMessageContent(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++; }
      const rows = tableLines.filter(l => !l.match(/^\s*\|[\s\-|]+\|\s*$/));
      result.push(
        <div key={`t${i}`} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split('|').slice(1, -1);
                return (
                  <tr key={ri} className={ri === 0 ? 'bg-slate-200 font-semibold' : 'border-t border-slate-200'}>
                    {cells.map((cell, ci) => <td key={ci} className="px-2 py-1 whitespace-nowrap">{cell.trim()}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else {
      result.push(<span key={`l${i}`}>{line}{i < lines.length - 1 ? '\n' : ''}</span>);
      i++;
    }
  }
  return result;
}

// ── Param panel (left sidebar) ────────────────────────────────────────────────
function ParamPanel({ params }) {
  if (!params || Object.keys(params).length === 0) return null;
  const labels = {
    scenarioType:     'Scenario Type',
    kpiPriority:      'Optimize For',
    safetyStockWeeks: 'Safety Stock',
    serviceLevel:     'Service Level',
    wcCapM:           'WC Cap',
    leadTimeAdjWeeks: 'Lead Time Adj.',
    demandAdjPct:     'Demand Adj.',
    affectedSkus:     'Affected SKUs',
    reviewPeriod:     'Review Period',
    reorderOverride:  'ROP Override',
  };
  const fmt = (k, v) => {
    if (k === 'safetyStockWeeks') return v + ' wks';
    if (k === 'serviceLevel')     return v + '%';
    if (k === 'wcCapM')           return '$' + v + 'M';
    if (k === 'leadTimeAdjWeeks') return (v >= 0 ? '+' : '') + v + ' wks';
    if (k === 'demandAdjPct')     return (v >= 0 ? '+' : '') + v + '%';
    if (typeof v === 'boolean')   return v ? 'Yes' : 'No';
    return String(v);
  };
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parameters</p>
      <div className="space-y-1.5">
        {Object.entries(params).map(([k, v]) =>
          labels[k] ? (
            <div key={k} className="flex justify-between items-start gap-2">
              <span className="text-xs text-slate-400 shrink-0">{labels[k]}</span>
              <span className="text-xs font-medium text-slate-700 text-right">{fmt(k, v)}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

// ── MEIO baseline targets (mirrors ScenarioLibrary MEIO_VARIANTS.baseline) ────
const MEIO_TARGETS = {
  inventoryValue: { label: 'Inventory Value', value: '$142.4M', good: 'down' },
  inventoryTurns: { label: 'Inventory Turns', value: '5.8x',    good: 'up'   },
  serviceLevel:   { label: 'Service Level',   value: '96.8%',   good: 'up'   },
  ssWeeks:        { label: 'Safety Stock',    value: '6.2 wks', good: 'down' },
  weeksOnHand:    { label: 'Wks on Hand',     value: '8.4 wks', good: 'up'   },
  wcExposure:     { label: 'WC Exposure',     value: '$38.1M',  good: 'down' },
  fillRate:       { label: 'Fill Rate',       value: '94.3%',   good: 'up'   },
};

function parseNum(v) { return parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0; }

function MeioComparison({ kpis }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600">vs. MEIO Baseline</p>
      </div>
      <div className="divide-y divide-slate-100">
        {Object.entries(MEIO_TARGETS).map(([key, meta]) => {
          const scenVal = kpis[key];
          if (!scenVal) return null;
          const base    = parseNum(meta.value);
          const curr    = parseNum(scenVal);
          const diff    = curr - base;
          const pct     = base !== 0 ? (diff / Math.abs(base)) * 100 : 0;
          const neutral = Math.abs(diff) < 0.01;
          const better  = !neutral && ((meta.good === 'up' && diff > 0) || (meta.good === 'down' && diff < 0));
          const deltaColor = neutral ? '#94A3B8' : better ? '#15803D' : '#DC2626';
          const deltaBg    = neutral ? '#F8FAFC'  : better ? '#F0FDF4' : '#FEF2F2';
          const sign       = diff > 0 ? '+' : '';
          return (
            <div key={key} className="flex items-center justify-between px-4 py-2 gap-2" style={{ background: deltaBg }}>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 leading-none">{meta.label}</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">{scenVal}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400 leading-none">Baseline: {meta.value}</p>
                <p className="text-[10px] font-bold mt-0.5" style={{ color: deltaColor }}>
                  {neutral ? '—' : `${sign}${pct.toFixed(1)}%`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// uiStep: 'type-select' | 'product-select' | 'kpi-select' | 'chat'
export default function ScenarioWorkspace({ scenario, skus = [], onUpdate, onBack, onApply, totalScenarios }) {
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [saved, setSaved]             = useState(scenario.status === 'active' || scenario.status === 'applied');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState(scenario.name);
  const [applyModal, setApplyModal]   = useState(false);

  const [uiStep, setUiStep] = useState(() =>
    (scenario.chatHistory?.length ?? 0) > 0 ? 'chat' : 'type-select'
  );

  const chatHistory          = scenario.chatHistory ?? [];
  const messagesContainerRef = useRef(null);
  const abortRef             = useRef(null);
  const systemPrompt         = useRef(buildSystemPrompt(skus));

  const scrollChat = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => { scrollChat(); }, [chatHistory.length, loading, uiStep, scrollChat]);

  // ── AI runner ───────────────────────────────────────────────────────────────
  const runAI = useCallback(async (messages) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    let full = '';
    try {
      await callClaudeChat(
        messages,
        systemPrompt.current,
        chunk => {
          full += chunk;
          onUpdate({ chatHistory: [...messages, { role: 'assistant', content: full }] });
          scrollChat();
        },
        controller.signal,
      );

      const params   = extractParams(full);
      const wasSaved = isSavedSignal(full);
      const updates  = { chatHistory: [...messages, { role: 'assistant', content: full }] };
      if (params)   { updates.params = params; updates.kpis = mockKPIs(params); }
      if (wasSaved) { updates.status = 'active'; setSaved(true); }
      onUpdate(updates);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[ScenarioWorkspace] Claude API error:', err);
        onUpdate({
          chatHistory: [...messages, { role: 'assistant', content: `Something went wrong: ${err.message ?? err}. Please try again.` }],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [onUpdate, scrollChat]);

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  function handleTypeSelect(type, customText) {
    setUiStep('product-select');
    onUpdate({ params: { ...scenario.params, scenarioType: type.label } });
    const ackMsg  = { role: 'assistant', content: `${type.label}: ${type.clause}. Which products are affected?` };
    const userMsg = customText ? { role: 'user', content: customText } : { role: 'user', content: type.label };
    onUpdate({ chatHistory: [userMsg, ackMsg] });
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  function handleProductConfirm(displayText) {
    const summaryMsg = { role: 'user',      content: `Modeling against: ${displayText}` };
    const kpiAskMsg  = { role: 'assistant', content: `Got it. Which KPI would you like to optimize for?\n\nI'll recommend parameters to improve it and show you the tradeoffs on the others.` };
    const newHistory = [...chatHistory, summaryMsg, kpiAskMsg];
    onUpdate({ chatHistory: newHistory, params: { ...scenario.params, affectedSkus: displayText } });
    setUiStep('kpi-select');
  }

  // ── Step 2b ─────────────────────────────────────────────────────────────────
  function handleKPISelect(kpiLabel) {
    const userMsg    = { role: 'user', content: `Optimize for: ${kpiLabel}` };
    const newHistory = [...chatHistory, userMsg];
    onUpdate({ chatHistory: newHistory, params: { ...scenario.params, kpiPriority: kpiLabel } });
    systemPrompt.current = buildSystemPrompt(skus, kpiLabel);
    setUiStep('chat');
    runAI(newHistory);
  }

  // ── Structured message buttons ───────────────────────────────────────────────
  function handleUseRecommended(value) {
    if (loading || saved) return;
    const msg = { role: 'user', content: `✓ Using recommended: ${value}` };
    const newHistory = [...chatHistory, msg];
    onUpdate({ chatHistory: newHistory });
    runAI(newHistory);
  }

  function handleEnterOwn(value, recommendedValue) {
    if (loading || saved) return;
    const kpi     = scenario.params?.kpiPriority ?? 'the target KPI';
    const deviated = checkDeviation(value, recommendedValue);
    const lines    = [`✓ Set to: ${value}`];
    if (deviated) lines.push(`⚠ At this level, ${kpi} is likely to move outside the target range.`);
    const msg = { role: 'user', content: lines.join('\n') };
    const newHistory = [...chatHistory, msg];
    onUpdate({ chatHistory: newHistory });
    runAI(newHistory);
  }

  // ── Normal chat send ────────────────────────────────────────────────────────
  function handleSend() {
    if (!input.trim() || loading || saved) return;
    const userMsg    = { role: 'user', content: input.trim() };
    const newHistory = [...chatHistory, userMsg];
    onUpdate({ chatHistory: newHistory });
    setInput('');
    runAI(newHistory);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function saveName() {
    if (draftName.trim()) onUpdate({ name: draftName.trim() });
    setEditingName(false);
  }

  const isApplied = scenario.status === 'applied';
  const canApply  = scenario.status === 'active' && !!onApply;

  const statusColors = {
    draft:    'bg-slate-100 text-slate-600',
    active:   'bg-teal-100 text-teal-700',
    applied:  'bg-purple-100 text-purple-700',
    archived: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="flex gap-5" style={{ height: 660 }}>

      {/* ── LEFT PANEL ── */}
      <div className="w-72 shrink-0 overflow-y-auto flex flex-col gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors w-fit">
          <ArrowLeft size={14} /> Back to Library
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          {editingName ? (
            <div className="flex items-center gap-1 mb-2">
              <input
                className="flex-1 text-sm font-semibold border border-teal-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-teal-200"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
              />
              <button onClick={saveName} className="text-teal-600 hover:text-teal-700"><Check size={14} /></button>
              <button onClick={() => setEditingName(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{scenario.name}</p>
              <button onClick={() => { setDraftName(scenario.name); setEditingName(true); }} className="text-slate-400 hover:text-teal-600 mt-0.5 shrink-0">
                <Edit2 size={13} />
              </button>
            </div>
          )}

          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize mb-3 ${statusColors[scenario.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {isApplied ? '✓ Applied' : scenario.status}
          </span>

          {scenario.description && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{scenario.description}</p>}

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">Created</span>
              <span className="text-[10px] text-slate-500">{scenario.createdAt}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">Updated</span>
              <span className="text-[10px] text-slate-500">{scenario.updatedAt}</span>
            </div>
          </div>

          <ParamPanel params={scenario.params} />
        </div>

        {scenario.kpis && (
          <>
            <MeioComparison kpis={scenario.kpis} />
            {(canApply || isApplied) && (
              <button
                onClick={() => canApply && setApplyModal(true)}
                disabled={isApplied}
                className={`w-full flex items-center justify-center gap-1.5 text-sm font-semibold py-2.5 rounded-xl border transition-colors ${
                  isApplied
                    ? 'bg-purple-50 text-purple-700 border-purple-200 cursor-default'
                    : 'bg-teal-600 hover:bg-teal-700 text-white border-transparent'
                }`}
              >
                <CheckSquare size={15} />
                {isApplied ? '✓ Applied to Plan' : 'Apply to Plan'}
              </button>
            )}
            <button onClick={onBack} className="w-full text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 rounded-lg py-2 hover:bg-teal-50 bg-white transition-colors">
              View in Library
            </button>
          </>
        )}

        {totalScenarios > 0 && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-teal-600">{totalScenarios}</span>{' '}
              scenario{totalScenarios !== 1 ? 's' : ''} saved
            </p>
            {totalScenarios >= 2 && <p className="text-[10px] text-slate-400 mt-0.5">Return to library to compare</p>}
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Scenario Builder</p>
            <p className="text-xs text-slate-400">AI-guided what-if analysis</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs shrink-0">
            <span className={`w-2 h-2 rounded-full inline-block ${loading ? 'bg-amber-400 animate-pulse' : 'bg-teal-400'}`} />
            <span className={loading ? 'text-amber-500' : 'text-teal-500'}>
              {loading ? 'Thinking' : uiStep === 'chat' ? 'Ready' : 'Setup'}
            </span>
          </span>
        </div>

        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ minHeight: 0 }}>

          {/* Step 1 — type selector */}
          {uiStep === 'type-select' && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} className="text-white" />
              </div>
              <div className="flex-1 max-w-[88%] bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <ScenarioTypeSelector onSelect={handleTypeSelect} />
              </div>
            </div>
          )}

          {/* Chat messages */}
          {chatHistory.map((msg, idx) => {
            const isUser      = msg.role === 'user';
            const displayText = isUser ? msg.content : stripSignals(msg.content);
            if (!displayText) return null;

            const isLastMsg      = idx === chatHistory.length - 1;
            const showProdSelect = uiStep === 'product-select' && !isUser && isLastMsg;
            const showKPISelect  = uiStep === 'kpi-select'     && !isUser && isLastMsg;

            // Try to parse as structured param card (assistant messages in chat step only)
            const parsed      = !isUser && uiStep === 'chat' ? parseStructuredParam(displayText) : null;
            // Buttons are hidden once the very next message is from the user
            const isResponded = chatHistory[idx + 1]?.role === 'user';

            return (
              <div key={idx}>
                <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={13} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-teal-600 text-white rounded-tr-sm whitespace-pre-wrap'
                      : parsed
                        ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                        : 'bg-slate-100 text-slate-800 rounded-tl-sm whitespace-pre-wrap'
                  }`}>
                    {isUser
                      ? displayText
                      : parsed
                        ? <StructuredParamMessage
                            parsed={parsed}
                            isResponded={isResponded}
                            onUseRecommended={handleUseRecommended}
                            onEnterOwn={handleEnterOwn}
                          />
                        : renderMessageContent(displayText)
                    }
                  </div>
                </div>

                {showProdSelect && skus.length > 0 && (
                  <div className="flex gap-2.5 mt-2">
                    <div className="w-7 shrink-0" />
                    <div className="flex-1 max-w-[88%]">
                      <ProductSelector skus={skus} onConfirm={handleProductConfirm} />
                    </div>
                  </div>
                )}

                {showKPISelect && (
                  <div className="flex gap-2.5 mt-2">
                    <div className="w-7 shrink-0" />
                    <div className="flex-1 max-w-[88%]">
                      <KPIPrioritySelector onSelect={handleKPISelect} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
                <Bot size={13} className="text-white" />
              </div>
              <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {saved && !loading && chatHistory.length > 0 && (
            <div className="flex justify-center pt-2">
              <button onClick={onBack} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                <CheckCircle2 size={15} /> View in Library
              </button>
            </div>
          )}
        </div>

        {uiStep === 'chat' && (
          saved ? (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-teal-700">
                <CheckCircle2 size={16} className="text-teal-500" /> Scenario saved successfully
              </div>
              <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium">
                <ArrowLeft size={14} /> Back to Library
              </button>
            </div>
          ) : (
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <div className="flex gap-3 items-end">
                <textarea
                  rows={2}
                  className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 transition"
                  placeholder="Answer the agent's questions…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white transition-colors shrink-0"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
            </div>
          )
        )}
      </div>

      {applyModal && (
        <ApplyModal
          scenario={scenario}
          onClose={() => setApplyModal(false)}
          onConfirm={() => { onApply(scenario); setApplyModal(false); }}
        />
      )}
    </div>
  );
}
