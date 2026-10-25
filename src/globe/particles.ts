import * as THREE from 'three';
import { hexToRgba, samplePalette } from '../lib/color';
import type { Palette } from '../data/types';
import { HEAD_FRAG, HEAD_VERT, PARTICLE_FRAG, PARTICLE_VERT } from './shaders';

const H = 9;
const DEG = Math.PI / 180;

export type FlowField = {
  u: Float32Array;
  v: Float32Array;
  speed: Float32Array;
  color: Float32Array;
  colorRange: [number, number];
  palette: Palette;
  speedRange: [number, number];
  grid: { nx: number; ny: number; lonMin: number; latMin: number; step: number };
};

type RGB = [number, number, number];

function lut(palette: Palette, n = 96): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hexToRgba(samplePalette(palette, i / (n - 1)));
    out.push([r, g, b]);
  }
  return out;
}

function sampleGrid(arr: Float32Array, lon: number, lat: number, g: { nx: number; ny: number; lonMin: number; latMin: number; step: number }): number {
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

export class WindParticles {
  group: THREE.Group;
  private lines: THREE.LineSegments;
  private heads: THREE.Points;
  private lineGeo: THREE.BufferGeometry;
  private headGeo: THREE.BufferGeometry;
  private lineMat: THREE.ShaderMaterial;
  private headMat: THREE.ShaderMaterial;
  private n = 0;
  private lon = new Float32Array(0);
  private lat = new Float32Array(0);
  private age = new Float32Array(0);
  private life = new Float32Array(0);
  private histLon = new Float32Array(0);
  private histLat = new Float32Array(0);
  private segPos = new Float32Array(0);
  private segCol = new Float32Array(0);
  private segAlpha = new Float32Array(0);
  private headPos = new Float32Array(0);
  private headCol = new Float32Array(0);
  private headAlpha = new Float32Array(0);
  private lutCache: RGB[] = [];
  private lutKey = '';
  private flow: FlowField | null = null;
  private density = 1;
  private mobile = false;
  private histAcc = 0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.renderOrder = 50;
    this.lineGeo = new THREE.BufferGeometry();
    this.headGeo = new THREE.BufferGeometry();
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.headMat = new THREE.ShaderMaterial({
      vertexShader: HEAD_VERT,
      fragmentShader: HEAD_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: 2.6 } },
    });
    this.lines = new THREE.LineSegments(this.lineGeo, this.lineMat);
    this.lines.frustumCulled = false;
    this.heads = new THREE.Points(this.headGeo, this.headMat);
    this.heads.frustumCulled = false;
    this.group.add(this.lines, this.heads);
    scene.add(this.group);
    this.mobile = window.innerWidth < 800 || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.resize(3500);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  setDensity(d: number) {
    this.density = d;
    const n = Math.round((this.mobile ? 1300 : 3500) * d);
    this.resize(Math.max(1200, Math.min(8200, n)));
  }

  setPixelRatio(dpr: number) {
    this.headMat.uniforms.uSize.value = 2.6 * Math.min(2, dpr);
  }

  setFlow(flow: FlowField | null) {
    this.flow = flow;
    if (flow) {
      const key = flow.palette.map((p) => p[1]).join('|');
      if (key !== this.lutKey) {
        this.lutCache = lut(flow.palette);
        this.lutKey = key;
      }
    }
  }

  private resize(n: number) {
    if (n === this.n) return;
    this.n = n;
    this.lon = new Float32Array(n);
    this.lat = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.histLon = new Float32Array(n * H);
    this.histLat = new Float32Array(n * H);
    this.segPos = new Float32Array(n * (H - 1) * 2 * 3);
    this.segCol = new Float32Array(n * (H - 1) * 2 * 3);
    this.segAlpha = new Float32Array(n * (H - 1) * 2);
    this.headPos = new Float32Array(n * 3);
    this.headCol = new Float32Array(n * 3);
    this.headAlpha = new Float32Array(n);

    this.lineGeo.dispose();
    this.headGeo.dispose();
    this.lineGeo = new THREE.BufferGeometry();
    this.headGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.segPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute('aColor', new THREE.BufferAttribute(this.segCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.segAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setAttribute('aColor', new THREE.BufferAttribute(this.headCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.headAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.lines.geometry = this.lineGeo;
    this.heads.geometry = this.headGeo;
    for (let i = 0; i < n; i++) this.spawn(i, 15, 40, Math.PI * 0.48, true);
  }

  private spawn(i: number, cLat: number, cLon: number, radius: number, immediate = false) {
    const la = cLat * DEG, lo = cLon * DEG;
    const cx = Math.cos(la) * Math.sin(lo), cy = Math.sin(la), cz = Math.cos(la) * Math.cos(lo);
    let ex = -Math.cos(lo), ez = Math.sin(lo);
    const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
    const nx = -Math.sin(la) * Math.sin(lo), ny = Math.cos(la), nz = -Math.sin(la) * Math.cos(lo);
    const theta = radius * Math.sqrt(Math.random());
    const phi = Math.random() * Math.PI * 2;
    const st = Math.sin(theta), ct = Math.cos(theta), cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = cx * ct + (ex * cp + nx * sp) * st;
    const dy = cy * ct + (ny * sp) * st;
    const dz = cz * ct + (ez * cp + nz * sp) * st;
    const lat = Math.asin(Math.max(-1, Math.min(1, dy))) / DEG;
    const lon = Math.atan2(dx, dz) / DEG;
    this.lon[i] = lon;
    this.lat[i] = lat;
    this.age[i] = immediate ? Math.random() * 8 : 0;
    this.life[i] = 7 + Math.random() * 10;
    for (let j = 0; j < H; j++) {
      this.histLon[i * H + j] = lon;
      this.histLat[i * H + j] = lat;
    }
  }

  update(
    dt: number, time: number,
    camPos: THREE.Vector3, distance: number,
    viewLat: number, viewLon: number,
  ) {
    if (!this.flow || !this.group.visible) return;
    const f = this.flow;
    const n = this.n;
    const cap = Math.min(Math.acos(Math.min(1, 1 / distance)), 1.05);
    const speedK = 80000 * Math.max(0.045, Math.min(1, (distance - 1) / 2.55));
    const camLen = camPos.length();
    const horizon = 1 / camLen;

    let vi = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      let lon = this.lon[i];
      let lat = this.lat[i];
      const spd = sampleGrid(f.speed, lon, lat, f.grid);
      const u = sampleGrid(f.u, lon, lat, f.grid);
      const v = sampleGrid(f.v, lon, lat, f.grid);

      if (!(spd > 0) || !Number.isFinite(u) || !Number.isFinite(v)) {
        this.spawn(i, viewLat, viewLon, cap, true);
        lon = this.lon[i]; lat = this.lat[i];
      } else {
        const cosLat = Math.max(0.15, Math.cos(lat * DEG));
        const dLon = (u / (111320 * cosLat)) * dt * speedK;
        const dLat = (v / 110540) * dt * speedK;
        let nlon = lon + dLon;
        if (nlon > 180) nlon -= 360;
        if (nlon < -180) nlon += 360;
        const nlat = Math.max(-89.4, Math.min(89.4, lat + dLat));
        if (Math.abs(nlon - lon) > 20) {
          for (let j = 0; j < H; j++) { this.histLon[i * H + j] = nlon; this.histLat[i * H + j] = nlat; }
        }
        lon = nlon; lat = nlat;
        this.lon[i] = lon; this.lat[i] = lat;
      }

      this.age[i] += dt;
      if (this.age[i] > this.life[i]) {
        this.spawn(i, viewLat, viewLon, cap);
        lon = this.lon[i]; lat = this.lat[i];
      }

      // trail history is sampled at ~10 Hz, then the head is always current
      this.histAcc += dt;
      const interval = 0.075 * Math.min(1, Math.max(0.22, (distance - 1) / 2.2));
      const shift = this.histAcc >= interval;
      if (shift) this.histAcc = 0;
      const base = i * H;
      if (shift) {
        for (let j = 0; j < H - 1; j++) {
          this.histLon[base + j] = this.histLon[base + j + 1];
          this.histLat[base + j] = this.histLat[base + j + 1];
        }
      }
      this.histLon[base + H - 1] = lon;
      this.histLat[base + H - 1] = lat;

      // colour
      let cVal = spd;
      let cRange = f.speedRange;
      if (f.color.length && f.color[0] === f.color[0]) {
        const cv = sampleGrid(f.color, lon, lat, f.grid);
        if (Number.isFinite(cv)) { cVal = cv; cRange = f.colorRange; }
      }
      const t = Math.max(0, Math.min(1, (cVal - cRange[0]) / Math.max(1e-6, cRange[1] - cRange[0])));
      const rgb = this.lutCache[Math.round(t * (this.lutCache.length - 1))] ?? [0.7, 0.95, 0.95];

      // head
      const hp = this.toXYZ(lon, lat, 1.0035);
      const facing = (hp[0] * camPos.x + hp[1] * camPos.y + hp[2] * camPos.z) / camLen;
      const vis = smoothstep(horizon, horizon + 0.12, facing);
      this.headPos[hi * 3] = hp[0]; this.headPos[hi * 3 + 1] = hp[1]; this.headPos[hi * 3 + 2] = hp[2];
      this.headCol[hi * 3] = rgb[0]; this.headCol[hi * 3 + 1] = rgb[1]; this.headCol[hi * 3 + 2] = rgb[2];
      this.headAlpha[hi] = vis * 0.8;
      hi++;

      // trail
      const baseAlpha = Math.min(0.65, 0.20 + spd / 200);
      for (let j = 0; j < H - 1; j++) {
        const la = this.histLat[base + j], lo = this.histLon[base + j];
        const lb = this.histLat[base + j + 1], lob = this.histLon[base + j + 1];
        const A = this.toXYZ(lo, la, 1.0035);
        const B = this.toXYZ(lob, lb, 1.0035);
        const mid = this.toXYZ((lo + lob) / 2, (la + lb) / 2, 1.0035);
        const fa = (mid[0] * camPos.x + mid[1] * camPos.y + mid[2] * camPos.z) / camLen;
        const vv = smoothstep(horizon, horizon + 0.12, fa);
        const alpha = baseAlpha * vv * Math.pow((j + 1) / (H - 1), 1.7);
        const a = vi * 3, b = (vi + 1) * 3;
        this.segPos[a] = A[0]; this.segPos[a + 1] = A[1]; this.segPos[a + 2] = A[2];
        this.segPos[b] = B[0]; this.segPos[b + 1] = B[1]; this.segPos[b + 2] = B[2];
        this.segCol[a] = rgb[0]; this.segCol[a + 1] = rgb[1]; this.segCol[a + 2] = rgb[2];
        this.segCol[b] = rgb[0]; this.segCol[b + 1] = rgb[1]; this.segCol[b + 2] = rgb[2];
        this.segAlpha[vi] = alpha;
        this.segAlpha[vi + 1] = alpha * 0.92;
        vi += 2;
      }
    }

    this.lineGeo.setDrawRange(0, vi);
    this.headGeo.setDrawRange(0, hi);
    (this.lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.lineGeo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.lineGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.headGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.headGeo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.headGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  private toXYZ(lon: number, lat: number, r: number): [number, number, number] {
    const la = lat * DEG, lo = lon * DEG;
    return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}
