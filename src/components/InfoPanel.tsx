import { useAtmos } from '../data/store';
import { CloseIcon } from './Icon';

function BarbSketch() {
  return (
    <svg viewBox="0 0 260 92" className="barb-sketch" aria-label="Wind barb key">
      <g stroke="rgba(150,235,220,0.75)" strokeWidth="1.3" strokeLinecap="round" fill="none">
        <line x1="30" y1="80" x2="30" y2="18" />
        <line x1="30" y1="18" x2="40" y2="24" />
        <line x1="105" y1="80" x2="105" y2="18" />
        <line x1="105" y1="18" x2="119" y2="28" />
        <line x1="105" y1="27" x2="119" y2="37" />
        <path d="M180 80 V18 L200 28 L180 38 Z" fill="rgba(150,235,220,0.35)" />
        <circle cx="30" cy="80" r="2" fill="#5eead4" stroke="none" />
        <circle cx="105" cy="80" r="2" fill="#5eead4" stroke="none" />
        <circle cx="180" cy="80" r="2" fill="#5eead4" stroke="none" />
      </g>
      <g fill="rgba(220,245,242,0.8)" fontFamily="JetBrains Mono, monospace" fontSize="7" textAnchor="middle">
        <text x="30" y="90">5 kt · half</text>
        <text x="105" y="90">10 kt · full</text>
        <text x="180" y="90">50 kt · pennant</text>
      </g>
    </svg>
  );
}

export function InfoPanel() {
  const panel = useAtmos((s) => s.panel);
  const setPanel = useAtmos((s) => s.setPanel);
  if (panel !== 'info') return null;
  return (
    <div className="info-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
      <aside className="info-panel glass">
        <div className="info-head">
          <div>
            <div className="eyebrow">FIELD GUIDE</div>
            <h2>How to read this globe</h2>
            <p>Every mark is a real model field. Here is the grammar.</p>
          </div>
          <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close field guide"><CloseIcon /></button>
        </div>

        <div className="info-grid">
          <section className="info-card wide">
            <div className="info-kicker">01 · PRESSURE LEVELS ARE ALTITUDE</div>
            <h3>Why 850, 500 and 250 hPa?</h3>
            <p>
              Weather models describe the atmosphere on surfaces of constant pressure, measured in hectopascals (hPa).
              Lower pressure means higher altitude. Bhūsmṛti labels the approximate altitude so you can read the level in plain language:
            </p>
            <div className="level-table">
              <div><b>10 m</b><span>Surface wind · what you feel, the flow that converges, gusts and sea breezes.</span></div>
              <div><b>850 hPa</b><span>≈ 1.5 km · the low-level jet and warm, moist conveyor that feeds storms.</span></div>
              <div><b>500 hPa</b><span>≈ 5.5 km · steering flow. Troughs and ridges here decide where surface lows develop.</span></div>
              <div><b>250 hPa</b><span>≈ 10.5 km · the jet stream. Ribbons of fast wind steer cyclones and storm tracks.</span></div>
            </div>
          </section>

          <section className="info-card">
            <div className="info-kicker">02 · WIND NOTATION</div>
            <h3>Streamlines and barbs</h3>
            <p>
              <b>Particles</b> trace the flow. Their tails follow the wind and fade with time; colour can encode speed, temperature or thermal advection.
              Denser, faster streams mean a stronger flow. Watch where streams bunch, split or curve sharply.
            </p>
            <p>
              <b>Barbs</b> are the standard station-model shorthand. The staff points toward the direction the wind is coming <i>from</i>;
              the feathers at the end encode speed in knots: a half feather is 5 kt, a full feather 10 kt, a triangle 50 kt.
            </p>
            <BarbSketch />
          </section>

          <section className="info-card">
            <div className="info-kicker">03 · ONE WASH + LINEWORK</div>
            <h3>Why only one fill?</h3>
            <p>
              Bhūsmṛti deliberately allows one field as a colour wash and renders every additional field as linework, glyphs or flow.
              That is how a synoptic chart stays readable: temperature as a wash, pressure as isobars, wind as streamlines.
            </p>
            <p>
              <b>Isobars</b> are lines of equal mean sea-level pressure, drawn every 8 hPa, with <span className="h-l">H</span> and <span className="l-l">L</span> centres.
              <b>Isotherms</b> are temperature contours — switch a temperature layer from <b>FILL</b> to <b>LINES</b>.
              Tight spacing means a strong gradient and usually a front or a jet.
            </p>
          </section>

          <section className="info-card">
            <div className="info-kicker">04 · FLUXES THAT HELP PREDICTION</div>
            <h3>Read the derivatives</h3>
            <p>
              <b>Temperature advection</b> (red/blue) is wind carrying warmer or colder air. <b>Moisture advection</b> is the same for water vapour.
              <b>Convergence</b> is surface air piling up and being forced upward. <b>Pressure tendency</b> is the 3 h change in MSLP:
              falling pressure means weather is organising.
            </p>
            <p>
              The most useful pattern is a coincidence: <em>moist advection + convergence + falling pressure</em> ahead of a trough.
              That is where cloud and rain are most likely to develop next.
            </p>
          </section>

          <section className="info-card wide">
            <div className="info-kicker">05 · VARIABLE GLOSSARY</div>
            <h3>The short version</h3>
            <div className="glossary">
              <div><b>SM</b><span>Soil moisture, volumetric water in the topsoil. Wet soil feeds evaporation and can stabilise or destabilise the boundary layer.</span></div>
              <div><b>ET₀</b><span>Reference evapotranspiration. The atmosphere's drying pull on a well-watered surface.</span></div>
              <div><b>VPD</b><span>Vapour pressure deficit. The gap between saturation and reality; high VPD dries land and plants.</span></div>
              <div><b>CAPE</b><span>Convective available potential energy. Fuel for thunderstorms — but it needs a trigger.</span></div>
              <div><b>PW</b><span>Precipitable water. Total vapour in a column; the reservoir for heavy rain.</span></div>
              <div><b>ω 500</b><span>Vertical motion at 500 hPa. Blue is rising (cloud/rain), orange is sinking (clearing).</span></div>
              <div><b>Z500</b><span>Geopotential height of the 500 hPa surface. The shape of ridges and troughs.</span></div>
              <div><b>SST</b><span>Sea-surface temperature. The ocean's slow thermostat and fuel for tropical systems.</span></div>
              <div><b>T − Td</b><span>Dew-point depression. Small values mean saturation is close: fog, low cloud, drizzle.</span></div>
              <div><b>ΔP 3 h</b><span>Pressure tendency over three hours. Falling pressure is the classic short-term deterioration signal.</span></div>
            </div>
          </section>

          <section className="info-card wide">
            <div className="info-kicker">06 · TIME, DATA & HONESTY</div>
            <h3>A 24-hour model reconstruction</h3>
            <p>
              The timeline holds 25 hourly frames ending at the latest GFS analysis. Play it to see the flow evolve, or scrub to a moment.
              Atmosphere fields are NOAA GFS at 1°; land and hydrology fields are Open-Meteo at 2° (7.5° source, upsampled).
              The briefing is a heuristic reading of the local sounding, not a forecast guarantee.
            </p>
            <p>
              The full globe is fixed at the centre of the screen. Drag to spin it, scroll or pinch to descend, and use the hand button to
              turn spin on or off. The small altitude gauge shows how far you have descended.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
