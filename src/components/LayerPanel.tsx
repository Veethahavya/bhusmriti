import { useState } from 'react';
import { useAtmos } from '../data/store';
import { GROUPS, LAYERS } from '../data/catalog';
import { Icon, CloseIcon, InfoIcon } from './Icon';

export function LayerPanel() {
  const panel = useAtmos((s) => s.panel);
  const fill = useAtmos((s) => s.fillLayer);
  const lines = useAtmos((s) => s.lineLayers);
  const flow = useAtmos((s) => s.flowLayer);
  const selected = useAtmos((s) => s.selected);
  const particles = useAtmos((s) => s.particles);
  const barbs = useAtmos((s) => s.barbs);
  const toggleLayer = useAtmos((s) => s.toggleLayer);
  const setMode = useAtmos((s) => s.setMode);
  const clearOverlays = useAtmos((s) => s.clearOverlays);
  const setPanel = useAtmos((s) => s.setPanel);
  const setSelected = useAtmos((s) => s.setSelected);
  const setParticles = useAtmos((s) => s.setParticles);
  const setBarbs = useAtmos((s) => s.setBarbs);
  const setVarInfo = useAtmos((s) => s.setVarInfo);
  const visualMode = useAtmos((s) => s.visualMode);
  const setVisualMode = useAtmos((s) => s.setVisualMode);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const data = useAtmos((s) => s.data);
  const DERIVED = new Set(['adv_temp', 'adv_moist', 'div10', 'ptend3', 'dtd']);
  const available = (l: typeof LAYERS[number]) => !data || !l.field || data.has(l.field) || DERIVED.has(l.id);

  if (panel !== 'layers') return null;
  const activeCount = (fill ? 1 : 0) + lines.length + (flow ? 1 : 0);

  return (
    <aside className="layer-panel glass">
      <div className="panel-head">
        <div>
          <div className="eyebrow">FIELD LAYERS</div>
          <div className="panel-title">Read the flow</div>
        </div>
        <div className="panel-head-right">
          <span className="count">{activeCount} ON</span>
          <button className="icon-btn" onClick={() => setPanel('info')} aria-label="Field guide" title="What do these fields mean?"><InfoIcon /></button>
          <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close layers"><CloseIcon /></button>
        </div>
      </div>

      <div className="quick-row">
        <button className={`quick ${particles ? 'on' : ''}`} onClick={() => setParticles(!particles)}>
          <span className="qdot" /> PARTICLES
        </button>
        <button
          className={`quick ${barbs ? 'on' : ''}`}
          onClick={() => setBarbs(!barbs)}
          title="Station-model wind barbs. Staff points from where the wind comes; half feather = 5 kt, full = 10 kt, triangle = 50 kt."
        >
          <span className="qdot" /> WIND BARBS
        </button>
        <button className={`quick ${visualMode === 'smoke' ? 'on' : ''}`} onClick={() => setVisualMode(visualMode === 'smoke' ? 'atlas' : 'smoke')} title="Toggle realistic wind-smoke view">
          <span className="qdot" /> SMOKE
        </button>
        <button className="quick ghost" onClick={clearOverlays}>CLEAR</button>
      </div>

      {barbs && (
        <button className="barb-key" onClick={() => setPanel('info')}>
          <span>WIND BARBS</span> half = 5 kt · full = 10 kt · pennant = 50 kt <b>guide →</b>
        </button>
      )}

      {visualMode === 'smoke' && (
        <div className="smoke-note">
          <b>SMOKE VIEW</b>
          Colour = temperature · density = pressure · motion = active wind level. Fill/line fields are suppressed.
        </div>
      )}

      {data?.manifest.atmosphereOnly && (
        <div className="archive-note">
          <b>5-MONTH ARCHIVE · ATMOSPHERE FIELDS ONLY</b>
          Land &amp; hydrology remain available on 24 h / 7 d / 30 d.
        </div>
      )}

      <div className="layer-scroll">
        {GROUPS.map((g) => {
          const items = LAYERS.filter((l) => l.group === g.id);
          const isClosed = closed[g.id];
          return (
            <section className="group" key={g.id}>
              <button className="group-head" onClick={() => setClosed({ ...closed, [g.id]: !isClosed })}>
                <span className="group-name">{g.label}</span>
                <span className="group-hint">{g.hint}</span>
                <span className={`chev ${isClosed ? '' : 'open'}`}>⌄</span>
              </button>
              {!isClosed && items.map((l) => {
                const isFill = fill === l.id;
                const isLine = lines.includes(l.id);
                const isFlow = flow === l.id;
                const active = isFill || isLine || isFlow;
                const flowBlocked = l.kind === 'flow' && !!flow && flow !== l.id;
                const smokeBlocked = visualMode === 'smoke' && l.kind !== 'flow';
                const ok = available(l) && !flowBlocked && !smokeBlocked;
                const fillBusy = !!fill && fill !== l.id;
                return (
                  <div key={l.id} className={`layer-item ${active ? 'active' : ''} ${selected === l.id ? 'selected' : ''} ${available(l) ? '' : 'unavailable'} ${flowBlocked || smokeBlocked ? 'blocked' : ''}`}>
                    <button
                      className="layer-main"
                      onClick={() => { if (!ok) return; toggleLayer(l.id); setSelected(l.id); }}
                      disabled={!ok}
                      title={flowBlocked ? `${l.label} — remove the active flow layer first` : smokeBlocked ? `${l.label} — switch to ATLAS to edit this layer` : available(l) ? `${l.label} — ${l.description}` : `${l.label} — not in the long atmosphere archive`}
                    >
                      <span className="layer-ic"><Icon name={l.glyph} size={15} /></span>
                      <span className="layer-txt">
                        <span className="layer-name">{l.short}</span>
                        <span className="layer-sub">{l.sub}</span>
                      </span>
                      <span className={`layer-badge ${isFill ? 'fill' : isLine ? 'line' : isFlow ? 'flow' : ''}`}>
                        {isFill ? 'FILL' : isLine ? 'LINE' : isFlow ? 'FLOW' : '+'}
                      </span>
                    </button>
                    {ok && active && !l.lineOnly && l.kind !== 'flow' && (
                      <div className="mode-switch">
                        <button
                          className={`${isFill ? 'on' : ''} ${fillBusy ? 'blocked' : ''}`}
                          disabled={fillBusy}
                          title={fillBusy ? 'Another field already owns the colour wash' : 'Use this field as the colour wash'}
                          onClick={() => setMode(l.id, 'fill')}
                        >FILL</button>
                        <button className={isLine ? 'on' : ''} onClick={() => setMode(l.id, 'line')}>LINES</button>
                        <button className="var-info-btn" onClick={() => setVarInfo(l.id)} title={`About ${l.label}`} aria-label={`About ${l.label}`}>i</button>
                      </div>
                    )}
                    {ok && active && (l.lineOnly || l.kind === 'flow') && (
                      <div className="mode-switch info-only">
                        <button className="var-info-btn" onClick={() => setVarInfo(l.id)} title={`About ${l.label}`} aria-label={`About ${l.label}`}>i</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <div className="panel-foot">
        <span className="foot-rule" />
        <span>ONE FIELD AS A WASH · EVERYTHING ELSE AS LINEWORK</span>
      </div>
    </aside>
  );
}
