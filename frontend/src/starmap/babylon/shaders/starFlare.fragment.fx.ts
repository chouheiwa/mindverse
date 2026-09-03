export const starFlareFragmentShader = /* glsl */ `
precision highp float;
uniform float uFlareThreshold;
uniform float uFlareAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vRot;
void main(void) {
  float gate = smoothstep(uFlareThreshold, uFlareThreshold + 0.14, vBright);
  if (gate <= 0.001) discard;
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float radius = length(uv);
  if (radius > 1.0) discard;
  float cosine = cos(vRot);
  float sine = sin(vRot);
  vec2 rotated = mat2(cosine, -sine, sine, cosine) * uv;
  float primary = exp(-abs(rotated.x) * 2.4) * exp(-abs(rotated.y) * 150.0)
    + exp(-abs(rotated.y) * 2.4) * exp(-abs(rotated.x) * 150.0);
  vec2 secondaryAxis = vec2(rotated.x + rotated.y, rotated.x - rotated.y) * 0.70710678;
  float secondary = exp(-abs(secondaryAxis.x) * 3.6) * exp(-abs(secondaryAxis.y) * 230.0)
    + exp(-abs(secondaryAxis.y) * 3.6) * exp(-abs(secondaryAxis.x) * 230.0);
  float spikes = (primary + secondary * 0.42) * smoothstep(1.0, 0.12, radius);
  vec3 color = mix(vColor, vec3(1.0), 0.62);
  gl_FragColor = vec4(color * min(2.2, 0.8 + vBright), clamp(spikes * gate * vAlpha * uFlareAlpha, 0.0, 0.9));
}
`
