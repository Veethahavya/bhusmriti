import { useAtmos } from '../data/store';
import { useNow, ageLabel } from '../lib/useNow';
import { Search } from './Search';
import { GearIcon } from './Icon';
import { RangeMenu } from './RangeMenu';

export function TopBar() {
  const data = useAtmos((s) => s.data);
  const panel = useAtmos((s) => s.panel);
  const setPanel = useAtmos((s) => s.setPanel);
  const now = useNow(30000);
  const gen = data?.generatedAt ?? 0;
  const age = now - gen;
  const hot = age > 8 * 3600000;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><span /><span /><span /></div>
        <div>
          <div className="brand-name">BHŪSMRTI</div>
          <div className="brand-sub">PLANETARY FLUX ATLAS</div>
        </div>
      </div>

      <div className="topbar-mid">
        <div className="range-topbar"><RangeMenu /></div>
        {data && (
          <span className={`data-chip ${hot ? 'warn' : ''}`} title={`Data generated ${new Date(gen).toISOString()}`}>
            {new Date(gen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}Z
            <i>·</i>{ageLabel(age)}
          </span>
        )}
      </div>

      <div className="topbar-right">
        <Search />
        <button className={`tbtn ${panel === 'briefing' ? 'on' : ''}`} onClick={() => setPanel(panel === 'briefing' ? null : 'briefing')}>
          BRIEFING
        </button>
        <button
          className={`tbtn settings-btn ${panel === 'settings' ? 'on' : ''}`}
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
          aria-label="Settings"
          title="Open settings"
        >
          <GearIcon />
          <span>SETTINGS</span>
        </button>
      </div>
    </header>
  );
}
