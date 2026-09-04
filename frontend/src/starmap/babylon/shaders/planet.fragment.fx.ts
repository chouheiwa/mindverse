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
uniform vec3 uLightDirection;
uniform vec3 uCameraPosition;

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
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

void main(void) {
  vec3 magma = vec3(0.48, 0.045, 0.008);
  vec3 desert = vec3(0.62, 0.29, 0.075);
  vec3 rock = vec3(0.22, 0.25, 0.28);
  vec3 tundra = vec3(0.24, 0.34, 0.37);
  vec3 ice = vec3(0.52, 0.72, 0.86);

  float latitude = abs(normalize(vRadial).y);
  float polarMask = smoothstep(mix(0.82, 0.48, uThermalIce), 0.98, latitude);
  float highlandMask = smoothstep(0.10, 0.42, vHeight);
  float basinMask = 1.0 - smoothstep(-0.30, 0.08, vHeight);
  float hotZone = uThermal.x * (1.0 - polarMask) * smoothstep(-0.08, 0.24, vHeight);
  float iceZone = max(uThermalIce * polarMask, uThermal.w * polarMask * 0.55);
  float desertZone = uThermal.y * (1.0 - polarMask)
    * (1.0 - highlandMask * 0.45) * (0.65 + basinMask * 0.35);
  float exposedRock = clamp(uThermal.z + highlandMask * 0.55
    + basinMask * 0.25 + vCraterMask * 0.35, 0.0, 1.0);
  float tundraZone = uThermal.w * (1.0 - polarMask * 0.55) * (1.0 - hotZone);
  vec4 zoneWeights = vec4(hotZone, desertZone, exposedRock, tundraZone);
  float weightTotal = dot(zoneWeights, vec4(1.0)) + iceZone;
  zoneWeights /= max(weightTotal, 0.0001);
  iceZone /= max(weightTotal, 0.0001);

  vec3 baseColor = magma * zoneWeights.x + desert * zoneWeights.y
    + rock * zoneWeights.z + tundra * zoneWeights.w + ice * iceZone;
  float roughness = clamp(dot(zoneWeights, vec4(0.62, 0.91, 0.84, 0.78))
    + iceZone * 0.31 - vRidgeMask * 0.07, 0.24, 0.94);

  vec3 normalDirection = normalize(vNormal);
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
  float irradiance = min(0.95, 0.42 + sqrt(max(uIncident, 0.0)) * 0.22);
  vec3 directLight = (diffuse + specular) * NoL * irradiance * PI;
  vec3 nightAmbient = baseColor * (0.018 + uFreshness * 0.012) * (1.0 - NoL);
  vec3 surfaceColor = min(directLight + nightAmbient, vec3(0.98));

  float fissure = vRidgeMask * (1.0 - smoothstep(0.08, 0.34, abs(vHeight)))
    + vCraterMask * 0.32;
  vec3 emissive = vec3(1.35, 0.16, 0.018) * hotZone * fissure * 1.45;
  float createdInnerLight = uCreated * pow(max(0.0, vRelief + 0.28), 3.0) * 0.34;
  emissive += vec3(1.10, 0.38, 0.07) * createdInnerLight;

  float markerBand = 1.0 - smoothstep(0.018, 0.04, abs(vRadial.y));
  float markerDash = step(0.54, fract(atan(vRadial.z, vRadial.x) * 3.82 + uSeed * 0.00017));
  vec3 marker = vec3(0.20, 0.46, 0.62) * markerBand * markerDash * uCollected * 0.24;
  float scanPosition = sin(uTime * 0.0012) * 0.78;
  float scan = 1.0 - smoothstep(0.018, 0.075, abs(vRadial.y - scanPosition));
  vec3 scanFeedback = vec3(0.24, 0.78, 1.15) * scan * uSelected * 0.52;

  gl_FragColor = vec4(surfaceColor + emissive + marker + scanFeedback, uReveal);
}
`
