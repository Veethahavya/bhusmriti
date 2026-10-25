import { useAtmos } from '../data/store';

export function RangeLoading() {
  const loading = useAtmos((s) => s.rangeLoading);
  const label = useAtmos((s) => s.rangeLoadingLabel);
  const progress = useAtmos((s) => s.rangeProgress);
  if (!loading) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="range-loading-scrim" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="assertive">
      <div className="range-loading-card glass">
        <div className="rl-spinner"><span /></div>
        <div className="rl-kicker">LOADING RANGE</div>
        <div className="rl-title">{label || 'Selected period'}</div>
        <div className="rl-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="rl-meta">{pct}% · FETCHING THE SELECTED ATMOSPHERE</div>
        <div className="rl-hint">The view will resume automatically. This window cannot be dismissed.</div>
      </div>
    </div>
  );
}
