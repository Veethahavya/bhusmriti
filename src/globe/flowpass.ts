import * as THREE from 'three';
import { FULLSCREEN_VERT, FLOW_FRAG } from './shaders';

/** Pre-rendered datashader flow raster over the globe. */
export class FlowPass {
  mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;
  private url = '';
  private wanted = false;
  private tex: THREE.Texture | null = null;
  private loader = new THREE.TextureLoader();

  constructor(scene: THREE.Scene, common: Record<string, THREE.IUniform>) {
    this.uniforms = {
      ...common,
      uFlowMap: { value: null },
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

  setFlow(url: string | null) {
    if (!url) {
      this.mesh.visible = false;
      return;
    }
    if (url === this.url && this.tex) {
      this.mesh.visible = this.wanted;
      return;
    }
    this.url = url;
    this.loader.load(url, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tex?.dispose();
      this.tex = tex;
      this.uniforms.uFlowMap.value = tex;
      this.mesh.visible = this.wanted;
    }, undefined, () => { this.mesh.visible = false; });
  }

  setVisible(v: boolean) {
    this.wanted = v;
    this.mesh.visible = v && !!this.tex;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex?.dispose();
  }
}
