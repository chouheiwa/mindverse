export const starPanoramaVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aCoreSize;
attribute float aHaloSize;
attribute float aBright;
attribute float aBurst;
attribute float aSeed;
attribute float aRot;
attribute float aBodyR;
attribute float aDim;
attribute float aCoreDim;
attribute float aHaloDim;
attribute vec3 aInteraction;

uniform mat4 worldView;
uniform mat4 projection;
uniform float uTime;
uniform float uBobAmplitude;
uniform float uRenderHeight;
uniform float uDevicePixelRatio;
uniform float uProjectionScale;
uniform float uLayer;
uniform float uCoreScale;
uniform float uCoreBrightness;
uniform float uHaloIntensity;
uniform float uPanoramaAlpha;

varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vRot;

vec3 starWorldPosition(vec3 source) {
  vec3 offset = source - aCenter;
  float theta = aPeriod == 0.0 ? 0.0 : 6.28318530718 / aPeriod * (uTime * 0.001);
  float cosine = cos(theta);
  float sine = sin(theta);
  float along = dot(aAxis, offset);
  vec3 orbit = offset * cosine + cross(aAxis, offset) * sine
    + aAxis * along * (1.0 - cosine);
  float bob = sin(uTime / (6400.0 + mod(aSeed * 311.0, 5200.0)) + aSeed) * uBobAmplitude;
  return aCenter + orbit + aAxis * bob;
}

void main(void) {
  vec3 worldPosition = starWorldPosition(position);
  vec4 view = worldView * vec4(worldPosition, 1.0);
  float viewZ = max(0.01, -view.z);
  gl_Position = projection * view;

  float twinkle = 1.0 - (0.09 + 0.26 * aBurst)
    * (0.5 + 0.5 * sin(uTime / (760.0 + mod(aSeed * 53.0, 900.0)) + aSeed * 1.7));
  float coreCss = aCoreSize * uCoreScale * aInteraction.x;
  float haloCss = aHaloSize * mix(uHaloIntensity * aInteraction.z, 1.7, step(1.5, uLayer));
  float requestedCss = mix(coreCss, haloCss, step(0.5, uLayer));
  float projectedBodyCss = aBodyR * uProjectionScale / viewZ / max(1.0, uDevicePixelRatio);
  float nearScale = smoothstep(6.0, 18.0, projectedBodyCss);
  float nearCss = aBodyR * mix(7.0, 10.5, step(1.5, uLayer)) * uProjectionScale / viewZ
    / max(1.0, uDevicePixelRatio);
  float cssSize = mix(requestedCss, nearCss, nearScale);
  float physicalSize = cssSize * max(1.0, uDevicePixelRatio);
  gl_PointSize = clamp(physicalSize, 1.0, min(520.0 * uDevicePixelRatio, uRenderHeight * 0.45));

  vColor = aColor;
  vBright = aBright;
  vRot = aRot;
  float effectiveDim = mix(aCoreDim, aHaloDim, step(0.5, uLayer));
  vAlpha = min(aDim, effectiveDim) * uPanoramaAlpha * twinkle
    * mix(uCoreBrightness * aInteraction.y, 1.0, step(0.5, uLayer));
}
`
