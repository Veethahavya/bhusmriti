export const FULLSCREEN_VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
precision highp float;
in vec2 vNdc;
out vec4 fragColor;

uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanFov;
uniform float uAspect;
uniform vec3 uSunDir;
uniform float uNightShade;
uniform float uTime;

const float PI = 3.14159265359;

vec3 rayDir() {
  return normalize(uCamFwd + uCamRight * (vNdc.x * uTanFov * uAspect) + uCamUp * (vNdc.y * uTanFov));
}

bool hitSphere(vec3 ro, vec3 rd, out vec3 p, out float t) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  if (h < 0.0) { t = -1.0; p = vec3(0.0); return false; }
  t = -b - sqrt(h);
  if (t <= 0.0) { p = vec3(0.0); return false; }
  p = ro + rd * t;
  return true;
}

vec2 sphereUv(vec3 p) {
  float lon = atan(p.x, p.z);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

float dayFactor(vec3 n) {
  float sd = dot(n, uSunDir);
  float day = smoothstep(-0.22, 0.28, sd);
  return mix(1.0, 0.34 + 0.66 * day, uNightShade);
}
`;

export const GLOBE_FRAG = COMMON + /* glsl */ `
uniform sampler2D uBase;
uniform sampler2D uEarth;
uniform float uEarthMode;
uniform sampler2D uMask;
uniform float uReady;

void main() {
  vec3 rd = rayDir();
  vec3 p; float t;
  if (!hitSphere(uCamPos, rd, p, t)) discard;

  vec3 n = normalize(p);
  vec2 uv = sphereUv(p);
  vec3 base = uEarthMode > 0.5 ? texture(uEarth, uv).rgb : texture(uBase, uv).rgb;
  float land = texture(uMask, uv).r;

  float sunFace = smoothstep(-0.25, 0.35, dot(n, uSunDir));
  vec3 col = uEarthMode > 0.5 ? base * 1.02 : base * dayFactor(n);

  vec3 viewDir = -rd;
  vec3 h = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 52.0);
  col += vec3(0.42, 0.78, 0.9) * spec * (1.0 - land) * 0.22 * smoothstep(-0.1, 0.4, dot(n, uSunDir));

  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  col += vec3(0.1, 0.52, 0.5) * fres * 0.6;

  float tw = exp(-pow(dot(n, uSunDir) / 0.13, 2.0));
  col += vec3(1.0, 0.42, 0.16) * tw * 0.05 * uNightShade;

  col += (hash12(gl_FragCoord.xy) - 0.5) * 0.006;
  fragColor = vec4(col * uReady, 1.0);
}
`;

export const ATMOS_FRAG = COMMON + /* glsl */ `
uniform float uReady;

void main() {
  vec3 rd = rayDir();
  vec3 p; float t;
  float impact = length(cross(uCamPos, rd));
  vec3 tint = mix(vec3(0.08, 0.72, 0.66), vec3(0.18, 0.42, 0.95), 0.42);
  float glow = 0.0;

  if (hitSphere(uCamPos, rd, p, t)) {
    vec3 n = normalize(p);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.6);
    glow = fres * 0.24;
  } else {
    float g1 = exp(-pow((impact - 1.0) / 0.028, 2.0)) * 0.95;
    float g2 = exp(-pow((impact - 1.0) / 0.115, 2.0)) * 0.22;
    glow = g1 + g2;
  }
  glow *= uReady;
  fragColor = vec4(tint * glow, glow);
}
`;

export const DATA_FRAG = COMMON + /* glsl */ `
uniform sampler2D uData;
uniform sampler2D uMask;
uniform vec2 uGridMin;
uniform vec2 uGridStep;
uniform vec2 uGridCount;
uniform vec4 uPalette[8];
uniform vec4 uPalette2[8];
uniform float uStops[8];
uniform vec2 uRange;
uniform float uFill;
uniform float uContour;
uniform float uContourAlpha;
uniform vec3 uContourColor;
uniform float uOpacity;
uniform int uPattern;
uniform int uMaskMode;
uniform int uDual;
uniform float uSunShade;
uniform float uOceanDim;
uniform float uSeed;

vec4 rampA(float f) {
  vec4 c = uPalette[0];
  for (int i = 1; i < 8; i++) c = mix(c, uPalette[i], smoothstep(uStops[i - 1], uStops[i], f));
  return c;
}
vec4 rampB(float f) {
  vec4 c = uPalette2[0];
  for (int i = 1; i < 8; i++) c = mix(c, uPalette2[i], smoothstep(uStops[i - 1], uStops[i], f));
  return c;
}

float field(vec2 uv) {
  float lon = uv.x * 360.0 - 180.0;
  float lat = uv.y * 180.0 - 90.0;
  vec2 g = (vec2(lon, lat) - uGridMin) / uGridStep;
  float x = mod(g.x, uGridCount.x);
  float y = clamp(g.y, 0.0, uGridCount.y - 1.0001);
  float x0 = floor(x), y0 = floor(y);
  float fx = x - x0, fy = y - y0;
  float x1 = mod(x0 + 1.0, uGridCount.x);
  float y1 = min(y0 + 1.0, uGridCount.y - 1.0);
  float v00 = texelFetch(uData, ivec2(int(x0), int(y0)), 0).r;
  float v10 = texelFetch(uData, ivec2(int(x1), int(y0)), 0).r;
  float v01 = texelFetch(uData, ivec2(int(x0), int(y1)), 0).r;
  float v11 = texelFetch(uData, ivec2(int(x1), int(y1)), 0).r;
  if (!(v00 > -9000.0) || !(v10 > -9000.0) || !(v01 > -9000.0) || !(v11 > -9000.0)) return -9999.0;
  return mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
}

void main() {
  vec3 rd = rayDir();
  vec3 p; float t;
  if (!hitSphere(uCamPos, rd, p, t)) discard;
  vec3 n = normalize(p);
  vec2 uv = sphereUv(p);
  float land = texture(uMask, uv).r;
  if (uMaskMode == 1 && land < 0.47) discard;
  if (uMaskMode == 2 && land > 0.53) discard;

  float v = field(uv);
  if (!(v > -9000.0)) discard;

  float f = clamp((v - uRange.x) / max(1e-6, uRange.y - uRange.x), 0.0, 1.0);
  vec4 col = uDual == 1 ? (land > 0.5 ? rampA(f) : rampB(f)) : rampA(f);

  vec3 rgb = col.rgb;
  float alpha = col.a * uFill * uOpacity;

  if (uFill > 0.5) {
    if (uPattern == 1) {
      alpha *= 0.97 + 0.03 * sin(uv.y * 900.0);
    } else if (uPattern == 2) {
      vec2 q = uv * vec2(1500.0, 760.0);
      float s = sin(q.x * 2.3 + q.y * 1.1 - uTime * 2.9);
      float streak = smoothstep(0.78, 1.0, s) * smoothstep(0.02, 0.25, f);
      alpha += streak * 0.20 * uFill * uOpacity;
      rgb = mix(rgb, vec3(0.82, 0.95, 1.0), streak * 0.55);
    } else if (uPattern == 3) {
      float h = hash12(floor(gl_FragCoord.xy * 0.75) + uSeed);
      float dots = step(0.52, h) * smoothstep(0.05, 0.4, f);
      alpha += dots * 0.055;
    } else if (uPattern == 4) {
      float bands = smoothstep(0.72, 0.98, sin(uv.y * 420.0 + sin(uv.x * 80.0) * 1.2));
      alpha *= 0.9 + bands * 0.16;
    } else if (uPattern == 5) {
      float n1 = fbm(uv * vec2(14.0, 7.0) + vec2(uTime * 0.006, 0.0));
      float n2 = fbm(uv * vec2(34.0, 17.0) - vec2(uTime * 0.01, 0.0));
      float veil = smoothstep(0.32, 0.78, n1 * 0.65 + n2 * 0.45);
      alpha *= 0.55 + 0.75 * veil;
      rgb = mix(rgb, vec3(0.88, 0.94, 1.0), 0.28 * veil);
    } else if (uPattern == 6) {
      float hatch = step(0.55, fract((uv.x * 700.0 + uv.y * 420.0) * 0.5));
      alpha += hatch * 0.035 * smoothstep(0.1, 0.6, f);
    }
  }

  if (uContour > 0.0) {
    float d = abs(fract(v / uContour + 0.5) - 0.5) * uContour;
    float grad = fwidth(v);
    // A constant-valued field (especially the huge zero areas in CAPE,
    // snow, precipitation, etc.) must not paint its entire zero contour:
    // with no gradient, there is no line.
    float line = grad > 1e-7 ? (1.0 - smoothstep(0.0, max(grad * 1.15, 1e-6), d)) : 0.0;
    rgb = mix(rgb, uContourColor, line * 0.92);
    alpha = max(alpha, line * uContourAlpha * uOpacity);
  }

  rgb *= 1.04;
  rgb *= (1.0 - uOceanDim * (1.0 - land));
  rgb *= mix(1.0, 0.62 + 0.38 * smoothstep(-0.2, 0.3, dot(n, uSunDir)), uSunShade);
  rgb += (hash12(gl_FragCoord.xy + uSeed) - 0.5) * 0.008;
  fragColor = vec4(rgb, clamp(alpha, 0.0, 0.96));
}
`;

export const PARTICLE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.001) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

export const HEAD_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
uniform float uSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}
`;

export const HEAD_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r) * vAlpha;
  gl_FragColor = vec4(vColor * 1.35, a);
}
`;

export const CLOUD_FRAG = COMMON + /* glsl */ `
precision highp sampler3D;
uniform sampler2D uFieldsA0;
uniform sampler2D uFieldsA1;
uniform sampler2D uFieldsB0;
uniform sampler2D uFieldsB1;
uniform float uMix;
uniform sampler3D uNoise;
uniform float uNoiseScale;
uniform float uCloudTime;
uniform int uSteps;

const float R_IN = 1.0015;
const float R_OUT = 1.020;

bool hitShell(vec3 ro, vec3 rd, float r, out float t) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) { t = -1.0; return false; }
  t = -b - sqrt(h);
  return t > 0.0;
}

void main() {
  vec3 rd = rayDir();
  float tIn, tOut, tEarth;
  if (!hitShell(uCamPos, rd, R_OUT, tIn)) discard;
  float b = dot(uCamPos, rd);
  float c = dot(uCamPos, uCamPos) - R_OUT * R_OUT;
  tOut = -b + sqrt(max(0.0, b * b - c));
  bool earth = hitShell(uCamPos, rd, R_IN, tEarth);
  float tEnd = earth ? min(tEarth, tOut) : tOut;
  float start = max(tIn, 0.0);
  if (tEnd <= start) discard;

  float stepLen = (tEnd - start) / float(uSteps);
  float trans = 1.0;
  vec3 acc = vec3(0.0);

  for (int i = 0; i < 10; i++) {
    if (i >= uSteps) break;
    vec3 p = uCamPos + rd * (start + (float(i) + 0.5) * stepLen);
    float hgt = (length(p) - R_IN) / (R_OUT - R_IN);
    vec2 uv = sphereUv(normalize(p));
    vec4 A = mix(texture(uFieldsA0, uv), texture(uFieldsA1, uv), uMix);
    vec4 B = mix(texture(uFieldsB0, uv), texture(uFieldsB1, uv), uMix);
    float windU = (B.b - 0.5) * 2.0;
    float windV = (B.a - 0.5) * 2.0;

    vec3 np = p * uNoiseScale + vec3(windU * uCloudTime * 0.10, windV * uCloudTime * 0.10, 0.0);
    float n = texture(uNoise, np).r * 0.55
            + texture(uNoise, np * 1.87 + vec3(13.1)).r * 0.30
            + texture(uNoise, np * 3.41 + vec3(7.7)).r * 0.15;

    float cover = A.r;
    float core = smoothstep(0.42, 0.72, n + cover * 0.20);
    float dens = smoothstep(0.06, 0.24, cover) * (0.10 + 0.90 * core)
               * smoothstep(0.0, 0.18, hgt) * smoothstep(1.0, 0.58, hgt);
    if (dens > 0.002) {
      float alpha = (1.0 - exp(-dens * stepLen * 100.0)) * 0.86;
      float hue = A.a;
      vec3 thermal = mix(vec3(0.58, 0.76, 1.0), vec3(1.0, 0.74, 0.54), hue);
      vec3 col = mix(vec3(0.93, 0.95, 1.0), thermal, 0.24);
      col = mix(col, vec3(0.32, 0.52, 0.96), smoothstep(0.02, 0.55, A.g) * 0.40);
      col = mix(col, vec3(1.0, 0.44, 0.33), smoothstep(0.12, 0.80, A.b) * 0.34);
      col = mix(col, vec3(0.62, 0.76, 0.98), smoothstep(0.22, 0.88, B.g) * 0.12);

      vec3 nrm = normalize(p);
      float sun = max(dot(nrm, uSunDir), 0.0);
      float phase = pow(max(dot(rd, uSunDir), 0.0), 5.0);
      col *= 0.82 + 0.26 * sun;
      col += vec3(1.0) * phase * 0.34;

      acc += col * alpha * trans;
      trans *= (1.0 - alpha);
      if (trans < 0.02) break;
    }
  }
  if (trans > 0.998) discard;
  float alphaOut = 1.0 - trans;
  fragColor = vec4(acc / max(alphaOut, 1e-3), alphaOut);
}
`;
