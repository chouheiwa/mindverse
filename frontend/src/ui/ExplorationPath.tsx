import './ExplorationPath.css'

/** The same spatial hierarchy stays visible in orbit and inside the planet. */
export function ExplorationPath({ level }: { level: 'universe' | 'cluster' | 'star' | 'planet' }) {
  const steps = [
    { id: 'universe', label: '宇宙全景' },
    { id: 'cluster', label: '星系' },
    { id: 'star', label: '恒星系' },
    { id: 'planet', label: '问题行星' },
  ] as const
  const current = steps.findIndex((step) => step.id === level)
  return (
    <ol className="exploration-path" aria-label="探索路径">
      {steps.map((step, index) => (
        <li key={step.id} aria-current={step.id === level ? 'step' : undefined}
          className={index < current ? 'is-visited' : undefined}>
          <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          {step.label}
        </li>
      ))}
    </ol>
  )
}
