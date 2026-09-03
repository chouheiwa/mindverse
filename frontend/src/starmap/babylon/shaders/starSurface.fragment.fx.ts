export const starSurfaceFragmentShader = /* glsl */ `
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
uniform vec3 uColor;
uniform vec3 cameraPosition;
uniform float uKelvin;
uniform float uSeed;
uniform float uRot;
uniform float uActivity;
uniform float uTime;
uniform float uSurfaceAlpha;
varying vec3 vLocal;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + uSeed * 17.17) * 43758.5453123);
}
float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 blend = fract(point);
  blend = blend * blend * (3.0 - 2.0 * blend);
  float low = mix(mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), blend.x),
    mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), blend.x), blend.y);
  float high = mix(mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), blend.x),
    mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0)), blend.x), blend.y);
  return mix(low, high, blend.z);
}
float warpedGranulation(vec3 point) {
  vec3 warp = vec3(valueNoise(point * 2.1), valueNoise(point * 2.1 + 9.7), valueNoise(point * 2.1 - 5.3));
  float result = 0.0;
  float weight = 0.54;
  for (int i = 0; i < 4; ++i) {
    #if STAR_NOISE_OCTAVES == 2
      if (i >= 2) break;
    #elif STAR_NOISE_OCTAVES == 3
      if (i >= 3) break;
    #endif
    result += valueNoise(point + warp * 1.7) * weight;
    point *= 2.17;
    weight *= 0.52;
  }
  return result;
}
void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float animatedTime = uTime * 0.00008;
  float granulation = warpedGranulation(vLocal * 7.0 + vec3(uRot, animatedTime, -animatedTime));
  float cellular = abs(valueNoise(vLocal * 31.0 + uSeed) * 2.0 - 1.0);
  float limb = 0.30 + 0.70 * pow(max(dot(normal, normalize(vViewDirection)), 0.0), 0.58);
  float heat = clamp((uKelvin - 2800.0) / 7000.0, 0.0, 1.0);
  vec3 hotCenter = mix(uColor, vec3(1.0, 0.92, 0.76), 0.42 + heat * 0.24);
  vec3 detailed = hotCenter * (0.62 + granulation * 0.42 + cellular * 0.12);
  float flare = uActivity * pow(max(0.0, granulation - 0.62), 3.0) * 2.4;
  vec3 color = detailed * limb + mix(uColor, vec3(1.0, 0.48, 0.16), 0.5) * flare;
  gl_FragColor = vec4(min(color, vec3(2.8)), clamp(uSurfaceAlpha, 0.0, 1.0));
}
`
