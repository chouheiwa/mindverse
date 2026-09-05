export const starDiffractionFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uSpikeCount;
uniform float uDiffractionAlpha;
uniform float uRot;
uniform float uTime;
uniform float uActivity;
varying vec2 vUV;

const float TAU = 6.2831853;

// 聚焦恒星的衍射星芒。
//
// 全景里点精灵已有星芒（starFlare.fragment.fx），但一旦飞近、恒星改由球体渲染，
// 星芒就整个消失了 —— 于是「越靠近越不像恒星」。这一层把它补回来，并且用的是
// **光阑衍射**的形状（叶片数决定芒的条数），不是随手叠一个十字。
//
// 条数由画质分档给（high 6 条、medium/low 4 条），亮度由活动性调制，
// 长度按半径衰减。它是叠加混合的，所以永远不会把中心压暗。
void main(void) {
  vec2 centered = vUV * 2.0 - 1.0;
  float radius = length(centered);
  if (radius > 1.0) discard;
  // atan(0, 0) 在 GLSL 里是未定义的，而公告板正中心恰好可能落在某个像素中心上。
  // 那一个像素会把 NaN 一路带到 alpha，clamp(NaN) 同样未定义。给一个不改变
  // 任何其他像素取值的方向兜底。
  vec2 direction = radius < 1e-6 ? vec2(1.0, 0.0) : centered;
  float angle = atan(direction.y, direction.x) + uRot * 0.08;
  float blades = max(uSpikeCount, 2.0);
  // 叶片衍射：n 片光阑给出 n 条（n 为偶数）或 2n 条（n 为奇数）芒。
  // 这里直接用角向余弦的高次幂近似那组芒，代价是一次 cos。
  float lobe = pow(abs(cos(angle * blades * 0.5)), 220.0);
  // 芒身：中心密、外缘散，末端软收。指数取得陡，是因为它必须细 ——
  // 粗的星芒不是电影感，是廉价滤镜。
  float shaft = exp(-radius * 7.4) * (1.0 - smoothstep(0.40, 0.92, radius));
  float glint = exp(-radius * radius * 240.0);
  // 极缓慢的呼吸，避免星芒像贴纸一样钉死在画面上。Reduced Motion 时
  // uTime 不推进，这一项自然退化成常数。
  float breath = 0.86 + 0.14 * sin(uTime * 0.00031 + uRot);
  float energy = (lobe * shaft * 1.10 + glint * 0.30) * breath * (0.55 + uActivity * 0.45);
  float alpha = clamp(energy * uDiffractionAlpha, 0.0, 0.34);
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.58) * (0.9 + energy), alpha);
}
`
