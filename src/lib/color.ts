import type { Palette } from '../data/types';

export function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.startsWith('rgb')) {
    const m = h.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map((s) => parseFloat(s.trim()));
      return [(p[0] ?? 0) / 255, (p[1] ?? 0) / 255, (p[2] ?? 0) / 255, p[3] ?? 1];
    }
  }
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) h += 'ff';
  const n = parseInt(h, 16);
  return [((n >> 24) & 255) / 255, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbaCss(hex: string, alpha = 1): string {
  const [r, g, b, a] = hexToRgba(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a * alpha})`;
}

/** Sample a palette (piecewise linear, sRGB) into a css colour. */
export function samplePalette(palette: Palette, t: number): string {
  const f = Math.max(0, Math.min(1, t));
  if (f <= palette[0][0]) return palette[0][1];
  for (let i = 1; i < palette.length; i++) {
    if (f <= palette[i][0]) {
      const [a, ca] = palette[i - 1];
      const [b, cb] = palette[i];
      const u = (f - a) / Math.max(1e-9, b - a);
      const A = hexToRgba(ca);
      const B = hexToRgba(cb);
      const c = A.map((v, k) => v + (B[k] - v) * u);
      return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3].toFixed(3)})`;
    }
  }
  return palette[palette.length - 1][1];
}

/** Convert a palette to 8 evenly-spaced RGBA stops for the GLSL ramp. */
export function shaderRamp(palette: Palette): { colors: number[][]; stops: number[] } {
  const colors: number[][] = [];
  const stops: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    colors.push(hexToRgba(samplePalette(palette, t)));
    stops.push(t);
  }
  return { colors, stops };
}

export function paletteCssGradient(palette: Palette, dir = '90deg'): string {
  return `linear-gradient(${dir}, ${palette.map(([p, c]) => `${rgbaCss(c, 1)} ${(p * 100).toFixed(1)}%`).join(', ')})`;
}

export function contrastInk(hex: string): string {
  const [r, g, b] = hexToRgba(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.55 ? '#041014' : '#eafffb';
}
