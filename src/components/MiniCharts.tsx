import type { WindRose as Rose } from '../data/brief';

export function Sparkline({
  values, color = '#5eead4', width = 120, height = 28, fill = true, strokeWidth = 1.2,
}: { values: number[]; color?: string; width?: number; height?: number; fill?: boolean; strokeWidth?: number }) {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - 2 - ((Number.isFinite(v) ? v : min) - min) / span * (height - 4);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${d} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" className="spark">
      {fill && <path d={area} fill={color} opacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export function WindRoseSvg({ rose, size = 84 }: { rose: Rose; size?: number }) {
  const max = Math.max(1, ...rose.map((r) => r.speed));
  const total = rose.reduce((a, r) => a + r.count, 0) || 1;
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className="rose">
      <circle r="42" fill="none" stroke="rgba(126,190,186,0.12)" strokeWidth="0.6" />
      <circle r="27" fill="none" stroke="rgba(126,190,186,0.1)" strokeWidth="0.6" />
      <circle r="12" fill="none" stroke="rgba(126,190,186,0.1)" strokeWidth="0.6" />
      {[0, 90, 180, 270].map((d) => {
        const a = (d - 90) * Math.PI / 180;
        return <line key={d} x1={0} y1={0} x2={Math.cos(a) * 43} y2={Math.sin(a) * 43} stroke="rgba(126,190,186,0.08)" strokeWidth="0.5" />;
      })}
      {rose.map((r, i) => {
        if (!r.count) return null;
        const a = (r.dir - 90) * Math.PI / 180;
        const len = 6 + (r.speed / max) * 35;
        const w = 2.4 + (r.count / total) * 4;
        return (
          <line
            key={i} x1={0} y1={0}
            x2={Math.cos(a) * len} y2={Math.sin(a) * len}
            stroke="#5eead4" strokeWidth={w} strokeLinecap="round"
            opacity={0.25 + (r.speed / max) * 0.65}
          />
        );
      })}
      <circle r="2.2" fill="#5eead4" />
    </svg>
  );
}
