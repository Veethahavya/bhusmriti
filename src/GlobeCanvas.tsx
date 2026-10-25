import { useEffect, useRef, useState } from 'react';
import { GlobeEngine, type EngineState } from './globe/GlobeEngine';
import { useAtmos } from './data/store';
import { ExpandIcon, GlobeIcon, InfoIcon, MinusIcon, PanIcon, PlusIcon } from './components/Icon';

export function GlobeCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GlobeEngine | null>(null);
  const [view, setView] = useState({ full: true, distance: 3.5, fullDistance: 3.5 });
  const [pan, setPan] = useState(true);
  const setPanel = useAtmos((s) => s.setPanel);
  const rangeLoading = useAtmos((s) => s.rangeLoading);

  useEffect(() => {
    engine.current?.setRangeLoading(rangeLoading);
  }, [rangeLoading]);

  useEffect(() => {
    if (!host.current) return;
    const e = new GlobeEngine(host.current);
    engine.current = e;
    e.onProbe = (p) => useAtmos.getState().setProbe(p);
    e.onReady = () => useAtmos.getState().setEngineReady(true);
    const unsub = useAtmos.subscribe((s) => e.update(s as unknown as EngineState));
    e.update(useAtmos.getState() as unknown as EngineState);
    const timer = window.setInterval(() => {
      setView({ full: e.isFull(), distance: e.getDistance(), fullDistance: e.getFullDistance() });
    }, 260);
    return () => {
      window.clearInterval(timer);
      unsub();
      e.destroy();
      engine.current = null;
    };
  }, []);

  const pct = Math.max(0, Math.min(1, (view.fullDistance - view.distance) / Math.max(0.01, view.fullDistance - 1.14)));
  const mode = pct < 0.06 ? 'PLANET' : pct < 0.45 ? 'ORBIT' : pct < 0.82 ? 'REGION' : 'SURFACE';

  const fullscreen = () => {
    const el = host.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="globe-wrap">
      <div className="globe-host" ref={host} />
      <div className="globe-vignette" />
      <div className="globe-controls glass">
        <button className="ctl" onClick={() => engine.current?.zoomBy(0.78)} aria-label="Zoom in"><PlusIcon /></button>
        <button className="ctl" onClick={() => engine.current?.zoomBy(1.28)} aria-label="Zoom out"><MinusIcon /></button>
        <span className="ctl-sep" />
        <button className="ctl" onClick={() => engine.current?.resetView()} aria-label="Reset globe" title="Reset view"><GlobeIcon /></button>
        <button className="ctl" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen"><ExpandIcon /></button>
        <span className="ctl-sep" />
        <button
          className={`ctl ${pan ? 'on' : ''}`}
          onClick={() => { const v = !pan; setPan(v); engine.current?.setPanEnabled(v); }}
          aria-label="Toggle drag to spin"
          title={pan ? 'Drag to spin is on' : 'Drag to spin is off'}
        ><PanIcon /></button>
        <button className="ctl" onClick={() => setPanel('info')} aria-label="Field guide" title="Field guide"><InfoIcon /></button>
      </div>
      <div className={`globe-alt ${pct > 0.06 ? 'live' : ''}`}>
        <span className="alt-label">{mode}</span>
        <span className="alt-bar"><i style={{ height: `${8 + pct * 92}%` }} /></span>
        <span className="alt-num">{view.distance.toFixed(2)}<em>R</em></span>
      </div>
      <div className={`globe-hint ${view.full ? 'show' : ''}`}>
        <span className="pulse-dot" /> {pan ? 'DRAG TO SPIN' : 'SPIN OFF'} <span className="hint-sep">·</span> SCROLL / PINCH TO DIVE IN
      </div>
    </div>
  );
}
