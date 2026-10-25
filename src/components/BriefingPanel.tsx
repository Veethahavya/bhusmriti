import { useAtmos } from '../data/store';
import { useBrief } from '../data/useBrief';
import { windDirLabel } from '../data/brief';
import { formatLat, formatLon } from '../lib/geo';
import { CloseIcon } from './Icon';
import { Sparkline, WindRoseSvg } from './MiniCharts';

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

function fmt(v: number, d = 1, suffix = ''): string {
  return Number.isFinite(v) ? `${v.toFixed(d)}${suffix}` : '—';
}

export function BriefingPanel() {
  const panel = useAtmos((s) => s.panel);
  const setPanel = useAtmos((s) => s.setPanel);
  const home = useAtmos((s) => s.home);
  const play = useAtmos((s) => s.play);
  const locate = useAtmos((s) => s.locate);
  const locateState = useAtmos((s) => s.locateState);
  const data = useAtmos((s) => s.data);
  const { brief, series, loading, error } = useBrief();
  if (panel !== 'briefing') return null;

  const hour = new Date().getHours();
  const greet = hour < 5 ? 'GOOD NIGHT' : hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const t0 = brief && series ? Math.max(0, brief.index - 24) : 0;
  const sl = (a: number[]) => (series ? a.slice(t0, (brief?.index ?? a.length - 1) + 1) : []);

  return (
    <div className="briefing-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
      <aside className="briefing-panel glass">
        <div className="briefing-head">
          <div>
            <div className="eyebrow">{greet} · {home.name.toUpperCase()}</div>
            <h2>{brief?.headline ?? 'Reading the local atmosphere…'}</h2>
            <div className="briefing-place">
              {formatLat(home.lat)} · {formatLon(home.lon)}
              {brief && <> · {timeFmt.format(new Date(brief.time))}</>}
              {data && <> · AS OF {new Date(data.generatedAt).toISOString().slice(11, 16)}Z</>}
            </div>
          </div>
          <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close briefing"><CloseIcon /></button>
        </div>

        {loading && !brief ? (
          <div className="briefing-loading"><i /><i /><i /><i /></div>
        ) : brief ? (
          <>
            <div className="signals">
              {brief.signals.length ? brief.signals.slice(0, 5).map((s, i) => (
                <span key={i} className={`signal ${s.tone}`} title={s.detail}>
                  <i />{s.label}
                </span>
              )) : <span className="signal calm"><i />No strong signals</span>}
            </div>

            <div className="brief-grid">
              <div className="bstat">
                <span>TEMPERATURE</span>
                <b>{fmt(brief.temp, 1, '°')}</b>
                <em>{fmt(brief.tempMin, 0, '°')} — {fmt(brief.tempMax, 0, '°')} · 24 h</em>
              </div>
              <div className="bstat">
                <span>WIND</span>
                <b>{fmt(brief.wind, 0, '')}<small> km/h</small></b>
                <em>from {windDirLabel(brief.dir)} · gust {fmt(brief.gust, 0, '')}</em>
              </div>
              <div className="bstat">
                <span>PRESSURE</span>
                <b>{fmt(brief.pressure, 0, '')}<small> hPa</small></b>
                <em className={brief.ptend3 < 0 ? 'warn' : 'good'}>{brief.ptend3 > 0 ? '+' : ''}{fmt(brief.ptend3, 1, '')} hPa / 3 h</em>
              </div>
              <div className="bstat">
                <span>DEW POINT</span>
                <b>{fmt(brief.dew, 1, '°')}</b>
                <em>depression {fmt(brief.dtd, 1, '°')} · RH {fmt(brief.rh, 0, '%')}</em>
              </div>
              <div className="bstat">
                <span>RAIN · 24 H</span>
                <b>{fmt(brief.precip24, 1, '')}<small> mm</small></b>
                <em>ET₀ {fmt(brief.et24, 1, '')} mm · VPD {fmt(brief.vpd, 2, '')} kPa</em>
              </div>
              <div className="bstat">
                <span>SOIL · 0–7 CM</span>
                <b>{fmt(brief.soil, 2, '')}</b>
                <em>{brief.soilTrend > 0 ? 'wetting' : 'drying'} {Math.abs(brief.soilTrend * 100).toFixed(1)}% / 24 h</em>
              </div>
              <div className="bstat">
                <span>CONVERGENCE</span>
                <b>{fmt(brief.convergence, 1, '')}<small> ×10⁻⁵</small></b>
                <em>surface wind · {brief.convergence > 0.5 ? 'lifting' : 'neutral / divergent'}</em>
              </div>
              <div className="bstat">
                <span>CAPE</span>
                <b>{fmt(brief.cape, 0, '')}<small> J/kg</small></b>
                <em>cloud {fmt(brief.cloud, 0, '%')} · {brief.cape > 1200 ? 'unstable' : 'stable'}</em>
              </div>
            </div>

            <div className="brief-charts">
              <div className="chart">
                <div className="chart-head"><span>TEMPERATURE · 24 H</span><b>{fmt(brief.temp, 1, '°C')}</b></div>
                <Sparkline values={sl(series!.temperature)} color="#ffb26b" width={300} height={36} />
              </div>
              <div className="chart">
                <div className="chart-head"><span>PRESSURE · 24 H</span><b>{fmt(brief.pressure, 0, ' hPa')}</b></div>
                <Sparkline values={sl(series!.pressure)} color="#74b9ff" width={300} height={36} />
              </div>
              <div className="chart">
                <div className="chart-head"><span>WIND · 24 H</span><b>{fmt(brief.wind, 0, ' km/h')}</b></div>
                <Sparkline values={sl(series!.wind)} color="#5eead4" width={300} height={36} />
              </div>
            </div>

            <div className="brief-rose">
              <WindRoseSvg rose={brief.rose} size={128} />
              <div>
                <div className="eyebrow">WIND ROSE · 24 H</div>
                <p>The petals show where the wind has been coming from and how strong it has been. A shift in the dominant petal is often the first sign of a changing air mass.</p>
              </div>
            </div>

            <div className="briefing-actions">
              <button className="primary" onClick={() => { play(); setPanel(null); }}>PLAY THE LAST 24 H <span>▶</span></button>
              <button onClick={() => locate()}>{locateState === 'locating' ? 'LOCATING…' : 'USE MY LOCATION'}</button>
              <button onClick={() => setPanel(null)}>CLOSE</button>
            </div>
            <p className="briefing-note">
              Signals are heuristic readings of the model analysis and 24 h fluxes. They are designed to focus attention, not to replace a forecast.
              {error ? ' Local sounding unavailable; showing the model grid.' : ''}
            </p>
          </>
        ) : (
          <div className="briefing-loading">
            <p>No local sounding available.</p>
            <button className="primary" onClick={() => setPanel(null)}>BACK TO THE GLOBE</button>
          </div>
        )}
      </aside>
    </div>
  );
}
