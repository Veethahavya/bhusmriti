import { useState } from 'react';
import { useAtmos } from '../data/store';
import { CloseIcon } from './Icon';
import { ageLabel } from '../lib/useNow';
import {
  readAppearance, resetAppearance, setHighContrast, setTextSize, setUiSize,
  type TextSize, type UiSize,
} from '../lib/appearance';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`setting-row ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <i className="toggle"><b /></i>
    </button>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Settings() {
  const panel = useAtmos((s) => s.panel);
  const setPanel = useAtmos((s) => s.setPanel);
  const particles = useAtmos((s) => s.particles);
  const setParticles = useAtmos((s) => s.setParticles);
  const barbs = useAtmos((s) => s.barbs);
  const setBarbs = useAtmos((s) => s.setBarbs);
  const labels = useAtmos((s) => s.labels);
  const setLabels = useAtmos((s) => s.setLabels);
  const grid = useAtmos((s) => s.grid);
  const setGrid = useAtmos((s) => s.setGrid);
  const terminator = useAtmos((s) => s.terminator);
  const setTerminator = useAtmos((s) => s.setTerminator);
  const density = useAtmos((s) => s.density);
  const setDensity = useAtmos((s) => s.setDensity);
  const flowColor = useAtmos((s) => s.flowColor);
  const setFlowColor = useAtmos((s) => s.setFlowColor);
  const windUnit = useAtmos((s) => s.windUnit);
  const setWindUnit = useAtmos((s) => s.setWindUnit);
  const data = useAtmos((s) => s.data);
  const rangeLabel = useAtmos((s) => s.rangeLabel);
  const rangeGridLabel = useAtmos((s) => s.rangeGridLabel);

  const initial = readAppearance();
  const [text, setText] = useState<TextSize>(initial.text);
  const [ui, setUi] = useState<UiSize>(initial.ui);
  const [contrast, setContrast] = useState(initial.contrast);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  if (panel !== 'settings') return null;

  const gen = data?.generatedAt ?? 0;
  const hydro = data?.gridFor('surface_temperature') ?? null;

  const doRefresh = async () => {
    setRefreshMsg('asking the local server…');
    try {
      const r = await fetch('/api/refresh', { method: 'POST' });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) throw new Error('no endpoint');
      setRefreshMsg('refreshing the atmosphere…');
      const started = Date.now();
      const old = data?.manifest.build_id;
      const timer = window.setInterval(async () => {
        try {
          const m = await fetch('/data/manifest.json', { cache: 'no-store' }).then((x) => x.json());
          if (m.build_id !== old) {
            window.clearInterval(timer);
            setRefreshMsg('new snapshot ready — reloading');
            window.setTimeout(() => location.reload(), 600);
          } else if (Date.now() - started > 420000) {
            window.clearInterval(timer);
            setRefreshMsg('refresh is taking longer than expected — check the terminal');
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch {
      setRefreshMsg('refresh endpoint unavailable — run npm start, or npm run refresh in a terminal');
    }
  };

  return (
    <div className="settings-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
      <aside className="settings-screen glass">
        <div className="settings-head">
          <div>
            <div className="eyebrow">INSTRUMENT</div>
            <h2>Settings</h2>
            <p>Tune the atlas without getting in the way of the atmosphere.</p>
          </div>
          <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close settings"><CloseIcon /></button>
        </div>

        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-h">APPEARANCE</div>
            <div className="setting-field">
              <span>Text size</span>
              <Seg
                value={text}
                options={[['sm', 'S'], ['md', 'M'], ['lg', 'L']] as Array<[TextSize, string]>}
                onChange={(v) => { setText(v); setTextSize(v); }}
              />
            </div>
            <div className="setting-field">
              <span>Interface size</span>
              <Seg
                value={ui}
                options={[['compact', 'COMPACT'], ['default', 'DEFAULT'], ['large', 'LARGE']] as Array<[UiSize, string]>}
                onChange={(v) => { setUi(v); setUiSize(v); }}
              />
            </div>
            <Toggle on={contrast} onChange={(v) => { setContrast(v); setHighContrast(v); }} label="High-contrast panels" />
            <button className="reset-appearance" onClick={() => { resetAppearance(); setText('md'); setUi('default'); setContrast(false); }}>
              RESET APPEARANCE
            </button>
            <p className="appearance-note">Text size scales the labels you read most. Interface size changes the side panels and timeline footprint.</p>
          </section>

          <section className="settings-card">
            <div className="settings-h">FLOW</div>
            <Toggle on={particles} onChange={setParticles} label="Wind streamlines" />
            <div className="setting-field">
              <span>Particle density</span>
              <Seg value={density} options={[[0.6, 'LOW'], [1, 'MED'], [1.6, 'HIGH']]} onChange={setDensity} />
            </div>
            <div className="setting-field">
              <span>Streamline colour</span>
              <Seg value={flowColor} options={[['speed', 'SPEED'], ['temp', 'TEMP'], ['advection', 'ADVECT']]} onChange={setFlowColor} />
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-h">NOTATION</div>
            <Toggle on={barbs} onChange={setBarbs} label="Wind barbs (station model)" />
            <Toggle on={labels} onChange={setLabels} label="City labels" />
            <Toggle on={grid} onChange={setGrid} label="Graticule" />
            <Toggle on={terminator} onChange={setTerminator} label="Day / night terminator" />
          </section>

          <section className="settings-card">
            <div className="settings-h">UNITS</div>
            <div className="setting-field">
              <span>Wind speed</span>
              <Seg value={windUnit} options={[['kmh', 'KM/H'], ['ms', 'M/S'], ['kt', 'KT']]} onChange={setWindUnit} />
            </div>
            <div className="appearance-note">
              Barbs always use knots, the meteorological convention. Temperatures are °C, pressure hPa, soil moisture m³/m³, precipitation mm/h.
            </div>
          </section>

          <section className="settings-card wide">
            <div className="settings-h">DATA</div>
            <div className="data-box">
              <div><span>RANGE</span><b>{rangeLabel} · {rangeGridLabel}</b></div>
              <div><span>SOURCE</span><b>{data?.manifest.source ?? '—'}</b></div>
              <div><span>VALID</span><b>{gen ? new Date(gen).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '—'}</b></div>
              <div><span>AGE</span><b>{gen ? ageLabel(Date.now() - gen) : '—'}</b></div>
              <div><span>ATMOS GRID</span><b>{data ? `${data.nx} × ${data.ny} · ${data.step}°` : '—'}</b></div>
              <div><span>LAND GRID</span><b>{hydro ? `${hydro.nx} × ${hydro.ny} · ${hydro.step}°` : '—'}</b></div>
              <div><span>FIELDS</span><b>{data ? `${data.manifest.fieldOrder.length} fields · ${data.manifest.frameCount} frames` : '—'}</b></div>
            </div>
            <div className="data-actions">
              <button className="reload-btn" onClick={doRefresh}>REFRESH NOW</button>
              <button className="reload-btn" onClick={() => location.reload()}>RELOAD UI</button>
            </div>
            {refreshMsg && <p className="refresh-msg">{refreshMsg}</p>}
            <p className="settings-note">The local server refreshes every 6 h and on boot when stale. You can also run <code>npm run refresh</code> from a terminal.</p>
          </section>

          <section className="settings-card wide">
            <div className="settings-h">ABOUT</div>
            <p className="credit">
              Atmosphere: <a href="https://www.ncei.noaa.gov/products/global-forecast-system" target="_blank" rel="noreferrer">NOAA GFS</a>, re-gridded by
              {' '}<a href="https://earth.nullschool.net/" target="_blank" rel="noreferrer">earth.nullschool.net</a>.
              Land &amp; hydrology: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.
              Basemap: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>.
              Rendering: Three.js / WebGL2.
            </p>
            <p className="settings-note">Bhūsmṛti is a personal, non-commercial atlas. Model output is not a forecast guarantee. Signals are heuristics.</p>
          </section>
        </div>

        <div className="settings-colophon">
          <span>Bhūsmṛti · PLANETARY FLUX ATLAS</span>
          <span>v1 · {data?.manifest.build_id ?? '—'}</span>
        </div>
      </aside>
    </div>
  );
}
