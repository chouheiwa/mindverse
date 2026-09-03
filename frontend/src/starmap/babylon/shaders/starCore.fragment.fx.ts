export const starCoreFragmentShader = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
void main(void) {
  if (vAlpha <= 0.001) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(uv, uv);
  if (d2 > 1.0) discard;
  vec3 hot = mix(vColor, vec3(1.0), 0.74);
  float energy = min(4.8, (1.4 + vBright * 2.1) * exp(-d2 * 7.5));
  float alpha = clamp(vAlpha * (1.0 - smoothstep(0.42, 1.0, d2)), 0.0, 1.0);
  gl_FragColor = vec4(hot * energy, alpha);
}
`
