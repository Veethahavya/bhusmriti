import * as THREE from 'three';
import { FULLSCREEN_VERT, FLOW_FRAG } from './shaders';

/** Pre-rendered datashader flow raster over the globe. */
export class FlowPass {
  mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;
  private url = '';
  private wanted = false;
  private texA: THREE.Texture | null = null;
  private texB: THREE.Texture | null = null;
  private loader = new THREE.TextureLoader();
  private cache = new Map<string, THREE.Texture>();
  private pending = new Set<string>();

  constructor(scene: THREE.Scene, common: Record<string, THREE.IUniform>) {
    this.uniforms = {
      ...common,
      uFlowMapA: { value: null },
      uFlowMapB: { value: null },
      uFlowMix: { value: 0 },
      uFlowOpacity: { value: 0.95 },
    };
    const mat = new THREE.RawShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FLOW_FRAG,
      uniforms: this.uniforms,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private load(url: string, onDone?: (tex: THREE.Texture) => void) {
    if (this.cache.has(url)) {
      const tex = this.cache.get(url)!;
      onDone?.(tex);
      return;
    }
    if (this.pending.has(url)) return;
    this.pending.add(url);
    this.loader.load(url, (tex) => {
      this.pending.delete(url);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.cache.set(url, tex);
      onDone?.(tex);
    }, undefined, () => { this.pending.delete(url); });
  }

  preload(urls: string[]) {
    for (const u of urls) this.load(u);
  }

  setFlowPair(urlA: string | null, urlB: string | null, mix: number) {
    if (!urlA || !urlB) {
      this.mesh.visible = false;
      return;
    }
    this.url = urlA;
    this.load(urlA, (tex) => {
      if (this.url !== urlA) return;
      this.texA = tex;
      this.uniforms.uFlowMapA.value = tex;
      this.mesh.visible = this.wanted;
    });
    this.load(urlB, (tex) => {
      if (this.url !== urlA) return;
      this.texB = tex;
      this.uniforms.uFlowMapB.value = tex;
    });
    this.uniforms.uFlowMix.value = mix;
  }

  setVisible(v: boolean) {
    this.wanted = v;
    this.mesh.visible = v && !!this.texA;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    for (const tex of this.cache.values()) tex.dispose();
    this.cache.clear();
  }
}
