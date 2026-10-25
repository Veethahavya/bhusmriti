import { useAtmos } from '../data/store';

export function ModeToggle() {
  const mode = useAtmos((s) => s.visualMode);
  const setMode = useAtmos((s) => s.setVisualMode);
  return (
    <div className="mode-toggle" role="group" aria-label="Visual mode">
      <button className={mode === 'atlas' ? 'on' : ''} onClick={() => setMode('atlas')} title="Conventional atlas notation">ATLAS</button>
      <button className={mode === 'smoke' ? 'on' : ''} onClick={() => setMode('smoke')} title="Realistic wind smoke">SMOKE</button>
    </div>
  );
}
