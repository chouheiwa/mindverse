export const planetFragmentShader = /* glsl */ `
precision highp float;

uniform vec4 uThermal;
uniform float uThermalIce;
uniform float uFreshness;
uniform float uCreated;
uniform float uCollected;
uniform float uSelected;
uniform float uTime;
uniform float uSeed;
uniform float uCraterDensity;
uniform float uIncident;
uniform float uReveal;
uniform float uCloudCoverage;
uniform float uCloudSpeed;
uniform float uNightLights;
uniform float uSnowLine;
uniform float uLavaGlow;
uniform float uIceFracture;
uniform float uCraterVisibility;
uniform int uCloudOctaves;
uniform float uHovered;
uniform float uInteractionRim;
uniform vec3 uInteractionColor;
uniform vec3 uLightDirection;
uniform vec3 uCameraPosition;

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vWorldRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

const float PI = 3.14159265359;
const vec3 DIELECTRIC_F0 = vec3(0.04);

float distributionGGX(vec3 normalDirection, vec3 halfwayDirection, float roughness) {
  float alpha = roughness * roughness;
  float alphaSquared = alpha * alpha;
  float NoH = max(dot(normalDirection, halfwayDirection), 0.0);
  float denominator = NoH * NoH * (alphaSquared - 1.0) + 1.0;
  return alphaSquared / max(PI * denominator * denominator, 0.0001);
}

float geometrySchlickGGX(float NoX, float roughness) {
  float r = roughness + 1.0;
  float k = r * r * 0.125;
  return NoX / max(NoX * (1.0 - k) + k, 0.0001);
}

float geometrySmith(vec3 normalDirection, vec3 viewDirection, vec3 lightDirection, float roughness) {
  float NoV = max(dot(normalDirection, viewDirection), 0.0);
  float NoL = max(dot(normalDirection, lightDirection), 0.0);
  return geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
}

vec3 fresnelSchlick(float cosine, vec3 reflectanceAtNormal) {
  return reflectanceAtNormal + (1.0 - reflectanceAtNormal) * pow(1.0 - cosine, 5.0);
}

float materialHash(vec3 cell) {
  return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7)) + uSeed * 0.000071) * 43758.5453);
}

float materialFbm(vec3 point, int octaveCount);

float materialNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 fade = local * local * (3.0 - 2.0 * local);
  float x00 = mix(materialHash(cell), materialHash(cell + vec3(1.0, 0.0, 0.0)), fade.x);
  float x10 = mix(materialHash(cell + vec3(0.0, 1.0, 0.0)), materialHash(cell + vec3(1.0, 1.0, 0.0)), fade.x);
  float x01 = mix(materialHash(cell + vec3(0.0, 0.0, 1.0)), materialHash(cell + vec3(1.0, 0.0, 1.0)), fade.x);
  float x11 = mix(materialHash(cell + vec3(0.0, 1.0, 1.0)), materialHash(cell + vec3(1.0, 1.0, 1.0)), fade.x);
  return mix(mix(x00, x10, fade.y), mix(x01, x11, fade.y), fade.z);
}

float materialFbm(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.55;
  float normalization = 0.0;
  for (int octave = 0; octave < 4; octave++) {
    if (octave >= octaveCount) break;
    sum += materialNoise(point) * amplitude;
    normalization += amplitude;
    point = point * 2.11 + vec3(9.7, 3.3, 15.1);
    amplitude *= 0.52;
  }
  return sum / max(normalization, 0.0001);
}

// 云层。
//
// 它是一层**独立于地形**的场：跟着自己的角速度转，所以近景里能看出
// 「地在下、云在上」。域扭曲让云带成涡而不是斑点，纬向拉伸让它成带
// —— 行星的科里奥利力把云挤成带状，这是行星读起来像行星的关键之一。
float cloudField(vec3 direction, float phase) {
  vec3 drift = vec3(sin(phase) * 0.42, 0.0, cos(phase) * 0.42);
  vec3 banded = vec3(direction.x, direction.y * 2.6, direction.z);
  vec3 warp = vec3(
    materialFbm(banded * 1.9 + drift, 2),
    materialFbm(banded * 1.9 + drift + vec3(5.1, 1.7, 9.3), 2),
    materialFbm(banded * 1.9 + drift - vec3(3.7, 8.1, 2.3), 2)
  ) * 2.0 - 1.0;
  float base = materialFbm(banded * 2.7 + warp * 0.85 + drift, uCloudOctaves);
  // 覆盖度直接抬高低频场再切阈值：覆盖度低时只剩几条卷云，
  // 高时连成整片，中间是有洞的云海 —— 一个参数走完三种天气。
  float threshold = mix(0.72, 0.26, uCloudCoverage);
  return smoothstep(threshold, threshold + 0.20, base);
}

void main(void) {
  vec3 magma = vec3(0.78, 0.075, 0.012);
  vec3 desert = vec3(0.76, 0.42, 0.10);
  vec3 rock = vec3(0.31, 0.34, 0.40);
  vec3 tundra = vec3(0.20, 0.46, 0.39);
  vec3 ice = vec3(0.42, 0.70, 0.96);

  float latitude = abs(normalize(vRadial).y);
  // 雪线由入射能量与冰权重一起算出来（planetAppearance.snowLine）：星越远，
  // 冰盖越往赤道压。海拔也算数 —— 高原上的雪线更低，那是山才有的读感。
  //
  // 上缘必须由下缘推出来。两个边各自独立算的时候，冰行星会得到
  // edge0 = 0.42 > edge1 ≈ 0.287 —— GLSL 规定 smoothstep 在 edge0 >= edge1
  // 时未定义，实测是极冠整个翻转（冰盖长在赤道、两极裸露）。
  float snowStart = clamp(uSnowLine - max(vHeight, 0.0) * 0.55, 0.05, 0.99);
  float polarMask = smoothstep(snowStart, min(0.995, snowStart + 0.22), latitude);
  float highlandMask = smoothstep(0.10, 0.42, vHeight);
  float basinMask = 1.0 - smoothstep(-0.30, 0.08, vHeight);
  float hotZone = uThermal.x * (1.0 - polarMask) * smoothstep(-0.08, 0.24, vHeight);
  float thermalTotal = dot(uThermal, vec4(1.0)) + uThermalIce;
  vec3 thermalBase = (magma * uThermal.x + desert * uThermal.y + rock * uThermal.z
    + tundra * uThermal.w + ice * uThermalIce) / max(thermalTotal, 0.0001);
  float exposedRock = clamp((highlandMask * 0.18 + basinMask * 0.06 + vCraterMask * 0.12)
    * (1.0 - uThermalIce * 0.72) * (1.0 - uThermal.x * 0.55), 0.0, 0.28);
  float iceCoverage = clamp(uThermalIce * (0.74 + polarMask * 0.24)
    + uThermal.w * polarMask * 0.24, 0.0, 0.98);
  vec3 baseColor = mix(thermalBase, rock, exposedRock);
  baseColor = mix(baseColor, ice, iceCoverage);
  baseColor *= 0.82 + highlandMask * 0.18 + basinMask * 0.06;
  float geologicalTone = clamp(1.0 + vHeight * 0.24 + vRidgeMask * 0.10
    - vCraterMask * (0.12 + uCraterVisibility * 0.34), 0.62, 1.18);
  float microTone = clamp(1.0 + vRelief * 0.16, 0.90, 1.10);
  baseColor *= geologicalTone * microTone;

  // Thermal materials share geometry but not a generic painted texture.
  // These masks alter albedo only, preserving the smooth radial terminator.
  vec3 materialDirection = normalize(vRadial);
  float coarseMaterial = materialNoise(materialDirection * 5.5);
  float fineMaterial = materialNoise(materialDirection * 13.0 + vec3(7.3, 3.1, 11.7));
  float duneStrata = pow(0.5 + 0.5 * sin((materialDirection.y * 18.0
    + materialDirection.x * 4.0 + coarseMaterial * 3.2) * PI), 2.0);
  float rockMottle = smoothstep(0.34, 0.72, coarseMaterial * 0.62 + fineMaterial * 0.38);
  float tundraPatches = smoothstep(0.43, 0.67,
    materialNoise(materialDirection * 7.5 + vec3(19.0, 2.0, 5.0)));
  float rockDarkMask = max(rockMottle, vCraterMask * 0.85);
  float rockLightMask = (1.0 - rockMottle) * smoothstep(0.56, 0.78, fineMaterial);
  float tundraDarkMask = max(tundraPatches, vRidgeMask * 0.85);
  float tundraRidgeMask = (1.0 - tundraPatches) * smoothstep(0.58, 0.80, fineMaterial);
  float iceFractures = pow(1.0 - abs(materialNoise(materialDirection * 19.0
    + vec3(3.0, 17.0, 9.0)) * 2.0 - 1.0), 8.0);
  baseColor = mix(baseColor, vec3(0.28, 0.035, 0.012), uThermal.x * rockMottle * 0.12);
  baseColor = mix(baseColor, vec3(0.42, 0.20, 0.035), uThermal.y * duneStrata * 0.32);
  baseColor = mix(baseColor, vec3(0.075, 0.09, 0.12), uThermal.z * rockDarkMask * 0.62);
  baseColor = mix(baseColor, vec3(0.46, 0.49, 0.56), uThermal.z * rockLightMask * 0.28);
  baseColor = mix(baseColor, vec3(0.025, 0.18, 0.14), uThermal.w * tundraDarkMask * 0.58);
  baseColor = mix(baseColor, vec3(0.34, 0.60, 0.47), uThermal.w * tundraRidgeMask * 0.30);
  baseColor = mix(baseColor, vec3(0.10, 0.26, 0.42),
    clamp(uIceFracture, 0.0, 1.0) * iceFractures * 0.62);
  baseColor = mix(baseColor, vec3(0.66, 0.84, 1.0), uThermalIce * (1.0 - iceFractures) * fineMaterial * 0.14);
  float roughness = clamp(uThermal.x * 0.58 + uThermal.y * 0.88 + uThermal.z * 0.82
    + uThermal.w * 0.74 + uThermalIce * 0.32 - vRidgeMask * 0.07, 0.24, 0.94);

  // Keep the day/night boundary spherical and continuous. The displaced
  // normal contributes restrained local relief instead of faceting the light.
  vec3 normalDirection = normalize(mix(vWorldRadial, vNormal, 0.18));
  vec3 lightDirection = normalize(uLightDirection);
  vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
  vec3 halfwayDirection = normalize(lightDirection + viewDirection);
  float NoL = max(dot(normalDirection, lightDirection), 0.0);
  float NoV = max(dot(normalDirection, viewDirection), 0.0);
  float VoH = max(dot(viewDirection, halfwayDirection), 0.0);
  float ndf = distributionGGX(normalDirection, halfwayDirection, roughness);
  float visibility = geometrySmith(normalDirection, viewDirection, lightDirection, roughness);
  vec3 fresnel = fresnelSchlick(VoH, DIELECTRIC_F0);
  vec3 specular = ndf * visibility * fresnel / max(4.0 * NoV * NoL, 0.0001);
  vec3 diffuse = (vec3(1.0) - fresnel) * baseColor / PI;
  float irradiance = min(1.70, 1.12 + sqrt(max(uIncident, 0.0)) * 0.32);
  vec3 directLight = (diffuse + specular) * NoL * irradiance * PI;
  vec3 nightAmbient = baseColor * (0.014 + uFreshness * 0.008) * (1.0 - NoL);
  vec3 surfaceColor = min(directLight + nightAmbient, vec3(0.98));

  float fissure = vRidgeMask * (1.0 - smoothstep(0.08, 0.34, abs(vHeight)))
    + vCraterMask * 0.32;
  vec3 emissive = vec3(1.35, 0.16, 0.018) * hotZone * fissure * 1.45;
  // 熔岩裂谷：热 × 年代跨度。裂缝网络用脊线噪声的**倒数**取，
  // 于是熔岩只出现在裂开的那几条线上，不是糊满整个热半球。
  float riftNetwork = pow(1.0 - abs(materialNoise(materialDirection * 8.5
    + vec3(21.0, 4.0, 13.0)) * 2.0 - 1.0), 6.0);
  float rift = riftNetwork * (0.35 + fissure * 0.65);
  emissive += vec3(1.55, 0.38, 0.06) * clamp(uLavaGlow, 0.0, 1.0) * rift * 1.25;
  float createdInnerLight = uCreated * pow(max(0.0, vHeight + 0.28), 3.0) * 0.34;
  emissive += vec3(1.10, 0.38, 0.07) * createdInnerLight;

  // 夜侧灯火：一条回答就是一盏灯。它们聚在低海拔的平原上（人住在平原），
  // 避开冰盖，并且只在背光面出现 —— 白天看不见灯，这是夜侧存在的全部理由。
  float nightMask = 1.0 - smoothstep(-0.06, 0.22, NoL);
  float settlement = smoothstep(0.62, 0.88,
    materialNoise(materialDirection * 26.0 + vec3(31.0, 7.0, 19.0)));
  float habitable = (1.0 - iceCoverage) * (1.0 - clamp(uThermal.x, 0.0, 1.0) * 0.7)
    * (1.0 - smoothstep(0.05, 0.40, abs(vHeight)));
  emissive += vec3(1.0, 0.78, 0.42) * settlement * habitable * nightMask
    * clamp(uNightLights, 0.0, 1.0) * 0.30;

  float markerBand = 1.0 - smoothstep(0.018, 0.04, abs(vRadial.y));
  float markerDash = step(0.54, fract(atan(vRadial.z, vRadial.x) * 3.82 + uSeed * 0.00017));
  vec3 marker = vec3(0.20, 0.46, 0.62) * markerBand * markerDash * uCollected * 0.24;
  // 悬停/选中轮廓。旧值是 0.02 —— 写了，但在 bloom 与色调映射之后等于没写，
  // 用户点下去看不到「我点中了」。强度与颜色都由 interactionFeedback 给：
  // 悬停暖、选中冷，两个状态在画面上分得开。
  float selectionRim = pow(1.0 - NoV, 4.0);
  vec3 selectionFeedback = uInteractionColor * selectionRim * uInteractionRim;

  // 云：叠在地表之上，跟着自己的相位漂移。它有自己的散射与投影 ——
  // 没有投影的云是一张贴纸，有投影才是「云在地上面」。
  float cloudPhase = uTime * 0.00004 * uCloudSpeed;
  float cloud = cloudField(materialDirection, cloudPhase);
  float cloudShadow = cloudField(materialDirection + lightDirection * 0.045, cloudPhase);
  vec3 litSurface = surfaceColor * (1.0 - cloudShadow * 0.34 * NoL);
  // 云顶更亮、更白，并且在晨昏线上带一层暖边（前向散射）。
  float forward = pow(max(dot(viewDirection, -lightDirection), 0.0), 3.0);
  vec3 cloudColor = mix(vec3(0.88, 0.90, 0.94), vec3(1.0, 0.84, 0.66), forward * 0.55);
  vec3 cloudLit = cloudColor * (NoL * 0.92 + 0.05) * irradiance;
  vec3 composed = mix(litSurface, cloudLit, clamp(cloud * 0.86, 0.0, 0.9));
  gl_FragColor = vec4(composed + emissive + marker + selectionFeedback, uReveal);
}
`
