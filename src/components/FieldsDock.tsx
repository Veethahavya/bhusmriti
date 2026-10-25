import { useAtmos } from '../data/store';
import { Icon, InfoIcon, GearIcon } from './Icon';

export function FieldsDock() {
  const panel = useAtmos((s) => s.panel);
  const setPanel = useAtmos((s) => s.setPanel);
  const active = panel === 'layers';
  return (
    <div className="fields-dock">
      <button className={`fields-tab ${active ? 'on' : ''}`} onClick={() => setPanel(active ? null : 'layers')}>
        <Icon name="wind" size={14} />
        <span>FIELDS</span>
      </button>
      <button className="info-tab" onClick={() => setPanel('info')} title="Field guide — what do these variables mean?">
        <InfoIcon />
      </button>
      <button className="info-tab" onClick={() => setPanel('settings')} title="Settings" aria-label="Settings">
        <GearIcon />
      </button>
    </div>
  );
}
