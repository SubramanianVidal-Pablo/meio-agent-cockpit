import { useState } from 'react';
import ScenarioLibrary from './ScenarioLibrary';
import ScenarioWorkspace from './ScenarioWorkspace';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const OPENING_MESSAGE = `What supply chain situation are you planning for?

Describe what's happening — a disruption, a capacity issue, a demand signal, anything you're concerned about. I'll work through the implications and recommend a course of action.`;

export const DEMO_SCENARIO_ID = 'demo-cmo-ireland';

export const DEMO_SCENARIO = {
  id: DEMO_SCENARIO_ID,
  name: 'CMO Ireland — 2-week delay, Q3 capacity replan',
  description: 'Our CMO in Ireland is running 2 weeks behind on the Product A batch. We also have a demand surge coming for Product B next quarter.',
  status: 'active',
  createdAt: '08/07/2026',
  updatedAt: '08/07/2026',
  // Hardcoded KPIs derived from the AI recommendation:
  // Product A SS draw-down (8→5 wks) releases ~$4.8M; Product B surge adds $3.2M → net –$1.4M WC
  // Stockout risk increases on Product A (2 SKUs flagged); service level dips slightly
  kpis: {
    inventoryValue: '$120.9M',
    wcExposure:     '$32.6M',
    stockoutRisk:   '2 SKUs',
    serviceLevel:   '96.2%',
  },
  includeInComparison: true,
  pinned: true,
  chatHistory: [
    { role: 'assistant', content: OPENING_MESSAGE },
    {
      role: 'user',
      content: 'Our CMO in Ireland is running 2 weeks behind on the Product A batch. We also have a demand surge coming for Product B next quarter. I want to understand if we can draw down Product A safety stock to free up fill capacity for Product B.',
    },
    {
      role: 'assistant',
      content: `SITUATION
Your CMO in Ireland is delayed 2 weeks on the Product A batch, coinciding with a Q3 demand surge for Product B. You're asking whether drawing down Product A safety stock can free fill capacity for Product B.

RECOMMENDED COURSE OF ACTION
Accept a temporary 3-week draw-down on Product A safety stock (from 8 to 5 weeks), redirecting that fill capacity to Product B for 6 weeks. This keeps Product A within its Class B service floor and fully covers the Product B demand surge without an emergency manufacturing slot.

TRADE-OFFS

Product A
  Safety stock:        8 weeks → 5 weeks (–3 weeks)
  Service level:       97.5% → 94.8%  (above Class B floor: 92%)
  Stockout risk:       +4.2pp over the 6-week window
  Status:              Within policy bounds

Product B
  Demand fulfillment:  +18% of Q3 forecast covered
  Inventory required:  +$3.2M to support surge
  Coverage period:     6 weeks at projected demand rate
  Status:              Fully covered

Net working capital impact:   –$1.4M (net release)
Risk summary: Product A incurs moderate, time-bounded service risk that stays within Class B policy floor. Product B demand surge is fully absorbed.

ALTERNATIVE APPROACHES
1. Conservative — Draw down Product A by 2 weeks only (to 6 weeks SS). Covers 11% of Product B surge. Lower risk but leaves a gap.
2. Aggressive — Draw down Product A to 4 weeks SS. Covers full surge plus builds 1 week of Product B buffer. Pushes Product A to 91.2% service level — slightly below Class B floor for 4 weeks.`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

function freshScenario() {
  const now = new Date().toLocaleDateString('en-GB');
  return {
    id: Date.now().toString(),
    name: `New Scenario — ${now}`,
    description: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    kpis: null,
    includeInComparison: true,
    pinned: false,
    chatHistory: [{ role: 'assistant', content: OPENING_MESSAGE }],
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   ORCHESTRATOR
───────────────────────────────────────────────────────────────────────────── */

export default function SimulationChat({ skus, onDecision, scenarios, onScenariosChange, onApply }) {
  const [activeId, setActiveId] = useState(null);

  function updateScenario(id, updates) {
    onScenariosChange(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, ...updates, updatedAt: new Date().toLocaleDateString('en-GB') }
          : s
      )
    );
  }

  function handleNew() {
    const s = freshScenario();
    onScenariosChange(prev => [...prev, s]);
    setActiveId(s.id);
  }

  function handleOpen(id) {
    setActiveId(id);
  }

  function handleDuplicate(id) {
    const src = scenarios.find(s => s.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: Date.now().toString(),
      name: `${src.name} (copy)`,
      status: 'draft',
      pinned: false,
      createdAt: new Date().toLocaleDateString('en-GB'),
      updatedAt: new Date().toLocaleDateString('en-GB'),
    };
    onScenariosChange(prev => [...prev, copy]);
    setActiveId(copy.id);
  }

  function handleSave(id, updates) {
    updateScenario(id, { ...updates, status: updates.status ?? 'active' });
  }

  function handleDelete(id) {
    // Never delete a pinned scenario
    const target = scenarios.find(s => s.id === id);
    if (!target || target.pinned) return;
    onScenariosChange(prev => prev.filter(s => s.id !== id));
    // If currently viewing the deleted scenario, go back to library
    if (activeId === id) setActiveId(null);
  }

  function handleBack() {
    setActiveId(null);
  }

  const activeScenario = scenarios.find(s => s.id === activeId);

  if (activeId && activeScenario) {
    return (
      <ScenarioWorkspace
        key={activeId}
        scenario={activeScenario}
        onSave={handleSave}
        onBack={handleBack}
        onUpdate={(updates) => updateScenario(activeId, updates)}
      />
    );
  }

  return (
    <ScenarioLibrary
      scenarios={scenarios}
      skus={skus}
      onNew={handleNew}
      onOpen={handleOpen}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onUpdate={updateScenario}
      onApply={onApply}
    />
  );
}
