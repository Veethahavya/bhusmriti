import { useAtmos } from '../data/store';
import { LAYER_BY_ID, formatValue } from '../data/catalog';
import { Icon } from './Icon';

export function VarInfo() {
  const id = useAtmos((s) => s.varInfo);
  const setVarInfo = useAtmos((s) => s.setVarInfo);
  const setPanel = useAtmos((s) => s.setPanel);
  const def = id ? LAYER_BY_ID[id] : null;
  if (!def) return null;
  return (
    <div className="var-info-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setVarInfo(null); }}>
      <aside className="var-info-card glass" role="dialog" aria-modal="true" aria-label={`${def.label} explanation`}>
        <div className="var-info-head">
          <span className="var-info-ic"><Icon name={def.glyph} size={17} /></span>
          <div>
            <div className="eyebrow">VARIABLE</div>
            <div className="var-info-title">{def.label}</div>
            <div className="var-info-sub">{def.sub} · {def.unit}</div>
          </div>
          <button className="icon-btn" onClick={() => setVarInfo(null)} aria-label="Close variable info">×</button>
        </div>
        <p className="var-info-desc">{def.description}</p>
        <div className="var-info-read"><span>READ IT AS</span>{def.read}</div>
        <div className="var-info-meta">
          <span>RANGE</span><b>{formatValue(def, def.range[0])} — {formatValue(def, def.range[1])}</b>
          <span>DISPLAY</span><b>{def.lineOnly ? 'isolines only' : 'fill, isolines or flow'}</b>
        </div>
        <div className="var-info-actions">
          <button onClick={() => { setVarInfo(null); setPanel('info'); }}>OPEN FIELD GUIDE →</button>
          <button onClick={() => setVarInfo(null)}>CLOSE</button>
        </div>
      </aside>
    </div>
  );
}
