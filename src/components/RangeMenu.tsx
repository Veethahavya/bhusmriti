import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtmos } from '../data/store';
import { localDateValue, parseLocalDate } from '../data/ranges';

const DAY = 86400000;

export function RangeMenu() {
  const ranges = useAtmos((s) => s.ranges);
  const data = useAtmos((s) => s.data);
  const start = useAtmos((s) => s.start);
  const end = useAtmos((s) => s.end);
  const preset = useAtmos((s) => s.rangePreset);
  const label = useAtmos((s) => s.rangeLabel);
  const grid = useAtmos((s) => s.rangeGridLabel);
  const loading = useAtmos((s) => s.rangeLoading);
  const progress = useAtmos((s) => s.rangeProgress);
  const error = useAtmos((s) => s.rangeError);
  const selectPreset = useAtmos((s) => s.selectPreset);
  const applyCustom = useAtmos((s) => s.applyCustom);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const earliest = ranges?.ranges.long ?? ranges?.ranges.month;
  const min = useMemo(() => {
    return earliest ? localDateValue(Date.parse(earliest.start)) : localDateValue(Date.now() - 30 * DAY);
  }, [earliest]);
  const max = useMemo(() => {
    return earliest ? localDateValue(Date.parse(earliest.end)) : localDateValue(Date.now());
  }, [earliest]);

  const [from, setFrom] = useState(() => localDateValue(Date.now() - 7 * DAY));
  const [to, setTo] = useState(() => localDateValue(Date.now()));

  useEffect(() => {
    if (!open) return;
    if (preset === 'custom' && data) {
      setFrom(localDateValue(data.times[start]));
      setTo(localDateValue(data.times[end]));
    }
  }, [open, preset, data, start, end]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (p: Exclude<typeof preset, 'custom'>) => {
    selectPreset(p);
    setOpen(false);
  };

  const runCustom = () => {
    const a = parseLocalDate(from);
    const b = parseLocalDate(to) + DAY - 1;
    applyCustom(Math.min(a, b), Math.max(a, b));
    setOpen(false);
  };

  return (
    <div className="range-menu" ref={ref}>
      <button className={`range-btn ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} title="Choose animation range">
        <span className="live-dot" />
        <span className="range-label">{label}</span>
        <em>{grid}</em>
        {loading ? <span className="range-spin" /> : <span className="range-caret">▾</span>}
      </button>
      {open && (
        <div className="range-pop glass">
          <div className="range-pop-head">
            <span>ANIMATION RANGE</span>
            {loading && <span className="range-loading">LOADING {Math.round(progress * 100)}%</span>}
          </div>
          <button className={`range-opt ${preset === 'today' ? 'on' : ''}`} onClick={() => pick('today')}>
            <b>TODAY</b><span>since local midnight</span>
          </button>
          <button className={`range-opt ${preset === '24h' ? 'on' : ''}`} onClick={() => pick('24h')}>
            <b>LAST 24 HOURS</b><span>1° atmosphere · hourly</span>
          </button>
          <button className={`range-opt ${preset === 'week' ? 'on' : ''}`} onClick={() => pick('week')} disabled={!ranges?.ranges.week}>
            <b>LAST 7 DAYS</b><span>2° · 3-hourly</span>
          </button>
          <button className={`range-opt ${preset === 'month' ? 'on' : ''}`} onClick={() => pick('month')} disabled={!ranges?.ranges.month}>
            <b>LAST 30 DAYS</b><span>3° · 12-hourly</span>
          </button>
          <button className={`range-opt ${preset === 'long' ? 'on' : ''}`} onClick={() => pick('long')} disabled={!ranges?.ranges.long}>
            <b>LONG ARCHIVE</b><span>3° · daily · atmosphere</span>
          </button>
          <div className="range-divider"><span>CUSTOM DATE RANGE</span></div>
          <div className="range-dates">
            <label>FROM<input type="date" value={from} min={min} max={max} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>TO<input type="date" value={to} min={min} max={max} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <button className="range-apply" onClick={runCustom}>ANIMATE THIS RANGE <span>→</span></button>
          <div className="range-hint">
            Custom ranges use the finest resolution that covers them.
            {' '}{ranges?.ranges.long
              ? `History begins ${new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(ranges.ranges.long.start))}.`
              : 'History is limited to the last 30 days.'}
          </div>
          {error && <div className="range-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
