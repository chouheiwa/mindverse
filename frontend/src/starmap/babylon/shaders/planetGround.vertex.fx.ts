export const planetGroundVertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  // 地表根节点只平移不缩放不旋转，法线可以直接用 3x3 部分变换。
  vWorldNormal = mat3(world) * normal;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`
