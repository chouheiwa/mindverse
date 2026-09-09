export const planetSkyVertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;
void main(void) {
  // 球体只平移，因此局部方向就是世界方向，避免远离原点时的位置相减误差。
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`
