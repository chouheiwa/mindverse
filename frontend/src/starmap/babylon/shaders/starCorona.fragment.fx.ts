export const starCoronaFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uActivity;
uniform float uSeed;
uniform float uRot;
uniform float uTime;
uniform float uCoronaAlpha;
uniform float uCoronaIntensity;
uniform float uCoronaLayers;
varying vec2 vUV;
void main(void) {
  vec2 centered = vUV * 2.0 - 1.0;
  float radius = length(centered);
  if (radius > 1.0) discard;
  float cutout = smoothstep(0.27, 0.37, radius);
  float ring = exp(-abs(radius - 0.40) * 12.0);
  float outer = pow(max(0.0, 1.0 - radius), 2.2);
  float ray = 0.72 + 0.28 * sin(atan(centered.y, centered.x) * (7.0 + uCoronaLayers * 2.0) + uRot + uSeed + uTime * 0.0001);
  float corona = cutout * (ring * 0.50 + outer * ray * (0.34 + uActivity * 0.22));
  float alpha = clamp(corona * uCoronaAlpha, 0.0, 0.82);
  gl_FragColor = vec4(uColor * (0.72 + uCoronaIntensity * 0.38), alpha);
}
`
