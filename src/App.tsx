import { useEffect, useState } from 'react';
import { GlobeCanvas } from './GlobeCanvas';
import { useAtmos } from './data/store';
import { TopBar } from './components/TopBar';
import { FieldsDock } from './components/FieldsDock';
import { InfoPanel } from './components/InfoPanel';
import { RangeLoading } from './components/RangeLoading';
import { VarInfo } from './components/VarInfo';
import { LayerPanel } from './components/LayerPanel';
import { RightRail } from './components/Legend';
import { Timeline } from './components/Timeline';
import { HUD } from './components/HUD';
import { Settings } from './components/Settings';
import { BriefingPanel } from './components/BriefingPanel';

export function App() {
  const status = useAtmos((s) => s.status);
  const engineReady = useAtmos((s) => s.engineReady);
  const progress = useAtmos((s) => s.progress);
  const label = useAtmos((s) => s.progressLabel);
  const error = useAtmos((s) => s.error);
  const [intro, setIntro] = useState(true);

  useEffect(() => { useAtmos.getState().init(); }, []);
  useEffect(() => {
    if (status === 'ready' && engineReady) {
      const t = setTimeout(() => setIntro(false), 1100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, engineReady]);

  return (
    <div className="app">
      <GlobeCanvas />
      <div className="space-grain" />
      <TopBar />
      <FieldsDock />
      <LayerPanel />
      <RightRail />
      <Timeline />
      <HUD />
      <Settings />
      <InfoPanel />
      <RangeLoading />
      <VarInfo />
      <BriefingPanel />
      <div className={`intro ${intro ? '' : 'gone'} ${error ? 'failed' : ''}`}>
        <div className="intro-inner">
          <div className="intro-mark"><span /><span /><span /></div>
          <h1>BHŪSMRTI</h1>
          <p className="intro-sub">A 24-hour atlas of planetary wind, heat and moisture.</p>
          {error ? (
            <div className="intro-error">
              <p>Could not read the atmosphere snapshot.</p>
              <code>{error}</code>
              <button onClick={() => location.reload()}>TRY AGAIN</button>
            </div>
          ) : (
            <>
              <div className="intro-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <div className="intro-status">
                <span>{status === 'ready' && !engineReady ? 'building the basemap' : label}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
            </>
          )}
        </div>
        <div className="intro-foot">NOAA GFS · OPEN-METEO · NATURAL EARTH</div>
      </div>
    </div>
  );
}
