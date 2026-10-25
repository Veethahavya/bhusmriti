import * as THREE from 'three';
import type { AtmosData } from '../data/snapshot';
import { FULLSCREEN_VERT } from './shaders';
import { CLOUD_FRAG } from './shaders';

const NX = 180;
const NY = 91;

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

function noiseTexture(): THREE.Data3DTexture {
  const N = 64;
  const data = new Uint8Array(N * N * N);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N * 8, py = y / N * 8, pz = z / N * 8;
    let v = 0, amp = 0.55, freq = 1;
    for (let o = 0; o < 4; o++) {
      v += amp * vnoise3(px * freq, py * freq, pz * freq);
      freq *= 2.03; amp *= 0.48;
    }
    data[x + N * (y + N * z)] = Math.max(0, Math.min(255, Math.round((v - 0.2) * 300)));
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export class CloudPass {
  mesh: THREE.Mesh;
  private dataA: Uint8Array;
  private dataB: Uint8Array;
  private texA: THREE.DataTexture;
  private texB: THREE.DataTexture;
  private noise: THREE.Data3DTexture;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene, common: Record<string, THREE.IUniform>) {
    this.dataA = new Uint8Array(NX * NY * 4);
    this.dataB = new Uint8Array(NX * NY * 4);
    this.texA = new THREE.DataTexture(this.dataA, NX, NY, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texB = new THREE.DataTexture(this.dataB, NX, NY, THREE.RGBAFormat, THREE.UnsignedByteType);
    for (const t of [this.texA, this.texB]) {
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.flipY = false;
      t.needsUpdate = true;
    }
    this.noise = noiseTexture();
    this.uniforms = {
      ...common,
      uFieldsA: { value: this.texA },
      uFieldsB: { value: this.texB },
      uNoise: { value: this.noise },
      uNoiseScale: { value: 4.2 },
      uSteps: { value: window.innerWidth < 760 ? 5 : 8 },
      uCloudTime: { value: 0 },
    };
    const mat = new THREE.RawShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: this.uniforms,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setVisible(v: boolean) { this.mesh.visible = v; }

  update(data: AtmosData, frame: number, time: number) {
    const t = Math.round(frame);
    const has = (f: string) => data.has(f);
    for (let y = 0; y < NY; y++) {
      const lat = -90 + y * 2;
      for (let x = 0; x < NX; x++) {
        const lon = -180 + x * 2;
        const rh = has('relative_humidity_2m') ? data.sample('relative_humidity_2m', t, lon, lat) : 55;
        const pw = has('total_precipitable_water') ? data.sample('total_precipitable_water', t, lon, lat) : 20;
        const cc = has('cloud_cover') ? data.sample('cloud_cover', t, lon, lat) : NaN;
        const pr = has('precipitation') ? data.sample('precipitation', t, lon, lat) : 0;
        const cape = has('cape') ? data.sample('cape', t, lon, lat) : 0;
        const temp = has('temperature_2m') ? data.sample('temperature_2m', t, lon, lat) : 10;
        const ws = has('wind_speed_10m') ? data.sample('wind_speed_10m', t, lon, lat) : 0;
        const wd = has('wind_direction_10m') ? data.sample('wind_direction_10m', t, lon, lat) : 0;
        const cloud = Number.isFinite(cc) ? Math.max(0, Math.min(1, cc / 100))
          : Math.max(0, Math.min(1, Math.max(0, (rh - 55) / 45) * 0.9 + Math.min(1, pw / 70) * 0.35));
        const precip = Math.max(0, Math.min(1, (Number.isFinite(pr) ? pr : 0) / 14));
        const capeN = Math.max(0, Math.min(1, (Number.isFinite(cape) ? cape : 0) / 4500));
        const tempN = Math.max(0, Math.min(1, ((Number.isFinite(temp) ? temp : 10) + 45) / 95));
        const rhN = Math.max(0, Math.min(1, (Number.isFinite(rh) ? rh : 55) / 100));
        const pwN = Math.max(0, Math.min(1, (Number.isFinite(pw) ? pw : 20) / 80));
        const sp = Number.isFinite(ws) ? ws : 0;
        const dr = (Number.isFinite(wd) ? wd : 0) * Math.PI / 180;
        const u = -sp * Math.sin(dr), v = -sp * Math.cos(dr);
        const i = (x + y * NX) * 4;
        this.dataA[i] = Math.round(cloud * 255); this.dataA[i + 1] = Math.round(precip * 255);
        this.dataA[i + 2] = Math.round(capeN * 255); this.dataA[i + 3] = Math.round(tempN * 255);
        this.dataB[i] = Math.round(rhN * 255); this.dataB[i + 1] = Math.round(pwN * 255);
        this.dataB[i + 2] = Math.round(Math.max(0, Math.min(1, 0.5 + u / 70)) * 255);
        this.dataB[i + 3] = Math.round(Math.max(0, Math.min(1, 0.5 + v / 70)) * 255);
      }
    }
    this.texA.needsUpdate = true;
    this.texB.needsUpdate = true;
    this.uniforms.uCloudTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texA.dispose(); this.texB.dispose(); this.noise.dispose();
  }
}
