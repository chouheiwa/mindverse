export const planetGroundFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform vec3 uRockColor;
uniform vec3 uHorizonColor;
uniform float uSeed;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

vec3 safeDirection(vec3 value) {
  return value / max(length(value), 0.0001);
}
// 只调制外观的哈希噪声：几何在 CPU 上，这里的数值不需要跨端一致。
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3) + uSeed);
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, u.x);
  float x10 = mix(n010, n110, u.x);
  float x01 = mix(n001, n101, u.x);
  float x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
float fbm(vec3 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave += 1) {
    total += valueNoise(p) * amplitude;
    p = p * 2.03 + vec3(11.7, 5.3, 2.9);
    amplitude *= 0.5;
  }
  return total;
}
void main(void) {
  vec3 local = vWorldPosition - uPlanetCenter;
  vec3 up = safeDirection(local);
  vec3 surfaceNormal = safeDirection(vWorldNormal);
  vec3 sun = safeDirection(uSunDirection);
  float radius = max(uPlanetRadius, 0.0001);
  // 以行星半径为单位取样：换一颗大小不同的行星，岩理密度看起来一致。
  vec3 probe = local * (48.0 / radius);
  float grain = fbm(probe);
  float fine = valueNoise(probe * 7.0) * 0.7 + valueNoise(probe * 29.0) * 0.3;
  float patches = fbm(probe * 0.11);
  // 坡向露岩：越陡越露出深色岩石；噪声让边界不规则。
  float slope = 1.0 - clamp(dot(surfaceNormal, up), 0.0, 1.0);
  float rocky = smoothstep(0.05, 0.28, slope + (grain - 0.5) * 0.18);
  vec3 albedo = mix(uBaseColor, uAccentColor, smoothstep(0.35, 0.72, patches + (grain - 0.5) * 0.4));
  albedo = mix(albedo, uRockColor, rocky);
  albedo *= 0.8 + 0.4 * fine;
  // 光照：太阳的朗伯项 + 半球天光（朝天亮、朝地暗）。
  float daylight = clamp(dot(surfaceNormal, sun), 0.0, 1.0);
  float skyLight = 0.5 + 0.5 * dot(surfaceNormal, up);
  vec3 lit = albedo * (daylight * 1.25 + skyLight * uHorizonColor * 0.9 + 0.04);
  // 远处融进地平线的空气：距离按行星半径计。
  float eyeDistance = length(vWorldPosition - uCameraPosition);
  float haze = 1.0 - exp(-eyeDistance / (radius * 0.55));
  vec3 color = mix(lit, uHorizonColor * (0.55 + 0.45 * clamp(dot(up, sun), 0.0, 1.0)), haze * 0.6);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`
