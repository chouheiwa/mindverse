export const planetVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
// CPU height, material grain, ridge mask and crater mask.
attribute vec4 terrainData;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vLocal;
varying vec3 vWorldPosition;
varying vec3 vRadial;
varying vec3 vWorldRadial;
varying vec3 vNormal;
varying float vHeight;
varying float vRelief;
varying float vRidgeMask;
varying float vCraterMask;

void main(void) {
  vec3 radial = normalize(position);
  vec4 worldPosition = world * vec4(position, 1.0);
  vLocal = position;
  vWorldPosition = worldPosition.xyz;
  vRadial = radial;
  vWorldRadial = normalize(mat3(world) * radial);
  vNormal = normalize(mat3(world) * normal);
  vHeight = terrainData.x;
  vRelief = terrainData.y;
  vRidgeMask = terrainData.z;
  vCraterMask = terrainData.w;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`
