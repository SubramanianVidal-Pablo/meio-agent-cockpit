export default function AgentThinkingPulse({ size = 'md', label = 'Agent thinking…' }) {
  const sizes = {
    sm: { dot: 'w-2 h-2', ring: 'w-2 h-2', text: 'text-xs' },
    md: { dot: 'w-3 h-3', ring: 'w-3 h-3', text: 'text-sm' },
    lg: { dot: 'w-4 h-4', ring: 'w-4 h-4', text: 'text-base' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center">
        <div className={`${s.ring} rounded-full bg-bcg-green opacity-30 absolute agent-ring`} />
        <div className={`${s.dot} rounded-full bg-bcg-green agent-thinking-pulse`} />
      </div>
      <span className={`${s.text} text-bcg-green font-medium`}>{label}</span>
    </div>
  );
}
