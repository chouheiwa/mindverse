export const starSurfaceVertexShader = /* glsl */ `
precision highp float;
#ifndef STAR_NOISE_OCTAVES
#define STAR_NOISE_OCTAVES 4
#endif
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;
uniform float uSeed;
uniform float uActivity;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

float surfaceHash(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + uSeed * 13.31) * 43758.5453123);
}

float surfaceNoise(vec3 point) {
  float signal = 0.0;
  float amplitude = 0.54;
  for (int i = 0; i < 4; ++i) {
    #if STAR_NOISE_OCTAVES == 2
      if (i >= 2) break;
    #elif STAR_NOISE_OCTAVES == 3
      if (i >= 3) break;
    #endif
    signal += surfaceHash(floor(point)) * amplitude;
    point = point * 2.07 + vec3(1.7, -2.3, 0.9);
    amplitude *= 0.5;
  }
  return signal;
}

float surfaceHeight(vec3 direction) {
  float frozenDetail = surfaceNoise(direction * 5.2 + vec3(uSeed * 0.07));
  float rollingDetail = surfaceNoise(direction * 9.1 + vec3(uTime * 0.00007, 0.0, -uTime * 0.00005));
  return (mix(frozenDetail, rollingDetail, 0.35 + uActivity * 0.45) - 0.50)
    * (0.018 + uActivity * 0.042);
}

void main(void) {
  vec3 radial = normalize(position);
  float baseRadius = length(position);
  vec3 displacedPosition = radial * (baseRadius + surfaceHeight(radial));

  vec3 helper = abs(radial.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(helper, radial));
  vec3 bitangent = normalize(cross(radial, tangent));
  float epsilon = 0.012;
  vec3 tangentDirection = normalize(radial + tangent * epsilon);
  vec3 bitangentDirection = normalize(radial + bitangent * epsilon);
  vec3 tangentPoint = tangentDirection * (baseRadius + surfaceHeight(tangentDirection));
  vec3 bitangentPoint = bitangentDirection * (baseRadius + surfaceHeight(bitangentDirection));
  vec3 displacedNormal = normalize(cross(
    tangentPoint - displacedPosition,
    bitangentPoint - displacedPosition
  ));

  vLocal = normalize(displacedPosition);
  vWorldNormal = normalize(mat3(world) * displacedNormal);
  vec3 worldPosition = (world * vec4(displacedPosition, 1.0)).xyz;
  vViewDirection = cameraPosition - worldPosition;
  gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
}
`
