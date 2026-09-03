export const starSurfaceVertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;
varying vec3 vLocal;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;
void main(void) {
  vLocal = normalize(position);
  vWorldNormal = normalize(mat3(world) * normal);
  vec3 worldPosition = (world * vec4(position, 1.0)).xyz;
  vViewDirection = cameraPosition - worldPosition;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`
