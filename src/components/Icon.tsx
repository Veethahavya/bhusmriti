import type { ReactNode } from 'react';
import type { GlyphId } from '../data/types';

const P: Record<GlyphId, ReactNode> = {
  wind: <><path d="M3 8h9a3 3 0 1 0-3-3" /><path d="M3 12h14a3 3 0 1 1-3 3" /><path d="M3 16h7" /></>,
  jet: <><path d="M3 16c4 0 5-7 9-7 3 0 4 2 6 2" /><path d="M16 9l3 2-2 3" /><path d="M4 19h5" /></>,
  temp: <><path d="M10 14V5a2 2 0 1 1 4 0v9" /><path d="M12 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="M12 11v6" /></>,
  'temp-high': <><path d="M9 13V5a2 2 0 1 1 4 0v8" /><circle cx="11" cy="17" r="3" /><path d="M17 6h4M17 10h3M17 14h4" /></>,
  surface: <><circle cx="12" cy="12" r="7" /><path d="M5 12h14" /><path d="M7 16c2-2 8-2 10 0" /></>,
  rh: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /><path d="M9 14a3 3 0 0 0 3 3" /></>,
  dew: <><path d="M12 3s5 5.5 5 10a5 5 0 0 1-10 0c0-4.5 5-10 5-10Z" /><circle cx="12" cy="15" r="1.4" /></>,
  vpd: <><path d="M8 3s4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 4-8 4-8Z" /><path d="M17 20V8" /><path d="M14 11l3-3 3 3" /></>,
  rain: <><path d="M6 14a4 4 0 0 1 .8-7.9A5 5 0 0 1 17 7a3.5 3.5 0 0 1 .4 7" /><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" /></>,
  cloud: <><path d="M6 16a4 4 0 0 1 .8-7.9A5 5 0 0 1 17 9a3.5 3.5 0 0 1 .4 7H6Z" /></>,
  pressure: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2" /></>,
  tendency: <><path d="M6 17l4-5 3 3 5-7" /><path d="M15 8h3v3" /><path d="M4 20h16" /></>,
  advection: <><path d="M3 8c3-3 6 3 9 0s6 3 9 0" /><path d="M3 16c3-3 6 3 9 0s6 3 9 0" /><path d="M8 12h8" /><path d="M13 9l3 3-3 3" /></>,
  convergence: <><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5" /><circle cx="12" cy="12" r="2.5" /></>,
  cape: <><path d="M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1 0 2-1 1-3-1-2 0-4 0-5Z" /></>,
  omega: <><path d="M8 20V6" /><path d="M5 9l3-3 3 3" /><path d="M16 4v14" /><path d="M13 15l3 3 3-3" /></>,
  height: <><path d="M3 8c4 0 4 4 8 4s4-4 8-4" /><path d="M3 14c4 0 4 4 8 4s4-4 8-4" /><path d="M3 20c4 0 4 2 8 2" /></>,
  soil: <><path d="M3 8h18M3 12h18M3 16h18M3 20h18" /><path d="M7 4v4M15 4v4" /></>,
  'soil-deep': <><path d="M3 6h18M3 11h18M3 16h18M3 21h18" /><path d="M19 3v4M16 5l3 3 3-3" /></>,
  'soil-temp': <><path d="M3 8h12M3 13h12M3 18h12" /><circle cx="18" cy="12" r="3" /><path d="M18 4v2M18 18v2M10 12h2" /></>,
  et: <><circle cx="9" cy="9" r="3" /><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4 4l1.5 1.5M12.5 12.5L14 14" /><path d="M18 20V9" /><path d="M15 12l3-3 3 3" /></>,
  snow: <><path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" /><path d="M9 4l3 3 3-3M9 20l3-3 3 3" /></>,
  solar: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M19.5 4.5l-1.4 1.4M5.9 18.1l-1.4 1.4" /></>,
  dtd: <><path d="M9 4s4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 4-8 4-8Z" /><circle cx="18" cy="7" r="2.5" /><path d="M18 2v1M18 11v1M13.5 7h1M21.5 7h1" /></>,
};

export function Icon({ name, size = 16, className = '' }: { name: GlyphId; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={`icon ${className}`}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] ?? P.wind}
    </svg>
  );
}

export function PlusIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
export function MinusIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 12h14" /></svg>;
}
export function GlobeIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" /></svg>;
}
export function ExpandIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>;
}
export function PanIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></svg>;
}
export function InfoIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5V17M12 7.4v.2" /></svg>;
}
export function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;
}
export function CloseIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
export function PlayIcon({ paused }: { paused: boolean }) {
  return paused
    ? <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
    : <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>;
}
export function GearIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>;
}
