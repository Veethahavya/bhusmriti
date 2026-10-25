import * as THREE from 'three';
import { LAYER_BY_ID, formatValue } from '../data/catalog';
import { Derived } from '../data/derive';
import { AtmosData } from '../data/snapshot';
import type { LayerDef, Palette } from '../data/types';
import type { FlowColor, Home, Probe } from '../data/store';
import { hexToRgba, shaderRamp } from '../lib/color';
import { solarVec, subsolar } from '../lib/geo';
import { buildBasemap } from './basemap';
import { Overlay, type OverlayHost } from './overlay';
import { WindTrails, type TrailSample } from './trails';
import { CloudPass } from './clouds';
import { ATMOS_FRAG, DATA_FRAG, FULLSCREEN_VERT, GLOBE_FRAG } from './shaders';

const DEG = Math.PI / 180;
const R = 1;

export type EngineState = {
  data: AtmosData | null;
  frame: number;
  fillLayer: string | null;
  lineLayers: string[];
  opacity: Record<string, number>;
  flowLayer: string | null;
  flowColor: FlowColor;
  visualMode: 'globe' | 'earth';
  particles: boolean;
  density: number;
  barbs: boolean;
  labels: boolean;
  grid: boolean;
  terminator: boolean;
  home: Home;
  fly: { lat: number; lon: number; distance?: number; token: number } | null;
  resetToken: number;
};

type LayerSpec = { def: LayerDef; mode: 'fill' | 'line' };

class LayerPass {
  def: LayerDef;
  mode: 'fill' | 'line';
  mesh: THREE.Mesh;
  material: THREE.RawShaderMaterial;
  texture: THREE.DataTexture;
  buffer: Float32Array;
  constructor(def: LayerDef, mode: 'fill' | 'line', scene: THREE.Scene, common: Record<string, THREE.IUniform>, mask: THREE.IUniform, data: AtmosData) {
    this.def = def;
    this.mode = mode;
    const g = def.derived ? data.gridForDerived(def.derived) : data.gridFor(def.field ?? 'temperature_2m');
    this.buffer = new Float32Array(g.n);
    this.texture = new THREE.DataTexture(this.buffer, g.nx, g.ny, THREE.RedFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;

    const ramp = shaderRamp(def.palette);
    const ramp2 = shaderRamp(def.oceanPalette ?? def.palette);
    const span = def.range[1] - def.range[0];
    const contour = mode === 'line' ? (def.contour ?? span / 10) : (def.contour ?? 0);

    const uniforms: Record<string, THREE.IUniform> = {
      ...common,
      uData: { value: this.texture },
      uMask: mask,
      uGridMin: { value: new THREE.Vector2(g.lonMin, g.latMin) },
      uGridStep: { value: new THREE.Vector2(g.step, g.step) },
      uGridCount: { value: new THREE.Vector2(g.nx, g.ny) },
      uPalette: { value: ramp.colors.map((c) => new THREE.Vector4(...c)) },
      uPalette2: { value: ramp2.colors.map((c) => new THREE.Vector4(...c)) },
      uStops: { value: new Float32Array(ramp.stops) },
      uRange: { value: new THREE.Vector2(def.range[0], def.range[1]) },
      uFill: { value: mode === 'fill' && !def.lineOnly ? 1 : 0 },
      uContour: { value: contour },
      uContourAlpha: { value: mode === 'line' ? 0.48 : 0.22 },
      uContourColor: { value: colorOf(def.contourColor ?? 'rgba(255,255,255,0.4)') },
      uOpacity: { value: def.defaultOpacity },
      uPattern: { value: def.pattern ?? 0 },
      uMaskMode: { value: def.mask === 'land' ? 1 : def.mask === 'ocean' ? 2 : 0 },
      uDual: { value: def.oceanPalette ? 1 : 0 },
      uSunShade: { value: 0.2 },
      uOceanDim: { value: def.mask ? 0 : def.id === 'surface' ? 0.12 : 0.26 },
      uSeed: { value: Math.random() * 100 },
    };
    this.material = new THREE.RawShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DATA_FRAG,
      uniforms,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  setMode(mode: 'fill' | 'line', opacity: number) {
    this.mode = mode;
    const u = this.material.uniforms;
    const span = this.def.range[1] - this.def.range[0];
    const contour = mode === 'line' ? (this.def.contour ?? span / 10) : (this.def.contour ?? 0);
    u.uFill.value = mode === 'fill' && !this.def.lineOnly ? 1 : 0;
    u.uContour.value = contour;
    u.uContourAlpha.value = mode === 'line' ? 0.48 : 0.22;
    u.uOpacity.value = opacity;
  }

  update(data: AtmosData, derived: Derived, frame: number) {
    if (this.def.derived) derived.interpolate(this.def.derived, frame, this.buffer);
    else if (this.def.field) data.interpolate(this.def.field, frame, this.buffer);
    else this.buffer.fill(NaN);
    this.texture.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

function colorOf(s: string): THREE.Color {
  const [r, g, b, a] = hexToRgba(s);
  const c = new THREE.Color(r, g, b);
  // store alpha in the Color's `a`? Three Color has no alpha; contour alpha is separate.
  void a;
  return c;
}

function fsUniforms(): Record<string, THREE.IUniform> {
  return {
    uCamPos: { value: new THREE.Vector3(0, 0, 3.5) },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uTanFov: { value: Math.tan((36 * DEG) / 2) },
    uAspect: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    uNightShade: { value: 1 },
    uTime: { value: 0 },
  };
}

function fullscreen(
  frag: string, uniforms: Record<string, THREE.IUniform>, order: number,
  blending: THREE.Blending = THREE.NormalBlending,
): THREE.Mesh {
  const mat = new THREE.RawShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: frag,
    uniforms,
    glslVersion: THREE.GLSL3,
    transparent: blending !== THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    blending,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}

export class GlobeEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private fullScene = new THREE.Scene();
  private starScene = new THREE.Scene();
  private overlay: Overlay;

  private data: AtmosData | null = null;
  private derived: Derived | null = null;
  private frame = 0;
  private frameDirty = true;
  private passes = new Map<string, LayerPass>();
  private state: EngineState | null = null;

  private fov = 36;
  private fullDistance = 3.5;
  private minDistance = 1.48;
  private distance = 3.5;
  private targetDistance = 3.5;
  private viewLat = 18;
  private viewLon = 78;
  private targetLat = 18;
  private targetLon = 78;

  private common = fsUniforms();
  private globeU: Record<string, THREE.IUniform>;
  private atmosU: Record<string, THREE.IUniform>;
  private maskU: THREE.IUniform;
  private ready = 0;
  private readyTarget = 0;
  private readySent = false;

  private trails: WindTrails;
  private clouds: CloudPass;
  private coast: THREE.LineSegments | null = null;
  private earthTex: THREE.Texture | null = null;
  private earthLoading = false;
  private panEnabled = true;
  private trailsPaused = false;
  private trailsResumeAt = 0;
  private rangeLoading = false;
  private flowU = new Float32Array(0);
  private flowV = new Float32Array(0);
  private flowSpeed = new Float32Array(0);
  private flowColorBuf = new Float32Array(0);
  private flowSpeedBuf = new Float32Array(0);
  private flowDirBuf = new Float32Array(0);
  private flowFieldKey = '';
  private flow: {
    u: Float32Array; v: Float32Array; speed: Float32Array; color: Float32Array;
    colorRange: [number, number]; palette: Palette; speedRange: [number, number];
    grid: { nx: number; ny: number; lonMin: number; latMin: number; step: number };
  } | null = null;

  private probeScreen: { x: number; y: number } | null = null;
  private hoverAt = 0;
  private pointerDown = false;
  private dragged = false;
  private lastPointer = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchDist = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private raf = 0;
  private last = 0;
  private overlayAt = 0;
  private dataTime = Date.now();
  private camVersion = 0;
  private lastOverlayVersion = -1;
  private starMat: THREE.ShaderMaterial | null = null;

  private ro: ResizeObserver;
  onProbe: ((p: Probe | null) => void) | null = null;
  onReady: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.domElement.className = 'aeros-canvas';
    container.appendChild(this.renderer.domElement);
    this.dpr = Math.min(devicePixelRatio, 2);

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.002, 200);
    this.overlay = new Overlay(container);

    const placeholderBase = new THREE.DataTexture(new Uint8Array([5, 12, 16, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    placeholderBase.needsUpdate = true;
    const placeholderMask = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    placeholderMask.needsUpdate = true;
    this.maskU = { value: placeholderMask };

    this.globeU = {
      ...this.common,
      uBase: { value: placeholderBase },
      uEarth: { value: placeholderBase },
      uEarthMode: { value: 0 },
      uMask: this.maskU,
      uReady: { value: 0 },
    };
    this.atmosU = { ...this.common, uReady: { value: 0 } };

    const globe = fullscreen(GLOBE_FRAG, this.globeU, 0);
    const atmos = fullscreen(ATMOS_FRAG, this.atmosU, 100, THREE.AdditiveBlending);
    this.fullScene.add(globe, atmos);

    this.trails = new WindTrails(container, this.screenWind, this.globeBounds);
    this.trails.setVisible(false);
    this.clouds = new CloudPass(this.fullScene, this.common);

    this.makeStars();
    this.addCoastlines();
    this.resize();
    this.distance = this.fullDistance;
    this.targetDistance = this.fullDistance;

    this.attach();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.animate);

    buildBasemap()
      .then((assets) => {
        const base = new THREE.CanvasTexture(assets.map);
        base.colorSpace = THREE.NoColorSpace;
        base.flipY = true;
        base.minFilter = THREE.LinearMipmapLinearFilter;
        base.magFilter = THREE.LinearFilter;
        base.generateMipmaps = true;
        base.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        base.needsUpdate = true;
        const mask = new THREE.CanvasTexture(assets.mask);
        mask.colorSpace = THREE.NoColorSpace;
        mask.flipY = true;
        mask.minFilter = THREE.LinearFilter;
        mask.magFilter = THREE.LinearFilter;
        mask.generateMipmaps = false;
        mask.needsUpdate = true;
        this.globeU.uBase.value = base;
        this.maskU.value = mask;
        for (const p of this.passes.values()) p.material.uniforms.uMask = this.maskU;
        this.readyTarget = 1;
      })
      .catch((e) => console.error('basemap', e));
  }

  private addCoastlines() {
    fetch('/geo/coastline.geojson')
      .then((r) => r.json())
      .then((fc) => {
        const verts: number[] = [];
        const push = (lon: number, lat: number) => {
          const la = lat * DEG, lo = lon * DEG;
          const r = 1.0009;
          verts.push(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
        };
        const line = (coords: number[][]) => {
          for (let i = 1; i < coords.length; i++) {
            const a = coords[i - 1], b = coords[i];
            if (Math.abs(a[0] - b[0]) > 180) continue;
            push(a[0], a[1]); push(b[0], b[1]);
          }
        };
        for (const f of fc.features ?? []) {
          const g = f.geometry;
          if (!g) continue;
          if (g.type === 'LineString') line(g.coordinates);
          else if (g.type === 'MultiLineString') for (const l of g.coordinates) line(l);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: `
            varying float vFade;
            void main(){
              vec3 n = normalize(position);
              vec3 c = normalize(cameraPosition);
              vFade = smoothstep(0.02, 0.26, dot(n, c));
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: `
            varying float vFade;
            void main(){ gl_FragColor = vec4(0.48, 0.98, 0.9, 0.22 * vFade); }`,
        });
        const coast = new THREE.LineSegments(geo, mat);
        this.coast = coast;
        coast.visible = this.state?.visualMode !== 'earth';
        coast.frustumCulled = false;
        coast.renderOrder = 60;
        this.fullScene.add(coast);
      })
      .catch(() => { /* coastline is optional */ });
  }

  private makeStars() {
    const N = 2400;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    let s = 12345;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = 45 * r * Math.cos(th);
      pos[i * 3 + 1] = 45 * u;
      pos[i * 3 + 2] = 45 * r * Math.sin(th);
      const warm = rnd() > 0.86;
      const b = 0.45 + rnd() * 0.55;
      col[i * 3] = (warm ? 1 : 0.72) * b;
      col[i * 3 + 1] = (warm ? 0.86 : 0.86) * b;
      col[i * 3 + 2] = (warm ? 0.7 : 1) * b;
      size[i] = rnd() > 0.96 ? 3.0 : rnd() > 0.65 ? 1.8 : 1.1;
      phase[i] = rnd() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDpr: { value: this.dpr } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aPhase;
        varying vec3 vColor; varying float vTw;
        uniform float uTime;
        void main(){
          vColor=aColor;
          vTw = 0.62 + 0.38*sin(uTime*0.42 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vTw;
        void main(){
          vec2 d=gl_PointCoord-0.5;
          float r=length(d);
          if(r>0.5) discard;
          float a=smoothstep(0.5,0.0,r)*vTw;
          gl_FragColor=vec4(vColor*a,a);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    this.starScene.add(points);
    this.starMat = mat;
  }

  update(state: EngineState) {
    const prev = this.state;
    this.state = state;
    if (state.data !== prev?.data && state.data) {
      for (const p of this.passes.values()) p.dispose(this.fullScene);
      this.passes.clear();
      this.data = state.data;
      this.derived = new Derived(state.data);
      this.frameDirty = true;
      this.syncLayers(state);
      this.syncFlow(state, true);
    }
    if (state.frame !== prev?.frame) {
      this.frame = state.frame;
      this.frameDirty = true;
      if (this.data) {
        const i = Math.max(0, Math.min(this.data.times.length - 1, Math.floor(state.frame)));
        const f = state.frame - Math.floor(state.frame);
        const t0 = this.data.times[i];
        const t1 = this.data.times[Math.min(i + 1, this.data.times.length - 1)];
        this.dataTime = t0 + (t1 - t0) * f;
      }
    }
    if (!prev || state.fillLayer !== prev.fillLayer || state.lineLayers.join('|') !== prev.lineLayers.join('|') || state.opacity !== prev.opacity) {
      this.syncLayers(state);
    }
    if (!prev || state.flowLayer !== prev.flowLayer || state.flowColor !== prev.flowColor || state.particles !== prev.particles || state.density !== prev.density) {
      this.syncFlow(state);
    }
    if (!prev || state.visualMode !== prev.visualMode) {
      this.applyVisualMode(state);
    }
    if (!prev || state.home !== prev.home) {
      // overlay reads home from state each draw
    }
    const common = this.common;
    common.uNightShade.value = state.terminator ? 1 : 0;
    if (state.fly && state.fly.token !== prev?.fly?.token) {
      this.flyTo(state.fly.lat, state.fly.lon, state.fly.distance);
    }
    if (state.resetToken && state.resetToken !== prev?.resetToken) this.resetView();
  }

  private ensureFlowBuffers(data: AtmosData, field: string) {
    const g = data.gridFor(field);
    if (this.flowU.length === g.n) return;
    this.flowU = new Float32Array(g.n);
    this.flowV = new Float32Array(g.n);
    this.flowSpeed = new Float32Array(g.n);
    this.flowColorBuf = new Float32Array(g.n);
    this.flowSpeedBuf = new Float32Array(g.n);
    this.flowDirBuf = new Float32Array(g.n);
    this.flowFieldKey = '';
  }

  private loadEarthTexture() {
    if (this.earthTex || this.earthLoading) return;
    this.earthLoading = true;
    const max = this.renderer.capabilities.maxTextureSize;
    const src = max >= 8192 ? '/geo/earth-satellite-8k.jpg' : '/geo/earth-satellite.jpg';
    const tex = new THREE.TextureLoader().load(src, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.globeU.uEarth.value = t;
      this.earthTex = t;
      this.earthLoading = false;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
  }

  private applyVisualMode(state: EngineState) {
    const earth = state.visualMode === 'earth';
    if (earth) this.loadEarthTexture();
    this.globeU.uEarthMode.value = earth ? 1 : 0;
    this.clouds.setVisible(earth);
    if (this.coast) this.coast.visible = !earth;
    if (earth) {
      this.trailsPaused = true;
      this.trails.clear();
      this.trails.setVisible(false);
    } else {
      this.trailsPaused = false;
      this.syncFlow(state, true);
      this.trails.setVisible(state.particles && state.visualMode !== 'earth');
      this.trails.reset();
    }
    this.syncLayers(state);
  }

  private syncLayers(state: EngineState) {
    if (!this.data) return;
    const specs: LayerSpec[] = [];
    const seen = new Set<string>();
    if (state.fillLayer && LAYER_BY_ID[state.fillLayer] && !LAYER_BY_ID[state.fillLayer].lineOnly) {
      specs.push({ def: LAYER_BY_ID[state.fillLayer], mode: 'fill' });
      seen.add(state.fillLayer);
    }
    for (const id of state.lineLayers) {
      if (seen.has(id)) continue;
      const def = LAYER_BY_ID[id];
      if (!def) continue;
      specs.push({ def, mode: 'line' });
      seen.add(id);
    }
    if (state.fillLayer && LAYER_BY_ID[state.fillLayer]?.lineOnly && !seen.has(state.fillLayer)) {
      specs.unshift({ def: LAYER_BY_ID[state.fillLayer], mode: 'line' });
      seen.add(state.fillLayer);
    }

    for (const [id, p] of this.passes) {
      if (!seen.has(id)) {
        p.dispose(this.fullScene);
        this.passes.delete(id);
      }
    }
    specs.forEach((s, i) => {
      let p = this.passes.get(s.def.id);
      if (!p) {
        p = new LayerPass(s.def, s.mode, this.fullScene, this.common, this.maskU, this.data!);
        this.passes.set(s.def.id, p);
        p.update(this.data!, this.derived!, this.frame);
      }
      p.setMode(s.mode, state.opacity[s.def.id] ?? s.def.defaultOpacity);
      p.mesh.visible = state.visualMode !== 'earth';
      p.mesh.renderOrder = 10 + i;
    });
    this.frameDirty = true;
  }

  private syncFlow(state: EngineState, force = false) {
    if (!this.data || !this.derived) {
      this.trails.setVisible(false);
      return;
    }
    const def = state.flowLayer ? LAYER_BY_ID[state.flowLayer] : null;
    if (!def || def.kind !== 'flow') {
      this.trails.setVisible(false);
      this.flow = null;
      return;
    }
    this.ensureFlowBuffers(this.data, def.field!);
    this.trails.setVisible(state.particles && state.visualMode !== 'earth');
    this.trails.setDensity(state.density);
    const key = `${def.id}|${state.flowColor}|${Math.round(this.frame * 20)}`;
    if (force || key !== this.flowFieldKey) {
      this.flowFieldKey = key;
      this.refreshFlow(def, state.flowColor);
      this.trails.reset();
    }
  }

  private refreshFlow(def: LayerDef, colorMode: FlowColor) {
    if (!this.data || !this.derived) return;
    const speedField = def.field!;
    const dirField = def.dirField!;
    this.data.interpolate(speedField, this.frame, this.flowSpeedBuf);
    this.data.interpolate(dirField, this.frame, this.flowDirBuf);
    for (let i = 0; i < this.flowSpeed.length; i++) {
      const v = this.flowSpeedBuf[i];
      const d = this.flowDirBuf[i];
      this.flowSpeed[i] = v;
      if (Number.isFinite(v) && Number.isFinite(d)) {
        const s = v / 3.6;
        const a = d * DEG;
        this.flowU[i] = -s * Math.sin(a);
        this.flowV[i] = -s * Math.cos(a);
      } else {
        this.flowU[i] = 0;
        this.flowV[i] = 0;
      }
    }

    let color: Float32Array = this.flowSpeed;
    let colorRange: [number, number] = def.range;
    let palette: Palette = def.palette;
    if (colorMode === 'temp') {
      this.data.interpolate('temperature_2m', this.frame, this.flowColorBuf);
      color = this.flowColorBuf;
      colorRange = [-35, 45];
      palette = LAYER_BY_ID.temp2m.palette;
    } else if (colorMode === 'advection') {
      this.derived.interpolate('adv_temp', this.frame, this.flowColorBuf);
      color = this.flowColorBuf;
      colorRange = [-3, 3];
      palette = LAYER_BY_ID.adv_temp.palette;
    }
    const g = this.data.gridFor(speedField);
    this.flow = {
      u: this.flowU, v: this.flowV, speed: this.flowSpeed,
      color, colorRange, palette, speedRange: def.range,
      grid: { nx: g.nx, ny: g.ny, lonMin: g.lonMin, latMin: g.latMin, step: g.step },
    };
    this.trails.setPalette(palette);
  }

  private screenWind = (x: number, y: number): TrailSample | null => {
    if (!this.flow || !this.data) return null;
    const hit = this.pick(x, y);
    if (!hit || Math.abs(hit.lat) > 80) return null;
    const w = this.sampleWind(hit.lat, hit.lon);
    if (!w) return null;
    const pe = this.project(hit.lat, hit.lon + 0.32);
    const pn = this.project(hit.lat + 0.32, hit.lon);
    if (!pe.front || !pn.front) return null;
    let ex = pe.x - x, ey = pe.y - y;
    let nx = pn.x - x, ny = pn.y - y;
    const el = Math.hypot(ex, ey) || 1, nl = Math.hypot(nx, ny) || 1;
    ex /= el; ey /= el; nx /= nl; ny /= nl;
    const z = Math.max(0, Math.min(1, (this.fullDistance - this.distance) / Math.max(0.01, this.fullDistance - this.minDistance)));
    const scale = 3.3 + z * 3.2;
    const vx = (w.u * ex + w.v * nx) * scale;
    const vy = (w.u * ey + w.v * ny) * scale;
    const cv = sampleGrid(this.flow.color, hit.lon, hit.lat, this.flow.grid);
    const t = Math.max(0, Math.min(1, (cv - this.flow.colorRange[0]) / Math.max(1e-6, this.flow.colorRange[1] - this.flow.colorRange[0])));
    return { vx, vy, speed: w.speed, color: Math.round(t * 13) };
  };

  setPanEnabled(v: boolean) {
    this.panEnabled = v;
  }

  private globeBounds = () => {
    const focal = (this.height / 2) / Math.tan((this.fov * DEG) / 2);
    const ang = Math.asin(Math.min(1, R / Math.max(1, this.distance)));
    const r = focal * Math.tan(ang);
    return { cx: this.width / 2, cy: this.height / 2, r: Math.max(1, Math.min(r, Math.hypot(this.width, this.height))) };
  };

  setRangeLoading(v: boolean) {
    this.rangeLoading = v;
    if (v) {
      this.trailsPaused = true;
      this.trails.clear();
    } else {
      this.trailsPaused = false;
      this.trails.reset();
    }
  }

  private suspendTrails() {
    if (!this.trailsPaused) this.trails.clear();
    this.trailsPaused = true;
    this.trailsResumeAt = performance.now() + 180;
  }

  private maybeResumeTrails(now: number) {
    if (!this.trailsPaused || this.rangeLoading) return;
    const moving = Math.abs(this.distance - this.targetDistance) > 0.008
      || Math.abs(this.viewLat - this.targetLat) > 0.03
      || Math.abs(this.viewLon - this.targetLon) > 0.03;
    if (moving) {
      this.trailsResumeAt = now + 180;
      return;
    }
    if (now >= this.trailsResumeAt) {
      this.trailsPaused = false;
      this.trails.reset();
    }
  }

  private refreshData() {
    if (!this.data || !this.derived) return;
    for (const p of this.passes.values()) p.update(this.data, this.derived, this.frame);
    const def = this.state?.flowLayer ? LAYER_BY_ID[this.state.flowLayer] : null;
    if (def && def.kind === 'flow' && this.state) this.refreshFlow(def, this.state.flowColor);
    else if (this.state) this.syncFlow(this.state);
    if (this.probeScreen) this.emitProbe(this.probeScreen.x, this.probeScreen.y);
    this.frameDirty = false;
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.width = w;
    this.height = h;
    this.dpr = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlay.resize(w, h, this.dpr);
    this.trails.resize(w, h, this.dpr);
    const fit = (w < 600 ? 0.46 : 0.40) * Math.min(w, h);
    const focal = (h / 2) / Math.tan((this.fov * DEG) / 2);
    const theta = Math.atan(fit / focal);
    this.fullDistance = (R / Math.sin(theta)) * 1.004;
    this.minDistance = 1.48;
    if (this.distance > this.fullDistance) this.distance = this.fullDistance;
    if (this.targetDistance > this.fullDistance) this.targetDistance = this.fullDistance;
    this.common.uAspect.value = this.camera.aspect;
    this.common.uTanFov.value = Math.tan((this.fov * DEG) / 2);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.suspendTrails();
    const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    const factor = Math.exp(dy * 0.00125);
    this.targetDistance = Math.max(this.minDistance, Math.min(this.fullDistance, this.targetDistance * factor));
    this.trailsResumeAt = performance.now() + 180;
  };

  private local(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.pointerDown = true;
    this.dragged = false;
    this.lastPointer = p;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchDist = this.targetDistance;
    }
    this.renderer.domElement.classList.add('grabbing');
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0 && d > 0) {
        this.suspendTrails();
        this.targetDistance = Math.max(this.minDistance, Math.min(this.fullDistance, this.pinchDist * (this.pinchStart / d)));
      }
      this.dragged = true;
      return;
    }
    if (this.pointerDown) {
      const dx = p.x - this.lastPointer.x;
      const dy = p.y - this.lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 1.2) this.dragged = true;
      if (this.panEnabled && (Math.abs(dx) + Math.abs(dy) > 0.2)) this.suspendTrails();
      if (this.panEnabled) {
        const k = (this.distance > this.fullDistance * 0.985 ? 0.12 : 0.17) * Math.min(1, (this.distance - 1.05) / 1.0);
        this.targetLon -= dx * k;
        this.targetLat = Math.max(-78, Math.min(78, this.targetLat + dy * k));
        this.targetLon = ((this.targetLon + 540) % 360) - 180;
      }
      this.lastPointer = p;
      return;
    }
    const now = performance.now();
    if (now - this.hoverAt < 55) return;
    this.hoverAt = now;
    this.emitProbe(p.x, p.y);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      this.pointerDown = false;
      this.renderer.domElement.classList.remove('grabbing');
    }
  };

  private onLeave = () => {
    this.pointers.clear();
    this.pointerDown = false;
    this.probeScreen = null;
    this.onProbe?.(null);
    this.renderer.domElement.classList.remove('grabbing');
  };

  private onDblClick = (e: MouseEvent) => {
    this.suspendTrails();
    const p = this.local(e);
    const hit = this.pick(p.x, p.y);
    this.targetDistance = Math.max(this.minDistance, this.targetDistance / 1.9);
    if (hit) {
      this.targetLat = Math.max(-78, Math.min(78, hit.lat));
      this.targetLon = hit.lon;
    }
  };

  private attach() {
    const el = this.renderer.domElement;
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private detach() {
    const el = this.renderer.domElement;
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('dblclick', this.onDblClick);
  }

  zoomBy(f: number) {
    this.suspendTrails();
    this.targetDistance = Math.max(this.minDistance, Math.min(this.fullDistance, this.targetDistance * f));
  }

  flyTo(lat: number, lon: number, distance?: number) {
    this.suspendTrails();
    this.targetLat = Math.max(-78, Math.min(78, lat));
    let d = lon - this.viewLon;
    d = ((d + 540) % 360) - 180;
    this.targetLon = this.viewLon + d;
    if (distance) this.targetDistance = Math.max(this.minDistance, Math.min(this.fullDistance, distance));
  }

  resetView() {
    this.suspendTrails();
    this.targetLat = 18;
    let d = 78 - this.viewLon;
    d = ((d + 540) % 360) - 180;
    this.targetLon = this.viewLon + d;
    this.targetDistance = this.fullDistance;
  }

  getFullDistance() { return this.fullDistance; }
  getDistance() { return this.distance; }
  isFull() { return this.targetDistance > this.fullDistance * 0.985; }
  getStats() { return { distance: this.distance, full: this.fullDistance, lat: this.viewLat, lon: this.viewLon }; }

  private updateCamera(dt: number) {
    const target = this.targetDistance;
    const k = 1 - Math.exp(-dt * 7.5);
    this.distance += (target - this.distance) * k;
    if (Math.abs(this.distance - target) < 0.0005) this.distance = target;
    this.viewLat += (this.targetLat - this.viewLat) * k;
    let dLon = this.targetLon - this.viewLon;
    dLon = ((dLon + 540) % 360) - 180;
    this.viewLon += dLon * k;
    if (Math.abs(dLon) < 0.0005) this.viewLon = this.targetLon;
    this.viewLon = ((this.viewLon + 540) % 360) - 180;

    const la = this.viewLat * DEG, lo = this.viewLon * DEG;
    const d = this.distance;
    this.camera.position.set(d * Math.cos(la) * Math.sin(lo), d * Math.sin(la), d * Math.cos(la) * Math.cos(lo));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();

    const fwd = this.camera.position.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    (this.common.uCamPos.value as THREE.Vector3).copy(this.camera.position);
    (this.common.uCamFwd.value as THREE.Vector3).copy(fwd);
    (this.common.uCamRight.value as THREE.Vector3).copy(right);
    (this.common.uCamUp.value as THREE.Vector3).copy(up);
    this.common.uAspect.value = this.camera.aspect;
    this.common.uTanFov.value = Math.tan((this.fov * DEG) / 2);
    this.camVersion++;
  }

  private updateUniforms(time: number) {
    const sun = solarVec(new Date(this.dataTime));
    (this.common.uSunDir.value as THREE.Vector3).set(sun[0], sun[1], sun[2]);
    this.common.uTime.value = time;
    if (this.starMat) this.starMat.uniforms.uTime.value = time;
    this.ready += (this.readyTarget - this.ready) * 0.09;
    this.globeU.uReady.value = this.ready;
    this.atmosU.uReady.value = this.ready;
  }

  private pick(x: number, y: number): { lat: number; lon: number } | null {
    const ndcX = (x / this.width) * 2 - 1;
    const ndcY = -(y / this.height) * 2 + 1;
    const fwd = new THREE.Vector3().copy(this.common.uCamFwd.value as THREE.Vector3);
    const right = new THREE.Vector3().copy(this.common.uCamRight.value as THREE.Vector3);
    const up = new THREE.Vector3().copy(this.common.uCamUp.value as THREE.Vector3);
    const tan = this.common.uTanFov.value as number;
    const aspect = this.common.uAspect.value as number;
    const rd = fwd.clone().add(right.multiplyScalar(ndcX * tan * aspect)).add(up.multiplyScalar(ndcY * tan)).normalize();
    const ro = this.camera.position;
    const b = ro.dot(rd);
    const c = ro.dot(ro) - 1;
    const h = b * b - c;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    if (t <= 0) return null;
    const p = ro.clone().add(rd.multiplyScalar(t));
    const lat = Math.asin(Math.max(-1, Math.min(1, p.y))) / DEG;
    const lon = Math.atan2(p.x, p.z) / DEG;
    return { lat, lon };
  }

  private emitProbe(x: number, y: number) {
    if (!this.data || !this.state) { this.onProbe?.(null); return; }
    const hit = this.pick(x, y);
    if (!hit) { this.probeScreen = null; this.onProbe?.(null); return; }
    this.probeScreen = { x, y };
    const ids = new Set<string>();
    if (this.state.fillLayer) ids.add(this.state.fillLayer);
    for (const id of this.state.lineLayers) ids.add(id);
    if (this.state.flowLayer && this.state.particles) ids.add(this.state.flowLayer);
    const values: Probe['values'] = [];
    for (const id of ids) {
      const v = this.sampleLayer(id, hit.lat, hit.lon);
      if (Number.isFinite(v)) values.push({ id, value: v });
    }
    this.onProbe?.({ lat: hit.lat, lon: hit.lon, x, y, values });
  }

  private sampleLayer(id: string, lat: number, lon: number): number {
    if (!this.data || !this.derived) return NaN;
    const def = LAYER_BY_ID[id];
    if (!def) return NaN;
    if (def.kind === 'flow') {
      const a = this.data.sample(def.field!, Math.floor(this.frame), lon, lat);
      const b = this.data.sample(def.field!, Math.ceil(this.frame), lon, lat);
      return mix(a, b, this.frame - Math.floor(this.frame));
    }
    if (def.kind === 'derived' && def.derived) {
      const t0 = Math.floor(this.frame);
      const t1 = Math.min(this.data.manifest.frameCount - 1, t0 + 1);
      const g = this.data.gridForDerived(def.derived);
      const a = this.data.bilinear(this.derived.get(def.derived, t0), 0, lon, lat, g);
      const b = this.data.bilinear(this.derived.get(def.derived, t1), 0, lon, lat, g);
      return mix(a, b, this.frame - t0);
    }
    if (def.field) {
      const a = this.data.sample(def.field, Math.floor(this.frame), lon, lat);
      const b = this.data.sample(def.field, Math.ceil(this.frame), lon, lat);
      return mix(a, b, this.frame - Math.floor(this.frame));
    }
    return NaN;
  }

  private sampleWind(lat: number, lon: number): { speed: number; u: number; v: number } | null {
    if (!this.flow || !this.data) return null;
    const grid = this.data.gridFor(this.state?.flowLayer ? (LAYER_BY_ID[this.state.flowLayer]?.field ?? 'wind_speed_10m') : 'wind_speed_10m');
    const u = sampleGrid(this.flowU, lon, lat, grid);
    const v = sampleGrid(this.flowV, lon, lat, grid);
    const s = sampleGrid(this.flowSpeed, lon, lat, grid);
    if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(s)) return null;
    return { speed: s, u, v };
  }

  private project = (lat: number, lon: number): { x: number; y: number; front: boolean; facing: number } => {
    const la = lat * DEG, lo = lon * DEG;
    const v = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
    const facing = v.dot(this.camera.position.clone().normalize());
    const horizon = 1 / this.distance;
    const front = facing > horizon + 0.002;
    const p = v.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.width,
      y: (-p.y * 0.5 + 0.5) * this.height,
      front,
      facing: Math.max(0, Math.min(1, (facing - horizon) / Math.max(0.05, 1 - horizon))),
    };
  };

  private drawOverlay() {
    if (!this.state || !this.data) return;
    const mslpActive = this.state.fillLayer === 'mslp' || this.state.lineLayers.includes('mslp');
    const pressure = mslpActive ? this.data.frame('pressure_msl', Math.round(this.frame)) : null;
    const host: OverlayHost = {
      width: this.width, height: this.height, dpr: this.dpr,
      distance: this.distance, fullDistance: this.fullDistance,
      labels: this.state.labels,
      barbs: this.state.visualMode === 'earth' ? false : this.state.barbs,
      grid: this.state.visualMode === 'earth' ? false : this.state.grid,
      home: this.state.home, probe: this.probeScreen, time: performance.now() / 1000,
      pressure: this.state.visualMode === 'earth' ? null : pressure ? (() => { const g = this.data.gridFor('pressure_msl'); return { data: pressure, nx: g.nx, ny: g.ny, lonMin: g.lonMin, latMin: g.latMin, step: g.step }; })() : null,
      windPalette: LAYER_BY_ID.wind10.palette,
      sampleWind: (lat, lon) => this.sampleWind(lat, lon),
      project: this.project,
    };
    this.overlay.draw(host);
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;

    this.updateCamera(dt);
    this.updateUniforms(now / 1000);
    if (this.frameDirty) this.refreshData();

    this.maybeResumeTrails(now);
    if (this.state?.visualMode === 'earth' && this.data) {
      this.clouds.update(this.data, this.frame, this.frame * 0.55);
    }
    if (!this.trailsPaused && !this.rangeLoading && this.state?.visualMode !== 'earth') this.trails.update(dt);

    if (now - this.overlayAt > 70 || this.lastOverlayVersion !== this.camVersion) {
      this.overlayAt = now;
      this.lastOverlayVersion = this.camVersion;
      this.drawOverlay();
    }

    const r = this.renderer;
    r.clear();
    r.render(this.starScene, this.camera);
    r.render(this.fullScene, this.camera);

    if (!this.readySent && this.ready > 0.55) {
      this.readySent = true;
      this.onReady?.();
    }
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.detach();
    this.overlay.destroy();
    this.trails.destroy();
    this.clouds.dispose();
    for (const p of this.passes.values()) p.dispose(this.fullScene);
    this.passes.clear();
    this.fullScene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
        o.geometry?.dispose();
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m?.dispose();
      }
    });
    this.starScene.traverse((o) => {
      if (o instanceof THREE.Points) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function mix(a: number, b: number, t: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return a + (b - a) * t;
}

type Grid = { nx: number; ny: number; lonMin: number; latMin: number; step: number };
function sampleGrid(arr: Float32Array, lon: number, lat: number, g: Grid): number {
  const nx = g.nx, ny = g.ny;
  let x = ((lon - g.lonMin) / g.step) % nx;
  if (x < 0) x += nx;
  let y = (lat - g.latMin) / g.step;
  y = Math.max(0, Math.min(ny - 1.000001, y));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = (x0 + 1) % nx, y1 = Math.min(y0 + 1, ny - 1);
  const fx = x - x0, fy = y - y0;
  const a = arr[y0 * nx + x0], b = arr[y0 * nx + x1], c = arr[y1 * nx + x0], d = arr[y1 * nx + x1];
  if (a !== a || b !== b || c !== c || d !== d) return NaN;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
