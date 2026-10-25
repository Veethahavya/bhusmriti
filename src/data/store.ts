import { create } from 'zustand';
import { LAYER_BY_ID, DEFAULT_LAYERS } from './catalog';
import { Derived } from './derive';
import { AtmosData, loadSnapshot } from './snapshot';
import type { LayerDef } from './types';
import {
  chooseRange, computePulse, datasetBase, formatRangeLabel, frameWindow, hasRange,
  todayStart, type RangeId, type RangeIndex, type RangePreset,
} from './ranges';

export type Panel = 'layers' | 'briefing' | 'settings' | 'info' | null;
export type WindUnit = 'kmh' | 'ms' | 'kt';
export type FlowColor = 'speed' | 'temp' | 'advection';
export type VisualMode = 'atlas' | 'smoke';

export type Home = { lat: number; lon: number; name: string; country?: string };

export type Probe = {
  lat: number;
  lon: number;
  x: number;
  y: number;
  values: Array<{ id: string; value: number }>;
};

type State = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  engineReady: boolean;
  progress: number;
  progressLabel: string;
  error: string | null;
  data: AtmosData | null;
  derived: Derived | null;
  start: number;
  end: number;
  frame: number;
  playing: boolean;
  duration: number;
  pulse: number[];
  ranges: RangeIndex | null;
  dataset: RangeId;
  rangePreset: RangePreset;
  rangeLabel: string;
  rangeGridLabel: string;
  rangeLoading: boolean;
  rangeProgress: number;
  rangeError: string | null;
  rangeLoadingLabel: string;

  fillLayer: string | null;
  lineLayers: string[];
  flowLayer: string | null;
  selected: string;
  opacity: Record<string, number>;
  particles: boolean;
  flowColor: FlowColor;
  visualMode: VisualMode;
  barbs: boolean;
  labels: boolean;
  terminator: boolean;
  grid: boolean;
  density: number;
  windUnit: WindUnit;

  home: Home;
  locateState: 'idle' | 'locating' | 'error';
  panel: Panel;
  varInfo: string | null;
  probe: Probe | null;
  hoverEnabled: boolean;
  fly: { lat: number; lon: number; distance?: number; token: number } | null;
  resetToken: number;

  init: () => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setFrame: (f: number) => void;
  step: (dir: number) => void;
  setDuration: (s: number) => void;
  selectPreset: (p: Exclude<RangePreset, 'custom'>) => void;
  applyCustom: (startMs: number, endMs: number) => void;
  loadRange: (id: RangeId, startMs: number | undefined, endMs: number | undefined, label: string, preset: RangePreset) => Promise<void>;

  toggleLayer: (id: string) => void;
  setMode: (id: string, mode: 'fill' | 'line') => void;
  removeLayer: (id: string) => void;
  setSelected: (id: string) => void;
  setOpacity: (id: string, v: number) => void;
  clearOverlays: () => void;

  setParticles: (v: boolean) => void;
  setFlowColor: (v: FlowColor) => void;
  setVisualMode: (v: VisualMode) => void;
  setBarbs: (v: boolean) => void;
  setLabels: (v: boolean) => void;
  setTerminator: (v: boolean) => void;
  setGrid: (v: boolean) => void;
  setDensity: (v: number) => void;
  setWindUnit: (v: WindUnit) => void;
  setPanel: (p: Panel) => void;
  setVarInfo: (id: string | null) => void;
  setEngineReady: (v: boolean) => void;
  setProbe: (p: Probe | null) => void;
  setHome: (h: Home) => void;
  locate: () => void;
  flyTo: (lat: number, lon: number, distance?: number) => void;
  resetView: () => void;
};

const storedHome = (): Home => {
  try {
    const h = localStorage.getItem('aeros.home');
    if (h) return JSON.parse(h);
  } catch { /* ignore */ }
  return { lat: 28.6139, lon: 77.209, name: 'New Delhi', country: 'India' };
};

const defaultOpacity = () => {
  const o: Record<string, number> = {};
  for (const [id, def] of Object.entries(LAYER_BY_ID)) o[id] = def.defaultOpacity;
  return o;
};

const DATA_CACHE = new Map<RangeId, AtmosData>();
const DERIVED_IDS = new Set(['adv_temp', 'adv_moist', 'div10', 'ptend3', 'dtd']);

export const useAtmos = create<State>((set, get) => ({
  status: 'idle', engineReady: false, progress: 0, progressLabel: '', error: null,
  data: null, derived: null, start: 0, end: 0, frame: 0, playing: false, duration: 20, pulse: [],
  ranges: null, dataset: '24h', rangePreset: '24h', rangeLabel: 'Last 24 hours', rangeGridLabel: '1° atmosphere · 2° land',
  rangeLoading: false, rangeProgress: 0, rangeError: null, rangeLoadingLabel: '',
  fillLayer: DEFAULT_LAYERS.fill, lineLayers: DEFAULT_LAYERS.lines, flowLayer: DEFAULT_LAYERS.flow,
  selected: DEFAULT_LAYERS.selected, opacity: defaultOpacity(),
  particles: true, flowColor: 'speed', visualMode: 'atlas', barbs: false, labels: true, terminator: true, grid: true,
  density: 1, windUnit: 'kmh',
  home: storedHome(), locateState: 'idle', panel: typeof window !== 'undefined' && window.innerWidth >= 900 ? 'layers' : null, varInfo: null, probe: null, hoverEnabled: true,
  fly: null, resetToken: 0,

  init: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', progress: 0.01, progressLabel: 'waking the model' });
    try {
      const data = await loadSnapshot('/data', (p, label) => set({ progress: p, progressLabel: label }));
      let ranges: RangeIndex | null = null;
      try {
        const rr = await fetch('/data/ranges.json', { cache: 'no-cache' });
        if (rr.ok) ranges = await rr.json();
      } catch { /* single-range mode */ }
      const start = 0;
      const end = data.times.length - 1;
      const derived = new Derived(data);
      DATA_CACHE.set('24h', data);
      set({
        data, derived, start, end, frame: end, status: 'ready', progress: 1,
        pulse: computePulse(data, start, end),
        ranges,
        dataset: '24h', rangePreset: '24h', rangeLabel: 'Last 24 hours',
        rangeGridLabel: ranges?.ranges['24h']?.gridLabel ?? '1° atmosphere · 2° land',
        rangeLoading: false, rangeError: null,
        opacity: defaultOpacity(),
      });
      setTimeout(() => { if (window.innerWidth >= 900) set({ panel: 'layers' }); }, 600);
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  play: () => {
    const { start, end, frame } = get();
    if (!get().data) return;
    set({ playing: true, frame: frame >= end - 0.01 ? start : frame });
    startPlayback();
  },
  pause: () => { stopPlayback(); set({ playing: false }); },
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setFrame: (f) => {
    const { start, end } = get();
    set({ frame: Math.max(start, Math.min(end, f)) });
  },
  step: (dir) => {
    const { frame, start, end } = get();
    get().pause();
    let f = Math.round(frame) + dir;
    if (f > end) f = end;
    if (f < start) f = start;
    set({ frame: f });
  },
  setDuration: (d) => set({ duration: Math.max(5, Math.min(120, d)) }),

  loadRange: async (id, startMs, endMs, label, preset) => {
    if (get().rangeLoading) return;
    const s = get();
    if (id !== '24h' && !hasRange(s.ranges, id)) {
      set({ rangeError: 'That range is not available yet. Run npm run refresh to build it.' });
      return;
    }
    set({ rangeLoading: true, rangeProgress: 0, rangeError: null, rangeLoadingLabel: label, playing: false });
    try {
      let data = DATA_CACHE.get(id);
      if (!data) {
        data = await loadSnapshot(datasetBase(s.ranges, id), (p, lab) => set({ rangeProgress: p, progressLabel: lab }));
        DATA_CACHE.set(id, data);
      }
      const { start, end } = frameWindow(data, startMs, endMs);
      const derived = new Derived(data);
      const allowed = (lid: string | null) => {
        if (!lid) return true;
        const def = LAYER_BY_ID[lid];
        if (!def) return false;
        if (DERIVED_IDS.has(lid)) return true;
        return !def.field || data.has(def.field);
      };
      let fillLayer = s.fillLayer;
      if (fillLayer && !allowed(fillLayer)) fillLayer = allowed('temp2m') ? 'temp2m' : null;
      let lineLayers = s.lineLayers.filter(allowed);
      let flowLayer = s.flowLayer;
      if (flowLayer && !allowed(flowLayer)) flowLayer = allowed('wind10') ? 'wind10' : null;
      let selected = s.selected;
      if (!allowed(selected)) selected = fillLayer ?? (allowed('temp2m') ? 'temp2m' : selected);
      set({
        data, derived, start, end, frame: end, playing: false,
        dataset: id, rangePreset: preset, rangeLabel: label,
        rangeGridLabel: s.ranges?.ranges[id]?.gridLabel ?? '',
        pulse: computePulse(data, start, end),
        fillLayer, lineLayers, flowLayer, selected,
        rangeLoading: false, rangeProgress: 1,
      });
    } catch (e) {
      set({ rangeLoading: false, rangeError: e instanceof Error ? e.message : String(e) });
    }
  },

  selectPreset: (preset) => {
    const s = get();
    if (preset === 'today') {
      const meta = s.ranges?.ranges['24h'];
      const end = meta ? Date.parse(meta.end) : (s.data ? s.data.times[s.data.times.length - 1] : Date.now());
      void s.loadRange('24h', todayStart(), end, 'Today', 'today');
    } else if (preset === '24h') {
      void s.loadRange('24h', undefined, undefined, 'Last 24 hours', '24h');
    } else if (preset === 'week') {
      void s.loadRange('week', undefined, undefined, 'Last 7 days', 'week');
    } else if (preset === 'month') {
      void s.loadRange('month', undefined, undefined, 'Last 30 days', 'month');
    } else if (preset === 'long') {
      void s.loadRange('long', undefined, undefined, 'Long archive', 'long');
    }
  },

  applyCustom: (startMs, endMs) => {
    const s = get();
    const earliest = s.ranges?.ranges.long ?? s.ranges?.ranges.month;
    let a = startMs;
    let b = endMs;
    if (earliest) {
      a = Math.max(a, Date.parse(earliest.start));
      b = Math.min(b, Date.parse(earliest.end));
    }
    if (b <= a) {
      set({ rangeError: 'Choose an end date after the start date.' });
      return;
    }
    const id = chooseRange(a, b, s.ranges);
    void s.loadRange(id, a, b, formatRangeLabel(a, b), 'custom');
  },


  toggleLayer: (id) => {
    const def = LAYER_BY_ID[id];
    if (!def) return;
    const s = get();
    if (def.field && s.data && !s.data.has(def.field) && !DERIVED_IDS.has(id)) return;
    if (def.kind === 'flow' && s.flowLayer && s.flowLayer !== id) return;
    if (def.kind === 'flow') {
      set({ flowLayer: s.flowLayer === id ? null : id, selected: id, particles: s.flowLayer === id ? s.particles : true });
      return;
    }
    const isFill = s.fillLayer === id;
    const inLine = s.lineLayers.includes(id);
    if (isFill) {
      const next = s.lineLayers.length ? s.lineLayers[s.lineLayers.length - 1] : null;
      set({
        fillLayer: next,
        lineLayers: next ? s.lineLayers.slice(0, -1) : [],
        selected: id,
      });
      return;
    }
    if (inLine) {
      set({ lineLayers: s.lineLayers.filter((l) => l !== id), selected: id });
      return;
    }
    if (def.lineOnly || s.fillLayer) {
      set({ lineLayers: [...s.lineLayers, id].slice(-4), selected: id });
    } else {
      set({ fillLayer: id, selected: id });
    }
  },

  setMode: (id, mode) => {
    const s = get();
    const def = LAYER_BY_ID[id];
    if (def?.field && s.data && !s.data.has(def.field) && !DERIVED_IDS.has(id)) return;
    if (!def || def.lineOnly) return;
    if (mode === 'fill') {
      // Only one wash is allowed. The UI disables FILL while another fill is
      // active; keep the guard here too.
      if (s.fillLayer && s.fillLayer !== id) return;
      const lines = s.lineLayers.filter((l) => l !== id);
      set({ fillLayer: id, lineLayers: lines, selected: id });
    } else {
      const lines = s.lineLayers.includes(id) ? s.lineLayers : [...s.lineLayers, id].slice(-4);
      set({
        fillLayer: s.fillLayer === id ? null : s.fillLayer,
        lineLayers: lines,
        selected: id,
      });
    }
  },

  removeLayer: (id) => {
    const s = get();
    if (s.fillLayer === id) {
      const next = s.lineLayers.length ? s.lineLayers[s.lineLayers.length - 1] : null;
      set({ fillLayer: next, lineLayers: next ? s.lineLayers.slice(0, -1) : [] });
    } else if (s.flowLayer === id) {
      set({ flowLayer: null });
    } else {
      set({ lineLayers: s.lineLayers.filter((l) => l !== id) });
    }
    if (s.selected === id) set({ selected: s.fillLayer ?? s.flowLayer ?? s.lineLayers[0] ?? 'temp2m' });
  },

  setSelected: (id) => set({ selected: id }),
  setOpacity: (id, v) => set({ opacity: { ...get().opacity, [id]: v } }),
  clearOverlays: () => set({ fillLayer: null, lineLayers: [], flowLayer: null }),

  setParticles: (v) => set({ particles: v }),
  setFlowColor: (v) => set({ flowColor: v }),
  setVisualMode: (v) => set({ visualMode: v }),
  setBarbs: (v) => set({ barbs: v }),
  setLabels: (v) => set({ labels: v }),
  setTerminator: (v) => set({ terminator: v }),
  setGrid: (v) => set({ grid: v }),
  setDensity: (v) => set({ density: v }),
  setWindUnit: (v) => set({ windUnit: v }),
  setPanel: (p) => set({ panel: p }),
  setVarInfo: (id) => set({ varInfo: id }),
  setEngineReady: (v) => set({ engineReady: v }),
  setProbe: (p) => set({ probe: p }),

  setHome: (h) => {
    try { localStorage.setItem('aeros.home', JSON.stringify(h)); } catch { /* ignore */ }
    set({ home: h });
  },

  locate: () => {
    if (!navigator.geolocation) { set({ locateState: 'error' }); return; }
    set({ locateState: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const h = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' };
        get().setHome(h);
        get().flyTo(h.lat, h.lon, 2.2);
        set({ locateState: 'idle' });
      },
      () => set({ locateState: 'error' }),
      { timeout: 8000, maximumAge: 600000 },
    );
  },

  flyTo: (lat, lon, distance) => set({ fly: { lat, lon, distance, token: Date.now() } }),
  resetView: () => set({ resetToken: Date.now() }),
}));

export const selectedDef = (): LayerDef | null => {
  const s = useAtmos.getState();
  return LAYER_BY_ID[s.selected] ?? null;
};

// ── playback clock ─────────────────────────────────────────────────────────
let raf = 0;
let last = 0;
let acc = 0;
function tick(now: number) {
  if (!useAtmos.getState().playing) return;
  if (!last) last = now;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  if (acc >= 0.045) {
    const s = useAtmos.getState();
    const framesPerSecond = (s.end - s.start) / Math.max(1, s.duration);
    let f = s.frame + acc * framesPerSecond;
    if (f >= s.end - 0.001) f = s.start;
    acc = 0;
    useAtmos.setState({ frame: f });
  }
  raf = requestAnimationFrame(tick);
}
function startPlayback() {
  cancelAnimationFrame(raf);
  last = 0;
  acc = 0;
  raf = requestAnimationFrame(tick);
}
function stopPlayback() {
  cancelAnimationFrame(raf);
  last = 0;
  acc = 0;
}
