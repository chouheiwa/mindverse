export const planetSkyFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uUp;
uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uDim;
uniform float uDaylight;
uniform float uSunDiscCos;
uniform float uSunHaloCos;
uniform float uSunDiscGain;
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

  // 空气厚度：贴着地平线看穿过的大气最厚，所以最亮最暖；往天顶迅速变薄。
  // 之前这里是一条 smoothstep 的线性 mix，读起来就是一张平涂的纸。
  // 1/(h+k) 是气团的标准廉价近似，k 同时决定地平线亮带的厚度。
  float airMass = 1.0 / max(max(elevation, 0.0) + 0.12, 0.0001);
  float band = clamp((airMass - 1.0) * 0.14, 0.0, 1.0);
  vec3 color = mix(uZenithColor, uHorizonColor, band);

  float mu = clamp(dot(ray, sun), -1.0, 1.0);
  // Mie 光晕：围着太阳的一圈。固定各向异性并限制分母，正对太阳时不发散。
  float mieBase = max(1.64 - 1.6 * mu, 0.04);
  float mie = 0.36 / max(pow(mieBase, 1.5), 0.008);
  color += uSunColor * clamp(mie * 0.045, 0.0, 1.0) * uDaylight;

  // 太阳本体：柔边圆盘。边界用余弦比较，角半径的余弦由 TS 侧算好传进来，
  // 着色器里不出现任何反三角函数。uSunDiscGain 在太阳落到地平线以下时为 0。
  float discT = clamp((mu - uSunHaloCos) / max(uSunDiscCos - uSunHaloCos, 0.0001), 0.0, 1.0);
  color += uSunColor * (discT * discT * (3.0 - 2.0 * discT)) * 2.4 * uSunDiscGain;

  // 夜空不是纯黑：留一点余晖，否则抬头像掉回宇宙。
  color *= 0.12 + 0.88 * uDaylight;
  float alpha = clamp(uDim, 0.0, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
`
