import { useState } from 'react';
import ScenarioLibrary from './ScenarioLibrary';
import ScenarioWorkspace from './ScenarioWorkspace';

function freshScenario() {
  return {
    id: Date.now().toString(),
    name: 'New Scenario',
    description: '',
    status: 'draft',
    createdAt: new Date().toLocaleDateString('en-GB'),
    updatedAt: new Date().toLocaleDateString('en-GB'),
    chatHistory: [],
    params: {},
    kpis: null,
    includeInComparison: true,
  };
}

// scenarios / onScenariosChange are lifted to App.jsx so they survive tab switches.
// activeId stays local — navigating away and back always returns to the library view.
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

  function createScenario() {
    const s = freshScenario();
    onScenariosChange(prev => [...prev, s]);
    setActiveId(s.id);
  }

  function duplicateScenario(sourceId) {
    const source = scenarios.find(s => s.id === sourceId);
    if (!source) return;
    const s = {
      ...freshScenario(),
      name: source.name + ' (copy)',
      params: JSON.parse(JSON.stringify(source.params)),
    };
    onScenariosChange(prev => [...prev, s]);
    setActiveId(s.id);
  }

  const activeScenario = scenarios.find(s => s.id === activeId) ?? null;

  return (
    <div className="fade-in">
      {activeId === null ? (
        <ScenarioLibrary
          scenarios={scenarios}
          onNew={createScenario}
          onOpen={id => setActiveId(id)}
          onDuplicate={duplicateScenario}
          onUpdate={updateScenario}
          onApply={onApply}
        />
      ) : (
        <ScenarioWorkspace
          key={activeId}
          scenario={activeScenario}
          skus={skus}
          onUpdate={updates => updateScenario(activeId, updates)}
          onBack={() => setActiveId(null)}
          onApply={onApply}
          totalScenarios={scenarios.filter(s => s.status === 'active' || s.status === 'applied').length}
        />
      )}
    </div>
  );
}
