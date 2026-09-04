export const planetVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float uTime;
uniform float uDisplacement;
uniform float uDetailDensity;
uniform float uFaultStrength;
uniform float uWarpStrength;
uniform float uNormalEpsilon;
uniform float uSmallCraterThreshold;
uniform float uSeed;
uniform int uOctaves;
uniform int uQualityLevel;
uniform int uLargeCraterCount;
uniform vec4 uLargeCraters[8];
uniform vec4 uLargeCraterShape[8];

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

vec3 hashGradient(vec3 cell) {
  vec3 dots = vec3(
    dot(cell, vec3(127.1, 311.7, 74.7)),
    dot(cell, vec3(269.5, 183.3, 246.1)),
    dot(cell, vec3(113.5, 271.9, 124.6))
  );
  return normalize(fract(sin(dots + uSeed * 0.000071) * 43758.5453123) * 2.0 - 1.0);
}

vec3 hashCellPoint(vec3 cell) {
  vec3 dots = vec3(
    dot(cell, vec3(157.1, 319.7, 83.3)),
    dot(cell, vec3(221.7, 137.9, 301.3)),
    dot(cell, vec3(97.7, 251.3, 199.1))
  );
  return fract(sin(dots + uSeed * 0.000113) * 43758.5453123);
}

float hashCellAcceptance(vec3 cell) {
  return fract(sin(dot(cell, vec3(41.7, 289.1, 173.3)) + uSeed * 0.000193) * 24634.6345);
}

float gradientNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 fade = local * local * (3.0 - 2.0 * local);
  float n000 = dot(hashGradient(cell + vec3(0.0, 0.0, 0.0)), local - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hashGradient(cell + vec3(1.0, 0.0, 0.0)), local - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hashGradient(cell + vec3(0.0, 1.0, 0.0)), local - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hashGradient(cell + vec3(1.0, 1.0, 0.0)), local - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hashGradient(cell + vec3(0.0, 0.0, 1.0)), local - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hashGradient(cell + vec3(1.0, 0.0, 1.0)), local - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hashGradient(cell + vec3(0.0, 1.0, 1.0)), local - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hashGradient(cell + vec3(1.0, 1.0, 1.0)), local - vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, fade.x);
  float nx10 = mix(n010, n110, fade.x);
  float nx01 = mix(n001, n101, fade.x);
  float nx11 = mix(n011, n111, fade.x);
  return mix(mix(nx00, nx10, fade.y), mix(nx01, nx11, fade.y), fade.z) * 0.9 + 0.5;
}

float fbm(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.53;
  float normalization = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaveCount) break;
    sum += gradientNoise(point) * amplitude;
    normalization += amplitude;
    point = point * 2.03 + vec3(17.13, 9.71, 13.57);
    amplitude *= 0.5;
  }
  return sum / max(normalization, 0.0001);
}

vec3 domainWarp(vec3 point) {
  return vec3(
    fbm(point + vec3(11.7, 3.1, 7.9), 3),
    fbm(point + vec3(5.3, 19.1, 2.7), 3),
    fbm(point + vec3(13.1, 8.3, 23.7), 3)
  ) * 2.0 - 1.0;
}

float ridgedNoise(vec3 point, int octaveCount) {
  float sum = 0.0;
  float amplitude = 0.56;
  float normalization = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaveCount) break;
    float ridge = 1.0 - abs(gradientNoise(point) * 2.0 - 1.0);
    sum += ridge * ridge * amplitude;
    normalization += amplitude;
    point = point * 2.11 + vec3(7.1, 13.7, 5.9);
    amplitude *= 0.48;
  }
  return sum / max(normalization, 0.0001);
}

float craterProfile(float distanceToCenter, float radius, float depth, float rimHeight) {
  float normalizedDistance = distanceToCenter / max(radius, 0.0001);
  float bowl = 1.0 - smoothstep(0.0, 0.72, normalizedDistance);
  float wall = smoothstep(0.42, 0.82, normalizedDistance)
    * (1.0 - smoothstep(0.82, 1.0, normalizedDistance));
  float rim = 1.0 - smoothstep(0.0, 0.18, abs(normalizedDistance - 1.0));
  return -depth * bowl * bowl + depth * 0.18 * wall + rimHeight * rim;
}

vec2 largeCraterField(vec3 direction) {
  float height = 0.0;
  float mask = 0.0;
  for (int craterIndex = 0; craterIndex < 8; craterIndex++) {
    if (craterIndex >= uLargeCraterCount) break;
    vec4 crater = uLargeCraters[craterIndex];
    vec4 shape = uLargeCraterShape[craterIndex];
    if (crater.w <= 0.0) continue;
    float distanceToCenter = length(direction - normalize(crater.xyz));
    float profile = craterProfile(distanceToCenter, crater.w, shape.x, shape.y);
    height += profile;
    mask = max(mask, 1.0 - smoothstep(crater.w * 0.35, crater.w * 1.18, distanceToCenter));
  }
  return vec2(height, mask);
}

vec2 smallCraterFieldScale(vec3 direction, float frequency) {
  vec3 samplePosition = direction * frequency;
  vec3 centerCell = floor(samplePosition);
  float height = 0.0;
  float mask = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 cell = centerCell + vec3(float(x), float(y), float(z));
        float accepted = step(uSmallCraterThreshold, hashCellAcceptance(cell));
        vec3 candidate = normalize(cell + hashCellPoint(cell));
        float radius = mix(0.34, 0.58, hashCellPoint(cell + 5.17).x) / frequency;
        float distanceToCenter = length(direction - candidate);
        float localMask = (1.0 - smoothstep(radius * 0.35, radius * 1.2, distanceToCenter)) * accepted;
        height += craterProfile(distanceToCenter, radius, radius * 0.12, radius * 0.045) * accepted;
        mask = max(mask, localMask);
      }
    }
  }
  return vec2(height, mask);
}

vec2 smallCraterField(vec3 direction) {
  if (uQualityLevel <= 0) return vec2(0.0);
  vec2 field = smallCraterFieldScale(direction, mix(18.0, 28.0, uDetailDensity));
  if (uQualityLevel >= 2) field += smallCraterFieldScale(direction, mix(37.0, 53.0, uDetailDensity));
  return field;
}

vec4 terrainSample(vec3 direction) {
  vec3 warped = direction + domainWarp(direction * 1.7) * uWarpStrength;
  float continents = fbm(warped * 2.1, uOctaves);
  float mountainMask = smoothstep(0.48, 0.72, continents);
  float ridges = ridgedNoise(warped * 5.4, uOctaves) * mountainMask * uFaultStrength;
  float fineDetail = (gradientNoise(warped * mix(11.0, 23.0, uDetailDensity)) - 0.5)
    * mix(0.0, 0.08, uDetailDensity);
  vec2 largeCraters = largeCraterField(direction);
  vec2 smallCraters = smallCraterField(direction);
  float height = (continents - 0.48) * 0.72 + ridges * 0.28 + fineDetail
    + largeCraters.x + smallCraters.x;
  return vec4(height, ridges * mountainMask, largeCraters.y, smallCraters.y);
}

float terrainHeight(vec3 direction) {
  return terrainSample(direction).x;
}

vec3 displacedNormal(vec3 radial) {
  vec3 tangent = normalize(abs(radial.y) < 0.95
    ? cross(radial, vec3(0.0, 1.0, 0.0))
    : cross(radial, vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = normalize(cross(radial, tangent));
  float epsilon = max(uNormalEpsilon, 0.0001);
  vec3 a = normalize(radial + tangent * epsilon);
  vec3 b = normalize(radial - tangent * epsilon);
  vec3 c = normalize(radial + bitangent * epsilon);
  vec3 d = normalize(radial - bitangent * epsilon);
  vec3 dpT = a * (1.0 + terrainHeight(a) * uDisplacement)
    - b * (1.0 + terrainHeight(b) * uDisplacement);
  vec3 dpB = c * (1.0 + terrainHeight(c) * uDisplacement)
    - d * (1.0 + terrainHeight(d) * uDisplacement);
  return normalize(cross(dpT, dpB));
}

void main(void) {
  vec3 radial = normalize(normal);
  vec4 terrain = terrainSample(radial);
  vec3 displaced = position + normal * terrain.x * uDisplacement;
  vec3 localNormal = displacedNormal(radial);
  vec4 worldPosition = world * vec4(displaced, 1.0);
  vLocal = displaced;
  vWorldPosition = worldPosition.xyz;
  vRadial = radial;
  vNormal = normalize(mat3(world) * localNormal);
  vHeight = terrain.x;
  vRelief = terrain.x;
  vRidgeMask = clamp(terrain.y, 0.0, 1.0);
  vCraterMask = clamp(max(terrain.z, terrain.w), 0.0, 1.0);
  gl_Position = worldViewProjection * vec4(displaced, 1.0);
}
`
