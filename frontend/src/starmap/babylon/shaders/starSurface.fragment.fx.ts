export const starSurfaceFragmentShader = /* glsl */ `
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
uniform vec3 uColor;
uniform vec3 uLimbColor;
uniform vec3 uCoreColor;
uniform vec3 cameraPosition;
uniform float uKelvin;
uniform float uSeed;
uniform float uRot;
uniform float uActivity;
uniform float uTime;
uniform float uSurfaceAlpha;
uniform float uHdrGain;
uniform float uSpotCount;
uniform float uSpotStrength;
uniform float uSupergranulation;
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

// 星斑场。
//
// 每一个斑是一个方向上的余弦帽：本影（深）套在半影（浅）里，边界不锐利。
// 数量由画质分档给，强度由恒星活动性给 —— 活跃的星长斑，宁静的星几乎不长。
// 这是整颗恒星「有实体」的主要来源：暗特征是唯一穿得过 bloom 的结构。
float starSpotField(vec3 direction) {
  float coverage = 0.0;
  for (int index = 0; index < 6; ++index) {
    if (float(index) >= uSpotCount) break;
    float slot = float(index) + 1.0;
    // 斑的位置由种子决定，缓慢随自转漂移。
    float phi = hash31(vec3(slot, 3.7, 1.3)) * 6.2831853 + uRot;
    float cosTheta = hash31(vec3(slot, 9.1, 5.7)) * 1.5 - 0.75;
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    vec3 center = vec3(sinTheta * cos(phi), cosTheta, sinTheta * sin(phi));
    float angular = dot(normalize(direction), center);
    // 活动性调制的是斑**多大**，不是斑**多深**。深度是物理常数
    // （本影约是宁静光球的两成），把它当强度旋钮拧小，斑就退化成
    // 一块看不见的灰 —— 那正是提升前的样子。
    float extent = mix(0.014, 0.085, uSpotStrength) * mix(0.6, 1.0, hash31(vec3(slot, 17.3, 2.9)));
    float radius = 1.0 - extent;
    // 本影 + 半影：两段 smoothstep 拼出一个有边缘结构的斑，而不是一个模糊点。
    float penumbra = smoothstep(radius - extent * 0.85, radius + extent * 0.30, angular);
    float umbra = smoothstep(radius + extent * 0.10, radius + extent * 0.62, angular);
    coverage = max(coverage, penumbra * 0.42 + umbra * 0.58);
  }
  return clamp(coverage, 0.0, 1.0);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float facing = clamp(dot(normal, normalize(vViewDirection)), 0.0, 1.0);
  float animatedTime = uTime * 0.00008;
  vec3 direction = normalize(vLocal);

  // 两个尺度的对流：超米粒（大而慢）与米粒（小而快）。
  // 只有一个尺度时表面读起来是噪声贴图，有两个才读起来是在沸腾。
  float supergranulation = warpedGranulation(vLocal * 2.4
    + vec3(uRot * 0.35, animatedTime * 0.4, -animatedTime * 0.4));
  float granulation = warpedGranulation(vLocal * 10.5 + vec3(uRot, animatedTime, -animatedTime));
  granulation = mix(granulation, supergranulation, uSupergranulation);
  float cellular = abs(valueNoise(vLocal * 31.0 + uSeed) * 2.0 - 1.0);
  // 米粒间道：对流下沉的冷通道。它窄、暗，并且是唯一在 bloom 之后
  // 还能把「一颗球」和「一团光」区分开的高频线索。
  float lane = 1.0 - smoothstep(0.30, 0.62, abs(supergranulation - 0.5) * 2.0);

  float limb = 0.30 + 0.70 * pow(facing, 0.58);
  float heat = clamp((uKelvin - 2800.0) / 7000.0, 0.0, 1.0);
  vec3 hotCenter = mix(uColor, vec3(1.0, 0.92, 0.76), 0.42 + heat * 0.24);
  // 分层色温：视线越斜，看到的光球层越高越冷，并露出色球的暖边。
  vec3 stratified = mix(uLimbColor, hotCenter, pow(facing, 0.42));
  stratified = mix(stratified, uCoreColor, pow(facing, 6.0) * 0.32);

  float spot = starSpotField(direction);
  float spotFactor = 1.0 - 0.84 * spot;
  // 光斑：斑的外围热壁，只在临边露出来（正对视线时它是侧面，看不到）。
  float facula = clamp(spot * (1.0 - facing) * 1.4 * uSpotStrength, 0.0, 1.0);

  // 米粒对比曲线：围绕均值 0.89 取幂。均值处恒等（恢复门禁逐位不变），
  // 两侧被拉开 —— 恢复批次的跨度全部落在 KHR Neutral 的压缩段里，
  // 加再多细节观众也只看到同一块白。
  float detail = 0.34 + granulation * 0.86 + cellular * 0.24 - lane * 0.30;
  detail = 0.89 * pow(max(detail, 0.02) / 0.89, 1.85);
  // 局部色温：暗的地方是下沉的冷等离子体，亮的地方是上涌的热柱。
  // 少了这一项，暗纹只是同一个色相被调暗 —— 画面读起来是月面的灰斑，
  // 不是恒星的对流。色温跟着亮度走，它才读成「在沸腾」。
  vec3 localTint = mix(uLimbColor, stratified, smoothstep(0.10, 1.05, detail));
  vec3 detailed = localTint * max(detail, 0.04);
  float flare = uActivity * pow(max(0.0, granulation - 0.62), 3.0) * 2.4;
  // HDR: the surface has to clear the bloom threshold or the star reads as rock.
  vec3 color = (detailed * limb * spotFactor * (1.0 + facula * 0.62)
    + mix(uColor, vec3(1.0, 0.48, 0.16), 0.5) * flare) * uHdrGain;
  gl_FragColor = vec4(min(color, vec3(6.0)), clamp(uSurfaceAlpha, 0.0, 1.0));
}
`
