export const starHaloFragmentShader = /* glsl */ `
precision highp float;
uniform float uHaloAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
void main(void) {
  float radius = length(gl_PointCoord * 2.0 - 1.0);
  if (radius > 1.0) discard;
  float innerSlope = exp(-radius * 4.6) * 0.62;
  float outerSlope = pow(1.0 - radius, 3.0) * 0.42;
  float alpha = clamp((innerSlope + outerSlope) * vAlpha * uHaloAlpha * (0.5 + vBright * 0.5), 0.0, 0.86);
  gl_FragColor = vec4(vColor * (0.72 + vBright * 0.28), alpha);
}
`
