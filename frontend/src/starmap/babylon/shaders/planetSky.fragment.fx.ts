export const planetSkyFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uUp;
uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uDim;
varying vec3 vDirection;

vec3 safeDirection(vec3 value) {
  // 零向量也必须保持有限，不能依赖驱动对 normalize(0) 的处理。
  return value / max(length(value), 0.0001);
}
void main(void) {
  vec3 ray = safeDirection(vDirection);
  vec3 up = safeDirection(uUp);
  vec3 sun = safeDirection(uSunDirection);
  float elevation = clamp(dot(ray, up), -1.0, 1.0);
  float zenith = smoothstep(0.0, 1.0, max(elevation, 0.0));
  vec3 color = mix(uHorizonColor, uZenithColor, zenith);
  float mu = clamp(dot(ray, sun), -1.0, 1.0);
  // 固定各向异性系数并限制分母，避免正对太阳时 Mie 项发散。
  float mieBase = max(1.64 - 1.6 * mu, 0.04);
  float mie = 0.36 / max(pow(mieBase, 1.5), 0.008);
  float daylight = smoothstep(-0.15, 0.1, dot(sun, up));
  color += uSunColor * clamp(mie * 0.06, 0.0, 1.0) * daylight;
  // 白天整体亮起来，夜面回落到深色 —— 天的亮度跟着太阳高度走。
  color *= 0.35 + 0.65 * daylight;
  float alpha = clamp(uDim, 0.0, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
`
