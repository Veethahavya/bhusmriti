import { useAtmos } from '../data/store';
import { LAYER_BY_ID, formatValue } from '../data/catalog';
import { rgbaCss, samplePalette } from '../lib/color';
import { formatLat, formatLon } from '../lib/geo';

export function HUD() {
  const probe = useAtmos((s) => s.probe);
  const windUnit = useAtmos((s) => s.windUnit);
  if (!probe) return null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const h = typeof window !== 'undefined' ? window.innerHeight : 900;
  const left = Math.max(10, Math.min(w - 270, probe.x + 18));
  const top = Math.max(76, Math.min(h - 230, probe.y + 18));

  return (
    <div className="hud glass" style={{ left, top }}>
      <div className="hud-head">
        <span>PROBE</span>
        <span className="hud-coord">{formatLat(probe.lat)} · {formatLon(probe.lon)}</span>
      </div>
      <div className="hud-rows">
        {probe.values.slice(0, 7).map(({ id, value }) => {
          const def = LAYER_BY_ID[id];
          if (!def) return null;
          const t = Math.max(0, Math.min(1, (value - def.range[0]) / (def.range[1] - def.range[0])));
          return (
            <div className="hud-row" key={id}>
              <i style={{ background: rgbaCss(samplePalette(def.palette, t)) }} />
              <span>{def.short}</span>
              <b>{formatValue(def, value, windUnit)}</b>
            </div>
          );
        })}
        {probe.values.length === 0 && <div className="hud-empty">no active fields</div>}
      </div>
      <div className="hud-foot">SCROLL / PINCH TO ZOOM · DRAG TO SPIN</div>
    </div>
  );
}
