export const planetVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;
uniform float uTime;
uniform float uDisplacement;
uniform float uDetailDensity;
uniform float uFaultStrength;
uniform float uSeed;

varying vec3 vLocal;
varying vec3 vNormal;
varying float vRelief;

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + uSeed * 29.17) * 43758.5453123);
}

float terrainNoise(vec3 point) {
  float broad = hash31(floor(point * (5.0 + uDetailDensity * 8.0)));
  float fine = hash31(floor(point * (17.0 + uDetailDensity * 19.0)));
  float ridge = 1.0 - abs(2.0 * hash31(floor(point * 9.0 + uFaultStrength * 4.0)) - 1.0);
  return (broad * 0.46 + fine * 0.22 + ridge * uFaultStrength * 0.32) - 0.42;
}

void main(void) {
  float relief = terrainNoise(normal);
  vec3 displaced = position + normal * relief * uDisplacement;
  vLocal = displaced;
  vNormal = normalize(normal);
  vRelief = relief;
  gl_Position = worldViewProjection * vec4(displaced, 1.0);
}
`
