import { useAtmos } from '../data/store';

export function ModeToggle() {
  const mode = useAtmos((s) => s.visualMode);
  const setMode = useAtmos((s) => s.setVisualMode);
  return (
    <div className="mode-toggle" role="group" aria-label="Visual mode">
      <button className={mode === 'globe' ? 'on' : ''} onClick={() => setMode('globe')} title="Conventional globe notation">GLOBE</button>
      <button className={mode === 'earth' ? 'on' : ''} onClick={() => setMode('earth')} title="Satellite Earth with wind gusts and ocean currents">EARTH</button>
    </div>
  );
}
