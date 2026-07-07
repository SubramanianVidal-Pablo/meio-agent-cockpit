import { useState, useRef } from 'react';
import { runSimulation, getPortfolioSummary, optimizeInventory } from '../data/simulationEngine';
import { TIERS } from '../data/skuData';
import { callClaude } from '../api/claude';
import { Bot, Sparkles, Loader2, Target, TrendingDown, TrendingUp, Shield, Zap } from 'lucide-react';

function fmt$(n) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

function TierBadge({ tier }) {
  const t = TIERS[tier];
  return (
    <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full">
      T{tier}
    </span>
  );
}

const TIER_COLORS = { 1: '#0F766E', 2: '#4F46E5', 3: '#D97706', 4: '#94A3B8' };

// ── Use-case zone banner ──────────────────────────────────────────────────────
function UseCaseBanner({ icon: Icon, badge, title, subtitle, color, bg, border }) {
  return (
    <div className="w-full rounded-2xl border-2 px-5 py-4 flex items-center gap-4"
      style={{ background: bg, borderColor: border }}>
      <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white"
        style={{ background: color }}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color }}>
          {badge}
        </div>
        <div className="text-sm font-bold text-ink">{title}</div>
        <div className="text-xs text-muted mt-0.5 leading-relaxed">{subtitle}</div>
      </div>
    </div>
  );
}

// ── Where to Play 2×2 ─────────────────────────────────────────────────────────
function WhereToPlay({ skus, optimized }) {
  const [hovered, setHovered] = useState(null);

  const points = skus.map(sku => {
    const opt = optimized.find(o => o.id === sku.id);
    const demandRisk = sku.demandCV * Math.sqrt(sku.leadTimeWeeks);
    const xRaw = [0, 0.85, 0.60, 0.35, 0.12][sku.tier];
    const seed = sku.id.charCodeAt(3) / 100;
    const x = Math.max(0.02, Math.min(0.98, xRaw + (seed - 0.05) * 0.08));
    return { ...sku, demandRisk, x, riskMonths: opt?.riskMonths || 0 };
  });

  const maxRisk = Math.max(...points.map(p => p.demandRisk));
  const normed  = points.map(p => ({ ...p, y: p.demandRisk / maxRisk }));

  const quadrants = [
    {
      id: 'protect',
      label: 'PROTECT', sub: 'High margin · High risk',
      icon: Shield, iconColor: '#0F766E',
      x: '50%', y: '0%', w: '50%', h: '50%',
      bg: '#F0FDFA', border: '#5EEAD4',
      tip: 'Increase SS and prioritise allocation — margin loss is material',
    },
    {
      id: 'monitor',
      label: 'MONITOR', sub: 'High margin · Low risk',
      icon: Target, iconColor: '#4F46E5',
      x: '50%', y: '50%', w: '50%', h: '50%',
      bg: '#EEF2FF', border: '#C7D2FE',
      tip: 'Maintain MEIO target — well-controlled, good margin',
    },
    {
      id: 'reduce',
      label: 'REDUCE EXPOSURE', sub: 'Low margin · High risk',
      icon: TrendingDown, iconColor: '#DC2626',
      x: '0%', y: '0%', w: '50%', h: '50%',
      bg: '#FEF2F2', border: '#FCA5A5',
      tip: 'Lean down SS, deprioritise in shortfall — cost of error is low',
    },
    {
      id: 'optimise',
      label: 'OPTIMISE', sub: 'Low margin · Low risk',
      icon: TrendingUp, iconColor: '#D97706',
      x: '0%', y: '50%', w: '50%', h: '50%',
      bg: '#FFFBEB', border: '#FDE68A',
      tip: 'Minimum viable SS — predictable demand, low margin means WC efficiency matters',
    },
  ];

  return (
    <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
      <div className="text-sm font-semibold text-ink mb-0.5">Where to Play</div>
      <div className="text-xs text-muted mb-4">
        X = portfolio margin tier (right = higher) · Y = demand risk (up = harder to predict, longer lead-time)
      </div>

      <div className="relative select-none" style={{ height: 340, userSelect: 'none' }}>
        {quadrants.map(q => (
          <div key={q.id} className="absolute rounded-xl border" style={{
            left: q.x, top: q.y, width: q.w, height: q.h,
            background: q.bg, borderColor: q.border,
            boxSizing: 'border-box', padding: 12,
          }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <q.icon className="w-3.5 h-3.5" style={{ color: q.iconColor }} />
              <span className="text-xs font-bold" style={{ color: q.iconColor }}>{q.label}</span>
            </div>
            <div className="text-xs" style={{ color: q.iconColor + 'AA' }}>{q.sub}</div>
          </div>
        ))}

        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2" style={{ bottom: -20 }}>
          <span className="text-xs text-faint">← Low Margin</span>
          <span className="text-xs text-faint font-semibold text-brand">High Margin →</span>
        </div>
        <div className="absolute top-0 bottom-0 flex flex-col justify-between" style={{ left: -52, top: 0 }}>
          <span className="text-xs text-danger font-semibold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>High Risk ↑</span>
          <span className="text-xs text-faint" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>↓ Low Risk</span>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute" style={{ left: '50%', top: 0, bottom: 0, borderLeft: '1.5px dashed #CBD5E1' }} />
          <div className="absolute" style={{ top: '50%', left: 0, right: 0, borderTop: '1.5px dashed #CBD5E1' }} />
        </div>

        {normed.map(pt => {
          const pxX = `${pt.x * 100}%`;
          const pxY = `${(1 - pt.y) * 100}%`;
          const color = TIER_COLORS[pt.tier];
          const isHov = hovered?.id === pt.id;
          const radius = pt.riskMonths > 0 ? 9 : 7;
          return (
            <div key={pt.id}
              onMouseEnter={() => setHovered(pt)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                left: pxX, top: pxY,
                transform: 'translate(-50%, -50%)',
                width: radius * 2, height: radius * 2,
                borderRadius: '50%',
                background: color,
                border: `2px solid ${isHov ? '#0F172A' : 'white'}`,
                boxShadow: isHov ? '0 0 0 3px ' + color + '55' : '0 1px 3px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                zIndex: isHov ? 10 : 2,
                transition: 'box-shadow 0.15s',
              }}
            />
          );
        })}

        {hovered && (
          <div className="absolute z-20 bg-white border border-border-light rounded-xl shadow-card-md px-3 py-2.5 text-xs pointer-events-none"
            style={{ left: `calc(${hovered.x * 100}% + 14px)`, top: `calc(${(1 - hovered.y) * 100}% - 40px)`, minWidth: 180 }}>
            <div className="font-semibold text-ink">{hovered.name}</div>
            <div className="text-muted">{hovered.id} · Tier {hovered.tier}</div>
            <div className="mt-1 space-y-0.5">
              <div>Margin: <span className="font-semibold text-ink">{(hovered.unitMargin * 100).toFixed(0)}%</span></div>
              <div>Demand CV: <span className="font-semibold text-ink">{hovered.demandCV}</span></div>
              <div>Lead-time: <span className="font-semibold text-ink">{hovered.leadTimeWeeks}w</span></div>
              {hovered.riskMonths > 0 && (
                <div className="text-danger font-semibold">⚠ {hovered.riskMonths} risk months</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-6 flex-wrap">
        {[1, 2, 3, 4].map(t => (
          <div key={t} className="flex items-center gap-1.5 text-xs text-muted">
            <div className="w-3 h-3 rounded-full" style={{ background: TIER_COLORS[t] }} />
            {TIERS[t].label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-muted ml-2">
          <div className="w-4 h-4 rounded-full bg-slate-200 border-2 border-slate-400" />
          Larger dot = has risk months
        </div>
      </div>
    </div>
  );
}

// ── This Cycle's Decisions ──────────────────────────────────────────────────
function CycleDecisions({ skus, optimized, scenario, summary }) {
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE').sort((a, b) => a.tier - b.tier || b.riskMonths - a.riskMonths);
  const toReduce   = optimized.filter(s => s.decision === 'REDUCE').sort((a, b) => b.wcImpact - a.wcImpact);
  const totalWcRelease = toReduce.reduce((sum, s) => sum + s.wcImpact, 0);
  const totalWcNeeded  = toIncrease.reduce((sum, s) => sum + Math.abs(s.wcImpact), 0);
  const netWc = totalWcRelease - totalWcNeeded;

  const decisions = [];

  if (toIncrease.filter(s => s.tier === 1).length > 0) {
    const t1Up = toIncrease.filter(s => s.tier === 1);
    decisions.push({
      priority: 1,
      icon: Shield,
      color: '#0F766E',
      bg: '#F0FDFA',
      border: '#5EEAD4',
      title: `Protect ${t1Up.length} Tier-1 SKU${t1Up.length > 1 ? 's' : ''} — increase SS immediately`,
      detail: t1Up.map(s => `${s.id} (${Math.abs(s.delta).toLocaleString()} units short, ${s.riskMonths} risk months)`).join(' · '),
      impact: `Prevents ${fmt$(t1Up.reduce((a, s) => a + s.timeline?.reduce((x, t) => x + t.marginAtRisk, 0) || 0, 0))} margin loss`,
      owner: 'Supply Planning',
    });
  }

  if (toReduce.length > 0) {
    const top3 = toReduce.slice(0, 3);
    decisions.push({
      priority: 2,
      icon: TrendingDown,
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FCA5A5',
      title: `Release ${fmt$(totalWcRelease)} working capital from ${toReduce.length} over-buffered SKU${toReduce.length > 1 ? 's' : ''}`,
      detail: top3.map(s => `${s.id} (+${s.delta.toLocaleString()} excess, ${fmt$(s.wcImpact)} WC)`).join(' · '),
      impact: `Frees WC to fund ${toIncrease.filter(s => s.tier <= 2).length} T1/T2 top-ups`,
      owner: 'Finance / Planning',
    });
  }

  if (netWc > 0) {
    decisions.push({
      priority: 3,
      icon: TrendingUp,
      color: '#4F46E5',
      bg: '#EEF2FF',
      border: '#C7D2FE',
      title: `Net ${fmt$(netWc)} WC savings available after rebalancing`,
      detail: `Reallocate freed T3/T4 SS buffer → T1/T2 top-ups, net positive ${fmt$(netWc)}`,
      impact: 'Improved Tier-1 coverage without new budget',
      owner: 'S&OP Lead',
    });
  }

  if (scenario !== 'baseline') {
    decisions.push({
      priority: decisions.length + 1,
      icon: Target,
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      title: `${scenario === 'reactive' ? 'Activate contingency supply plan' : 'Validate proactive buffer adequacy'} for months 3–7`,
      detail: scenario === 'reactive'
        ? 'Capacity shortfall (−30% supply) starts Month 3. Expedite alternative CMO qualification.'
        : 'Pre-built proactive buffers should absorb the +25% demand spike. Confirm on-hand coverage.',
      impact: `${summary.skusAtRisk} SKUs currently at risk under this scenario`,
      owner: 'Procurement / CMO Mgr',
    });
  }

  decisions.push({
    priority: decisions.length + 1,
    icon: Bot,
    color: '#64748B',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    title: `Review Tier-3/4 allocation policy — ${optimized.filter(s => s.tier >= 3 && s.riskMonths > 0).length} low-margin SKUs showing risk`,
    detail: 'Under constrained supply, short T3/T4 to protect T1/T2 fulfillment (tier-priority allocation rule)',
    impact: 'Frees capacity at constrained CMOs for high-margin products',
    owner: 'Commercial Ops',
  });

  return (
    <div className="bg-white border border-border-light rounded-xl shadow-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-4 h-4 text-brand" />
        <div className="text-sm font-semibold text-ink">This Cycle's Decisions</div>
      </div>
      <div className="text-xs text-muted mb-4">
        Prioritised actions for the supply review meeting · Scenario: <span className="capitalize font-semibold text-ink">{scenario}</span>
      </div>
      <div className="space-y-3">
        {decisions.map((d, i) => (
          <div key={i} className="flex gap-3 rounded-xl border p-4"
            style={{ background: d.bg, borderColor: d.border }}>
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm"
              style={{ background: d.color }}>
              {d.priority}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="font-semibold text-sm text-ink">{d.title}</div>
                <span className="shrink-0 text-xs text-muted bg-white border border-border-light rounded-full px-2 py-0.5">{d.owner}</span>
              </div>
              <div className="text-xs text-muted mt-1 leading-relaxed">{d.detail}</div>
              <div className="text-xs font-semibold mt-1.5" style={{ color: d.color }}>→ {d.impact}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function AgentRecommendations({ skus, scenario, ssMultiplier }) {
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const abortRef = useRef(null);

  const simulated  = runSimulation(skus, scenario, ssMultiplier);
  const summary    = getPortfolioSummary(simulated);
  const optimized  = optimizeInventory(skus, scenario, ssMultiplier);

  const toReduce   = optimized.filter(s => s.decision === 'REDUCE');
  const toIncrease = optimized.filter(s => s.decision === 'INCREASE');
  const totalWcRelease = toReduce.reduce((sum, s) => sum + s.wcImpact, 0);
  const totalWcNeeded  = toIncrease.reduce((sum, s) => sum + Math.abs(s.wcImpact), 0);
  const t1MarginProtected = simulated
    .filter(s => s.tier === 1 && s.timeline.some(t => t.atRisk))
    .reduce((s, sku) => s + sku.timeline.reduce((a, t) => a + t.marginAtRisk, 0), 0);

  const priorityColor  = { High: '#DC2626', Medium: '#D97706', Low: '#64748B' };
  const priorityBg     = { High: '#FEF2F2', Medium: '#FFFBEB', Low: '#F8FAFC' };
  const priorityBorder = { High: '#FCA5A5', Medium: '#FDE68A', Low: '#E2E8F0' };

  const actionRows = [];
  simulated.filter(s => s.tier === 1).forEach(sku => {
    const riskMths = sku.timeline.filter(t => t.atRisk).length;
    const opt = optimized.find(o => o.id === sku.id);
    if (riskMths > 0) {
      actionRows.push({
        priority: 'High', sku: sku.id, name: sku.name, tier: sku.tier,
        action: `Increase SS by ${Math.abs(opt?.delta || 0).toLocaleString()} units to optimal target`,
        impact: `Protect ${fmt$(sku.unitRevenue * sku.unitMargin * riskMths * (sku.meioSafetyStock / 12))} margin`,
        confidence: Math.round(90 - sku.demandCV * 50),
        owner: 'Supply Planning',
      });
    } else if (opt?.decision === 'REDUCE') {
      actionRows.push({
        priority: 'Medium', sku: sku.id, name: sku.name, tier: sku.tier,
        action: `Reduce SS by ${opt.delta.toLocaleString()} units — right-size to optimal`,
        impact: fmt$(opt.wcImpact) + ' WC released',
        confidence: 80,
        owner: 'Finance',
      });
    }
  });
  simulated.filter(s => s.tier >= 3 && s.timeline.some(t => t.atRisk)).slice(0, 4).forEach(sku => {
    actionRows.push({
      priority: 'Low', sku: sku.id, name: sku.name, tier: sku.tier,
      action: 'Accept partial short — deprioritise in allocation',
      impact: 'Frees CMO capacity for T1/T2',
      confidence: 70,
      owner: 'Commercial Ops',
    });
  });
  actionRows.push({
    priority: 'High', sku: 'All T1', name: 'Portfolio-wide', tier: 1,
    action: 'Accelerate CMO qualification to mitigate months 3–5 capacity shortfall',
    impact: 'Reduces reactive scenario probability',
    confidence: 85,
    owner: 'Procurement',
  });

  // Claude AI reactive response analysis
  async function generateAnalysis() {
    setLoading(true);
    setAiText('');
    setError('');
    abortRef.current = new AbortController();

    const top5 = simulated
      .filter(s => s.timeline.some(t => t.atRisk))
      .sort((a, b) =>
        b.timeline.reduce((s, t) => s + t.marginAtRisk, 0) -
        a.timeline.reduce((s, t) => s + t.marginAtRisk, 0))
      .slice(0, 5);

    const reduceNames   = toReduce.slice(0, 4).map(s => s.id).join(', ');
    const increaseNames = toIncrease.slice(0, 4).map(s => `${s.id} (−${Math.abs(s.delta)} units)`).join(', ');

    const prompt =
      `REACTIVE RESPONSE PLAN REQUEST
Scenario: ${scenario} | SS Multiplier: ${ssMultiplier}x
Portfolio status: ${summary.skusAtRisk} SKUs at risk, total margin at risk ${fmt$(summary.totalMarginAtRisk)}, avg fulfillment ${summary.avgFulfillmentRate.toFixed(1)}%, worst month: ${summary.worstMonth}.
Optimisation engine: ${toReduce.length} SKUs to REDUCE (${fmt$(totalWcRelease)} WC release), ${toIncrease.length} SKUs to INCREASE (${fmt$(totalWcNeeded)} WC needed). Net WC: ${fmt$(totalWcRelease - totalWcNeeded)}.
SKUs to reduce: ${reduceNames || 'none'}.
SKUs to increase: ${increaseNames || 'none'}.
Top 5 at-risk: ${top5.map(s => `${s.id} ${s.name} Tier${s.tier} ${s.timeline.filter(t => t.atRisk).length} risk-months`).join('; ')}.

This is an ACTIVE DISRUPTION scenario. Provide an immediate reactive response plan:
(1) Which T1/T2 products to protect right now and what immediate supply actions to take
(2) Where to take allocation risk (which T3/T4 SKUs to short to protect T1/T2)
(3) How to redeploy freed inventory or working capital to mitigate the disruption
(4) The top 3 decisions to make at the next supply review meeting — be specific and quantitative.`;

    try {
      await callClaude(prompt, chunk => setAiText(p => p + chunk), abortRef.current.signal);
    } catch (err) {
      if (err.name !== 'AbortError')
        setError(err.message || 'Failed to reach Claude API. Check your API key configuration.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Bot className="w-6 h-6 text-brand" />
            AI Agent Recommendations
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Scenario: <span className="font-semibold text-ink capitalize">{scenario}</span>
            {' · '}SS Multiplier: <span className="font-semibold text-brand">{ssMultiplier}x</span>
            {' · '}{summary.skusAtRisk} SKUs at risk · Total margin at risk: <span className="font-semibold text-danger">{fmt$(summary.totalMarginAtRisk)}</span>
          </p>
        </div>
        <button
          onClick={generateAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 text-white"
          style={{ background: '#DC2626' }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {loading ? 'Generating...' : 'Generate Reactive Response Plan'}
        </button>
      </div>

      {/* ── ZONE 1: REGULAR PLANNING ─────────────────────────────────────── */}
      <UseCaseBanner
        icon={Target}
        badge="USE CASE: REGULAR PLANNING — Inventory Optimisation"
        title="Right-size safety stock · Release working capital · Just enough"
        subtitle="Run scheduled scenarios to replace 'just in case' buffers with 'just enough' — fulfill more demand while releasing working capital."
        color="#0F766E"
        bg="#F0FDFA"
        border="#5EEAD4"
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'SKUs to Protect (Increase SS)', value: toIncrease.length, sub: fmt$(totalWcNeeded) + ' WC required', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
          { label: 'SKUs to Lean Down (Reduce SS)', value: toReduce.length, sub: fmt$(totalWcRelease) + ' WC to release', color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
          { label: 'Net WC Opportunity', value: fmt$(totalWcRelease - totalWcNeeded), sub: 'release → reinvest', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
          { label: 'T1 Margin Protected', value: fmt$(t1MarginProtected), sub: 'if SS actions taken', color: '#0F766E', bg: '#F0FDFA', border: '#5EEAD4' },
        ].map((tile, i) => (
          <div key={i} className="bg-white rounded-xl border shadow-card p-4" style={{ borderColor: tile.border }}>
            <div className="text-xs text-muted">{tile.label}</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: tile.color }}>{tile.value}</div>
            <div className="text-xs text-faint mt-0.5">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Where to Play 2×2 */}
      <WhereToPlay skus={skus} optimized={optimized} />

      {/* This Cycle's Decisions */}
      <CycleDecisions skus={skus} optimized={optimized} scenario={scenario} summary={summary} />

      {/* ── ZONE 2: REACTIVE RESPONSE ────────────────────────────────────── */}
      <UseCaseBanner
        icon={Zap}
        badge="USE CASE: REACTIVE RESPONSE — Event Mitigation"
        title="Outside signal received · Immediate actions · Protect T1/T2"
        subtitle="An active disruption has occurred. The table below shows per-SKU immediate actions and the AI synthesis generates a full mitigation plan."
        color="#DC2626"
        bg="#FEF2F2"
        border="#FCA5A5"
      />

      {/* Recommendation Action Table */}
      <div className="bg-white border border-border-light rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-light">
          <div className="text-sm font-semibold text-ink">Detailed Action Table</div>
          <div className="text-xs text-muted mt-0.5">Per-SKU prioritised actions for supply review</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-xs text-muted font-semibold border-b border-border-light">
                <th className="text-left px-4 py-2.5">Priority</th>
                <th className="text-left px-4 py-2.5">SKU</th>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Tier</th>
                <th className="text-left px-4 py-2.5">Recommended Action</th>
                <th className="text-left px-4 py-2.5">Expected Impact</th>
                <th className="text-center px-4 py-2.5">Confidence</th>
                <th className="text-left px-4 py-2.5">Owner</th>
              </tr>
            </thead>
            <tbody>
              {actionRows.slice(0, 15).map((row, i) => (
                <tr key={i} className="border-b border-border-light hover:bg-surface transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: priorityBg[row.priority], color: priorityColor[row.priority], border: `1px solid ${priorityBorder[row.priority]}` }}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">{row.sku}</td>
                  <td className="px-4 py-2.5 text-xs text-ink">{row.name}</td>
                  <td className="px-4 py-2.5"><TierBadge tier={row.tier} /></td>
                  <td className="px-4 py-2.5 text-xs text-ink">{row.action}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{row.impact}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-brand">{row.confidence}%</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{row.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claude AI Synthesis — Reactive Response */}
      <div className="bg-white border-2 rounded-xl shadow-card p-5" style={{ borderColor: '#FCA5A5' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: '#DC2626' }}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">Claude AI Synthesis — Reactive Response Plan</div>
              <div className="text-xs text-muted">Emergency mitigation · Immediate allocation decisions · T1/T2 protection</div>
            </div>
          </div>
          <button
            onClick={generateAnalysis}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 text-white"
            style={{ background: '#DC2626' }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {loading ? 'Generating...' : 'Generate Reactive Response Plan'}
          </button>
        </div>

        {!aiText && !loading && !error && (
          <div className="text-sm text-muted text-center py-8 border-2 border-dashed rounded-xl" style={{ borderColor: '#FCA5A5' }}>
            Click "Generate Reactive Response Plan" to get Claude's immediate mitigation recommendations
          </div>
        )}
        {loading && !aiText && (
          <div className="flex items-center gap-3 py-6 text-muted">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#DC2626' }} />
            <span className="text-sm">Analysing disruption impact and generating mitigation plan...</span>
          </div>
        )}
        {error && (
          <div className="bg-danger-50 border border-red-200 rounded-xl p-4 text-sm text-danger">{error}</div>
        )}
        {(aiText || (loading && aiText)) && (
          <div className="rounded-xl p-4 border" style={{ background: '#FEF2F2', borderColor: '#FCA5A5' }}>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
              {aiText}{loading && <span className="animate-pulse ml-0.5" style={{ color: '#DC2626' }}>|</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
