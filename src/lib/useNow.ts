import { useEffect, useState } from 'react';

export function useNow(interval = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

export function ageLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}
