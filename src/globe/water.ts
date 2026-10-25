import * as THREE from 'three';
import { FULLSCREEN_VERT, WATER_FRAG } from './shaders';
import type { AtmosData } from '../data/snapshot';

const NX = 180;
const NY = 91;

/** Translucent temperature-coloured water + surface-current ripples for EARTH. */
export class WaterPass {
  mesh: THREE.Mesh;
  private data: Uint8Array;
  private tex: THREE.DataTexture;
  private uniforms: Record<string, THREE.IUniform>;
  private lastT = -1;
  private lastData: AtmosData | null = null;
  private available = false;
  private wanted = false;

  constructor(scene: THREE.Scene, common: Record<string, THREE.IUniform>, mask: THREE.IUniform) {
    this.data = new Uint8Array(NX * NY * 4);
    this.tex = new THREE.DataTexture(this.data, NX, NY, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.flipY = false;
    this.tex.needsUpdate = true;
    this.uniforms = {
      ...common,
      uMask: mask,
      uWater: { value: this.tex },
      uWaterTime: { value: 0 },
    };
    const mat = new THREE.RawShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: this.uniforms,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setVisible(v: boolean) {
    this.wanted = v;
    this.mesh.visible = v && this.available;
  }

  private build(data: AtmosData, t: number) {
    const hasSst = data.has('sea_surface_temperature');
    const hasCur = data.has('ocean_current_velocity') && data.has('ocean_current_direction');
    this.available = hasSst && hasCur;
    if (!this.available) return;
    for (let y = 0; y < NY; y++) {
      const lat = -90 + y * 2;
      for (let x = 0; x < NX; x++) {
        const lon = -180 + x * 2;
        const sst = data.sample('sea_surface_temperature', t, lon, lat);
        const spd = data.sample('ocean_current_velocity', t, lon, lat);
        const dir = data.sample('ocean_current_direction', t, lon, lat);
        const i = (x + y * NX) * 4;
        if (!Number.isFinite(sst) || !Number.isFinite(spd) || !Number.isFinite(dir)) {
          this.data[i] = 0; this.data[i + 1] = 0; this.data[i + 2] = 128; this.data[i + 3] = 128;
          continue;
        }
        const a = (dir * Math.PI) / 180;
        const u = -spd * Math.sin(a), v = -spd * Math.cos(a);
        this.data[i] = Math.round(Math.max(0, Math.min(1, (sst + 2) / 34)) * 255);
        this.data[i + 1] = Math.round(Math.max(0, Math.min(1, spd / 12)) * 255);
        this.data[i + 2] = Math.round(Math.max(0, Math.min(1, 0.5 + u / 24)) * 255);
        this.data[i + 3] = Math.round(Math.max(0, Math.min(1, 0.5 + v / 24)) * 255);
      }
    }
    this.tex.needsUpdate = true;
  }

  update(data: AtmosData, frame: number) {
    const t = Math.max(0, Math.min(data.times.length - 1, Math.round(frame)));
    if (t !== this.lastT || data !== this.lastData) {
      this.build(data, t);
      this.lastT = t; this.lastData = data;
    }
    if (this.available) this.mesh.visible = this.wanted;
    this.uniforms.uWaterTime.value = frame * 0.42;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}
