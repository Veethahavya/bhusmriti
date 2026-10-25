import { useEffect, useRef } from 'react';
import { useAtmos } from '../data/store';
import { PlayIcon } from './Icon';
import { RangeMenu } from './RangeMenu';

const localFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
const dayHourFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', hour12: false });
const utcFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const DAY = 86400000;

export function Timeline() {
  const data = useAtmos((s) => s.data);
  const start = useAtmos((s) => s.start);
  const end = useAtmos((s) => s.end);
  const frame = useAtmos((s) => s.frame);
  const playing = useAtmos((s) => s.playing);
  const duration = useAtmos((s) => s.duration);
  const setDuration = useAtmos((s) => s.setDuration);
  const pulse = useAtmos((s) => s.pulse);
  const togglePlay = useAtmos((s) => s.togglePlay);
  const setFrame = useAtmos((s) => s.setFrame);
  const step = useAtmos((s) => s.step);
  const pause = useAtmos((s) => s.pause);
  const rangePreset = useAtmos((s) => s.rangePreset);
  const rangeLabel = useAtmos((s) => s.rangeLabel);
  const gridLabel = useAtmos((s) => s.rangeGridLabel);
  const loading = useAtmos((s) => s.rangeLoading);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.code === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, step]);

  if (!data || end <= start) return null;
  const span = end - start;
  const spanMs = data.times[end] - data.times[start];
  const frac = Math.max(0, Math.min(1, (frame - start) / span));
  const i0 = Math.max(0, Math.min(data.times.length - 1, Math.floor(frame)));
  const i1 = Math.min(data.times.length - 1, i0 + 1);
  const t = data.times[i0] + (data.times[i1] - data.times[i0]) * (frame - i0);
  const d = new Date(t);
  const ticks = Array.from({ length: span + 1 }, (_, i) => start + i);
  const tickFmt = spanMs > 3 * DAY ? dayFmt : spanMs > DAY ? dayHourFmt : hourFmt;
  const bubbleFmt = spanMs > DAY ? dayHourFmt : hourFmt;

  const setFromEvent = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = (clientX - r.left) / Math.max(1, r.width);
    setFrame(start + Math.max(0, Math.min(1, f)) * span);
  };

  const spark = pulse.length ? pulse : new Array(span + 1).fill(0);
  const path = spark.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, spark.length - 1)) * 100},${18 - v * 15}`).join(' ');
  const area = `${path} L100,20 L0,20 Z`;
  const labelPositions = [0, 0.25, 0.5, 0.75, 1];
  const majorEvery = Math.max(1, Math.round(span / 8));

  return (
    <div className="timeline glass">
      <div className="tl-left">
        <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <PlayIcon paused={!playing} />
        </button>
        <div className="tl-dur">
          <div className="tl-dur-head"><span className="tl-k">LOOP</span><b>{duration}s</b></div>
          <input
            type="range" min={5} max={120} step={1} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            aria-label="Animation duration in seconds"
          />
        </div>
        <button className="tl-step" onClick={() => step(-1)} aria-label="Previous frame">‹</button>
        <button className="tl-step" onClick={() => step(1)} aria-label="Next frame">›</button>
      </div>

      <div className="tl-main">
        <div className="tl-meta">
          <div className="range-mobile"><RangeMenu /></div>
          <span className="tl-now">{localFmt.format(d)}</span>
          <span className="tl-utc">{utcFmt.format(d)}Z</span>
          <span className="tl-window">{rangeLabel.toUpperCase()} · {gridLabel.toUpperCase()} · {span + 1} STEPS</span>
          {loading && <span className="tl-loading">LOADING RANGE…</span>}
        </div>
        <div
          className="tl-track"
          ref={track}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (playing) pause();
            setFromEvent(e.clientX);
          }}
          onPointerMove={(e) => { if (dragging.current) setFromEvent(e.clientX); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
        >
          <svg className="tl-spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
            <path d={area} fill="rgba(94,234,212,0.08)" />
            <path d={path} fill="none" stroke="rgba(94,234,212,0.35)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="tl-ticks">
            {ticks.map((i) => {
              const major = (i - start) % majorEvery === 0;
              return <span key={i} className={`tick ${major ? 'major' : ''}`} style={{ left: `${((i - start) / span) * 100}%` }} />;
            })}
          </div>
          <div className="tl-progress" style={{ width: `${frac * 100}%` }} />
          <div className="tl-head" style={{ left: `${frac * 100}%` }}>
            <span className="tl-bubble" style={{ transform: frac > 0.85 ? 'translateX(-100%)' : frac < 0.15 ? 'translateX(0)' : 'translateX(-50%)' }}>{bubbleFmt.format(d)}</span>
            <i />
          </div>
          <div className="tl-labels">
            {labelPositions.map((f) => {
              const i = Math.round(start + f * span);
              return <span key={f} style={{ left: `${f * 100}%` }}>{tickFmt.format(new Date(data.times[i]))}</span>;
            })}
          </div>
        </div>
      </div>

      <div className="tl-right">
        <button className="live-btn" onClick={() => setFrame(end)}>
          <span className="live-dot" /> {rangePreset === 'custom' ? 'RANGE END' : 'LATEST'}
        </button>
        <div className="tl-age">{span + 1} FRAMES · {playing ? 'PLAYING' : 'PAUSED'}</div>
      </div>
    </div>
  );
}
