// All requests go through a server-side proxy at /api/anthropic.
// In development: the Vite dev-server proxy (vite.config.js) forwards to api.anthropic.com.
// In production (Vercel): api/anthropic.js serverless function forwards the request.
// In both cases the API key is injected server-side and never sent from the browser.
const ANTHROPIC_API_URL = '/api/anthropic/v1/messages';

const MEIO_SYSTEM_PROMPT = `You are MEIO-GPT, an expert AI agent for Multi-Echelon Inventory Optimisation (MEIO) in biopharma supply chains. You analyse biologics inventory exceptions, recommend policy changes, and explain your reasoning concisely using biopharma supply chain language.

Your expertise covers:
- Safety stock optimisation across Drug Substance (DS) manufacturing, Fill-Finish (F&F), and Cold Chain Distribution echelons
- Batch release lead times, QC testing windows, and GMP/GxP compliance constraints
- Service level targets by ABC classification and patient criticality (life-saving vs essential)
- Days of Supply (DoS) targets, reorder points (ROP), and cold chain compliance
- Plasma fractionation, cell culture yield variability, and CMO capacity constraints
- Shelf life risk management and write-off avoidance for biologics
- CAR-T and gene therapy supply chains — patient slot scheduling and vein-to-vein timelines
- P&L impact: stockout costs, holding costs, write-off risk, working capital release

Response style: be direct and quantitative, cite specific numbers, use biopharma supply chain terminology naturally (DoS, batch release, CMO, upstream/downstream, cold chain, GxP, fractionation). Keep responses focused and actionable. Never use markdown headers — plain prose only.`;

/**
 * Multi-turn chat — pass the full message array (alternating user/assistant).
 * systemPrompt is built by the caller and includes live portfolio context.
 */
export async function callClaudeChat(messages, systemPrompt, onChunk, signal) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // x-api-key is injected by the server-side proxy — do not send from the browser
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const reader  = response.body.getReader();
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
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text)
          onChunk(parsed.delta.text);
      } catch { /* skip malformed SSE */ }
    }
  }
}

export async function callClaude(prompt, onChunk, signal) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // x-api-key is injected by the server-side proxy — do not send from the browser
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: MEIO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

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
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk(parsed.delta.text);
        }
      } catch { /* skip malformed SSE */ }
    }
  }
}

export function buildExceptionPrompt(sku) {
  return `Analyse this biopharma inventory exception and provide a brief recommendation:

Biologic: ${sku.name} (${sku.id}) — ${sku.category}
Exception: ${sku.exceptionType || sku.status.replace(/_/g, ' ')}
Status: ${sku.status.replace(/_/g, ' ')} | Criticality: ${sku.criticality}
Current DoS: ${sku.currentDOH} days | Target DoS: ${sku.targetDOH} days
Service Level: ${sku.currentServiceLevel}% (target ${sku.targetServiceLevel}%)
Current Safety Stock: ${sku.currentSafetyStock} units | Recommended: ${sku.recommendedSafetyStock} units
End-to-End Lead Time: ${sku.leadTime} days (incl. QC batch release) | Demand CV: ${(sku.demandCV * 100).toFixed(0)}%
P&L Impact: ${sku.pnlImpact > 0 ? '+' : ''}$${(Math.abs(sku.pnlImpact) / 1000).toFixed(0)}K | Cold Chain: ${sku.coldChain ? 'Yes' : 'No'} | Shelf Life: ${sku.shelfLife} months
ABC Class: ${sku.abcClass} | Echelon: ${sku.echelon} | Location: ${sku.location} | Regulatory Status: ${sku.regulatoryStatus}

What immediate action should the supply planner take? Consider batch release timelines, cold chain constraints, and patient impact.`;
}

export function buildDeepDivePrompt(sku, scenario) {
  return `Provide detailed rationale for the ${scenario} scenario safety stock recommendation for this biologic:

Biologic: ${sku.name} (${sku.id}) — ${sku.category}
Exception: ${sku.exceptionType || 'N/A'} | Criticality: ${sku.criticality}
Current State: DoS ${sku.currentDOH}d, SL ${sku.currentServiceLevel}%, Safety Stock ${sku.currentSafetyStock?.toLocaleString()} units
Recommended (${scenario}): Safety Stock ${sku.recommendedSafetyStock?.toLocaleString()} units, DoS target ${sku.targetDOH}d, SL target ${sku.targetServiceLevel}%
End-to-End Lead Time: ${sku.leadTime} days (variability: ${(sku.leadTimeVariability * 100).toFixed(0)}%, incl. cell culture, purification, QC batch release)
Demand CV: ${(sku.demandCV * 100).toFixed(0)}% | Batch Size: ${sku.batchSize} units | Shelf Life: ${sku.shelfLife} months | Cold Chain: ${sku.coldChain ? 'Yes — 2–8°C' : 'No'}
Echelon: ${sku.echelon} | Location: ${sku.location} | ABC: ${sku.abcClass} | Regulatory: ${sku.regulatoryStatus}
P&L Impact: ${sku.pnlImpact > 0 ? '+' : ''}$${(Math.abs(sku.pnlImpact) / 1000).toFixed(0)}K

Explain the trade-offs of this ${scenario} scenario in biopharma terms. Cover: what drives the recommended safety stock level given the long biologics lead time, how batch size constraints affect inventory policy, shelf life implications for the target DoS, and any cold chain or regulatory considerations the planner should factor in.`;
}
