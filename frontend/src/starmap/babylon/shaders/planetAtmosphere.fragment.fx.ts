export const planetAtmosphereFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform vec3 uRayleighColor;
uniform float uShellRadius;
uniform float uDensity;
uniform float uReveal;
uniform int uQualityLevel;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

const float PI = 3.14159265359;

float raySpherePath(vec3 rayOrigin, vec3 rayDirection, vec3 sphereCenter, float sphereRadius) {
  vec3 relativeOrigin = rayOrigin - sphereCenter;
  float projected = dot(relativeOrigin, rayDirection);
  float discriminant = projected * projected - dot(relativeOrigin, relativeOrigin)
    + sphereRadius * sphereRadius;
  return 2.0 * sqrt(max(discriminant, 0.0));
}

float rayleighPhase(float cosine) {
  return 3.0 * (1.0 + cosine * cosine) / (16.0 * PI);
}

float miePhase(float cosine, float anisotropy) {
  float anisotropySquared = anisotropy * anisotropy;
  float denominator = pow(max(1.0 + anisotropySquared - 2.0 * anisotropy * cosine, 0.001), 1.5);
  return (1.0 - anisotropySquared) / (4.0 * PI * denominator);
}

void main(void) {
  vec3 viewDirection = normalize(vWorldPosition - uCameraPosition);
  vec3 lightDirection = normalize(uLightDirection);
  vec3 shellNormal = normalize(vWorldNormal);
  float pathLength = raySpherePath(uCameraPosition, viewDirection, uPlanetCenter, uShellRadius);
  float normalizedPath = clamp(pathLength / max(uShellRadius * 2.0, 0.0001), 0.0, 1.0);
  float viewLightCosine = dot(-viewDirection, lightDirection);
  float nightShadow = smoothstep(-0.18, 0.12, dot(shellNormal, lightDirection));
  float limb = 1.0 - smoothstep(0.04, 0.72, abs(dot(shellNormal, -viewDirection)));
  float rayleigh = rayleighPhase(viewLightCosine);
  vec3 scattering = uRayleighColor * rayleigh * (0.32 + limb * 1.68);
  if (uQualityLevel == 0) {
    scattering = uRayleighColor * (0.18 + limb * 0.82);
  } else {
    float mie = miePhase(viewLightCosine, 0.72);
    scattering += vec3(1.0, 0.72, 0.48) * mie * 0.34;
  }
  float alpha = uDensity * pathLength * normalizedPath * nightShadow * uReveal
    / max(uShellRadius, 0.0001);
  alpha = clamp(alpha * (0.18 + limb * 0.82), 0.0, 0.72);
  gl_FragColor = vec4(min(scattering * nightShadow * 1.35, vec3(1.15)), alpha);
}
`
