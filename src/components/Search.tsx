import { useEffect, useRef, useState } from 'react';
import { useAtmos } from '../data/store';
import { SearchIcon, CloseIcon } from './Icon';

type Hit = { id: number; name: string; latitude: number; longitude: number; country?: string; admin1?: string };

export function Search() {
  const home = useAtmos((s) => s.home);
  const setHome = useAtmos((s) => s.setHome);
  const flyTo = useAtmos((s) => s.flyTo);
  const locate = useAtmos((s) => s.locate);
  const locateState = useAtmos((s) => s.locateState);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => { setHits(d.results ?? []); setActive(0); })
        .catch(() => { /* ignore */ });
    }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (h: Hit) => {
    const loc = { lat: h.latitude, lon: h.longitude, name: h.name, country: h.country };
    setHome(loc);
    flyTo(h.latitude, h.longitude, 2.2);
    setQ('');
    setFocus(false);
    setOpen(false);
  };

  const show = focus && (hits.length > 0 || q.length >= 2);

  return (
    <div className={`search ${focus ? 'focus' : ''}`} ref={box}>
      <span className="search-ic"><SearchIcon /></span>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setFocus(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setFocus(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && hits[active]) choose(hits[active]);
        }}
        placeholder={home.name}
        aria-label="Search for a place"
        spellCheck={false}
      />
      {q && <button className="search-x" onClick={() => { setQ(''); setHits([]); }} aria-label="Clear search"><CloseIcon /></button>}
      {show && (
        <div className="search-drop glass">
          <button className="search-hit locate" onClick={() => { locate(); setFocus(false); }}>
            <span className="hit-dot" />
            <span><b>Use my location</b><em>{locateState === 'locating' ? 'locating…' : 'browser geolocation'}</em></span>
          </button>
          {hits.map((h, i) => (
            <button key={h.id} className={`search-hit ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(h)}>
              <span className="hit-dot" />
              <span><b>{h.name}</b><em>{[h.admin1, h.country].filter(Boolean).join(' · ')}</em></span>
            </button>
          ))}
          {hits.length === 0 && q.length >= 2 && <div className="search-empty">no places found</div>}
        </div>
      )}
    </div>
  );
}
