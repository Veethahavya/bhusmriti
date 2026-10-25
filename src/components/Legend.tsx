import { useAtmos } from '../data/store';
import { LAYER_BY_ID, formatValue } from '../data/catalog';
import { paletteCssGradient, rgbaCss, samplePalette } from '../lib/color';
import { useBrief } from '../data/useBrief';
import { windDirLabel } from '../data/brief';
import { Icon } from './Icon';
import { WindRoseSvg } from './MiniCharts';

function currentValue(id: string, home: { lat: number; lon: number }): number {
  const s = useAtmos.getState();
  const def = LAYER_BY_ID[id];
  if (!def || !s.data) return NaN;
  const t = Math.round(s.frame);
  const { lat, lon } = home;
  if (def.kind === 'derived' && def.derived && s.derived) {
    const arr = s.derived.get(def.derived, t);
    return s.data.bilinear(arr, 0, lon, lat, s.data.gridForDerived(def.derived));
  }
  if (def.field) return s.data.sample(def.field, t, lon, lat);
  return NaN;
}

export function LegendCard() {
  const selected = useAtmos((s) => s.selected);
  const data = useAtmos((s) => s.data);
  const frame = useAtmos((s) => s.frame);
  const opacity = useAtmos((s) => s.opacity);
  const setOpacity = useAtmos((s) => s.setOpacity);
  const setSelected = useAtmos((s) => s.setSelected);
  const setVarInfo = useAtmos((s) => s.setVarInfo);
  const removeLayer = useAtmos((s) => s.removeLayer);
  const setMode = useAtmos((s) => s.setMode);
  const windUnit = useAtmos((s) => s.windUnit);
  const home = useAtmos((s) => s.home);
  const fill = useAtmos((s) => s.fillLayer);
  const lines = useAtmos((s) => s.lineLayers);
  const flow = useAtmos((s) => s.flowLayer);

  const def = LAYER_BY_ID[selected] ?? LAYER_BY_ID.temp2m;
  const active = fill === def.id || lines.includes(def.id) || flow === def.id;
  const mode = fill === def.id ? 'fill' : lines.includes(def.id) ? 'line' : flow === def.id ? 'flow' : null;
  const v = currentValue(def.id, home);
  const norm = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - def.range[0]) / (def.range[1] - def.range[0]))) : 0;
  const op = opacity[def.id] ?? def.defaultOpacity;
  const grid = data
    ? (def.derived ? data.gridForDerived(def.derived) : data.gridFor(def.field ?? 'temperature_2m'))
    : null;

  return (
    <div className="legend-card glass">
      <div className="legend-head">
        <span className="legend-ic"><Icon name={def.glyph} size={16} /></span>
        <div>
          <div className="eyebrow">{def.group.toUpperCase()} · {mode ? mode.toUpperCase() : 'AVAILABLE'}</div>
          <div className="legend-title">{def.label}</div>
        </div>
        <div className="legend-unit">{def.unit}</div>
        <button className="legend-info" onClick={() => setVarInfo(def.id)} title={`About ${def.label}`} aria-label={`About ${def.label}`}>i</button>
      </div>
      <div className="legend-sub">{def.sub}</div>

      {def.lineOnly ? (
        <div className="line-legend">
          <span className="line-swatch" style={{ borderColor: def.contourColor ?? '#9fe8dc' }} />
          <span>ISOBARS EVERY {def.contour} {def.unit}</span>
        </div>
      ) : (
        <div className="ramp-wrap">
          <div className="ramp" style={{ background: paletteCssGradient(def.palette) }} />
          <div className="ramp-ticks">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <span key={t}>{formatValue(def, def.range[0] + t * (def.range[1] - def.range[0]), windUnit).replace(` ${def.unit}`, '')}</span>
            ))}
          </div>
          {def.oceanPalette && (
            <div className="ocean-ramp">
              <span>OCEAN</span>
              <i style={{ background: paletteCssGradient(def.oceanPalette) }} />
            </div>
          )}
        </div>
      )}

      <div className="legend-now">
        <span className="now-dot" style={{ background: rgbaCss(samplePalette(def.palette, norm)) }} />
        <span className="now-label">AT HOME</span>
        <span className="now-val">{formatValue(def, v, windUnit)}</span>
      </div>

      {def.contour ? (
        <div className="legend-meta">
          <span>ISOLINES</span><b>every {def.contour} {def.unit}</b>
          <span>GRID</span><b>{grid ? `${grid.nx}×${grid.ny} · ${grid.step}°` : '—'}</b>
        </div>
      ) : (
        <div className="legend-meta">
          <span>RENDER</span><b>{def.pattern ? 'shaded texture' : 'smooth field'}</b>
          <span>GRID</span><b>{grid ? `${grid.nx}×${grid.ny} · ${grid.step}°` : '—'}</b>
        </div>
      )}

      <p className="legend-desc">{def.description}</p>
      <div className="legend-read"><span>READ IT AS</span>{def.read}</div>

      {active && (
        <div className="legend-controls">
          {!def.lineOnly && def.kind !== 'flow' && (
            <div className="mini-seg">
              <button className={mode === 'fill' ? 'on' : ''} onClick={() => setMode(def.id, 'fill')}>FILL</button>
              <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode(def.id, 'line')}>LINES</button>
            </div>
          )}
          <div className="opacity">
            <span>OPACITY</span>
            <input type="range" min="0.1" max="1" step="0.05" value={op} onChange={(e) => setOpacity(def.id, parseFloat(e.target.value))} />
          </div>
        </div>
      )}

      <div className="overlay-chips">
        {fill && <Chip id={fill} mode="fill" onSelect={setSelected} onRemove={removeLayer} />}
        {lines.map((id) => <Chip key={id} id={id} mode="line" onSelect={setSelected} onRemove={removeLayer} />)}
        {flow && <Chip id={flow} mode="flow" onSelect={setSelected} onRemove={removeLayer} />}
        {!fill && !lines.length && !flow && <span className="no-overlays">no fields on the globe — pick one from FIELDS</span>}
      </div>
    </div>
  );
}

function Chip({ id, mode, onSelect, onRemove }: { id: string; mode: 'fill' | 'line' | 'flow'; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
  const def = LAYER_BY_ID[id];
  if (!def) return null;
  return (
    <span className={`overlay-chip ${mode}`} onClick={() => onSelect(id)}>
      <i style={{ background: rgbaCss(samplePalette(def.palette, 0.7)) }} />
      <b>{def.short}</b>
      <em>{mode === 'fill' ? 'FILL' : mode === 'line' ? 'LINE' : 'FLOW'}</em>
      <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} aria-label={`Remove ${def.label}`}>×</button>
    </span>
  );
}

export function BriefCard() {
  const home = useAtmos((s) => s.home);
  const setPanel = useAtmos((s) => s.setPanel);
  const { brief, loading } = useBrief();
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'LATE NIGHT' : hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';

  return (
    <div className="brief-card glass">
      <div className="brief-top">
        <div>
          <div className="eyebrow">{greet}</div>
          <div className="brief-place">{home.name.toUpperCase()}</div>
        </div>
        <WindRoseSvg rose={brief?.rose ?? []} size={54} />
      </div>
      {loading && !brief ? (
        <div className="brief-skeleton"><i /><i /><i /></div>
      ) : brief ? (
        <>
          <p className="brief-headline">{brief.headline}</p>
          <div className="brief-stats">
            <div><span>WIND</span><b>{Number.isFinite(brief.wind) ? Math.round(brief.wind) : '—'}<em>km/h</em></b><i>{windDirLabel(brief.dir)}</i></div>
            <div><span>ΔP 3H</span><b className={brief.ptend3 < 0 ? 'warn' : 'good'}>{brief.ptend3 > 0 ? '+' : ''}{Number.isFinite(brief.ptend3) ? brief.ptend3.toFixed(1) : '—'}<em>hPa</em></b><i>{brief.ptend3 < 0 ? 'falling' : 'rising'}</i></div>
            <div><span>RAIN 24H</span><b>{Number.isFinite(brief.precip24) ? brief.precip24.toFixed(1) : '—'}<em>mm</em></b><i>model</i></div>
          </div>
          <button className="brief-open" onClick={() => setPanel('briefing')}>OPEN BRIEFING <span>→</span></button>
        </>
      ) : (
        <p className="brief-headline dim">Local sounding unavailable. The globe still carries the signal.</p>
      )}
    </div>
  );
}

export function EarthLegend() {
  const setMode = useAtmos((s) => s.setVisualMode);
  return (
    <div className="legend-card earth-legend glass">
      <div className="legend-head">
        <span className="legend-ic"><Icon name="wind" size={16} /></span>
        <div>
          <div className="eyebrow">SATELLITE · EARTH</div>
          <div className="legend-title">Earth winds &amp; ocean</div>
        </div>
        <div className="legend-unit">live</div>
      </div>
      <div className="legend-sub">NASA Blue Marble · wind gusts · SST water</div>
      <p className="legend-desc">A satellite view of the planet with wind-gust arrows that dissolve into animated smoke, and a translucent ocean whose colour is sea-surface temperature. The ocean current drives the water motion; the arrows show the active flow.</p>
      <div className="earth-keys">
        <span><i className="k-wind" /> WIND SPEED</span>
        <span><i className="k-ocean" /> SEA TEMP</span>
        <span><i className="k-cloud" /> CURRENT</span>
      </div>
      <div className="legend-meta">
        <span>IMAGERY</span><b>NASA Blue Marble</b>
        <span>FLUX CLOUDS</span><b>cover · rain · CAPE</b>
      </div>
      <button className="brief-open" onClick={() => setMode('globe')}>BACK TO GLOBE <span>→</span></button>
    </div>
  );
}

export function RightRail() {
  const panel = useAtmos((s) => s.panel);
  const visualMode = useAtmos((s) => s.visualMode);
  if (panel === 'briefing' || panel === 'settings') return null;
  return <aside className="right-rail">{visualMode === 'earth' ? <EarthLegend /> : <LegendCard />}<BriefCard /></aside>;
}
