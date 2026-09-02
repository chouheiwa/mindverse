export const planetFragmentShader = /* glsl */ `
precision highp float;

uniform vec4 uThermal;
uniform float uThermalIce;
uniform float uFreshness;
uniform float uCreated;
uniform float uCollected;
uniform float uSelected;
uniform float uTime;
uniform float uSeed;

varying vec3 vLocal;
varying vec3 vNormal;
varying float vRelief;

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(157.1, 319.7, 83.3)) + uSeed * 19.7) * 43758.5453123);
}

void main(void) {
  vec3 magma = vec3(1.00, 0.14, 0.025);
  vec3 desert = vec3(0.78, 0.39, 0.11);
  vec3 rock = vec3(0.28, 0.31, 0.34);
  vec3 tundra = vec3(0.28, 0.39, 0.43);
  vec3 ice = vec3(0.56, 0.78, 0.91);
  vec3 thermal = magma * uThermal.x + desert * uThermal.y
    + rock * uThermal.z + tundra * uThermal.w + ice * uThermalIce;

  float cell = hash31(floor(vLocal * 18.0));
  float crater = smoothstep(0.82, 0.97, cell) * smoothstep(0.2, -0.22, vRelief);
  float ridge = smoothstep(0.12, 0.48, abs(vRelief));
  vec3 terrain = thermal * (0.72 + ridge * 0.28) * (1.0 - crater * 0.44);

  vec3 lightDirection = normalize(vec3(-0.6, 0.45, -0.72));
  float diffuse = max(0.08, dot(normalize(vNormal), lightDirection) * 0.5 + 0.5);
  vec3 color = terrain * diffuse;

  float createdInnerLight = uCreated * pow(max(0.0, vRelief + 0.34), 3.0) * 0.22;
  color += vec3(1.0, 0.48, 0.12) * createdInnerLight;

  float markerBand = 1.0 - smoothstep(0.018, 0.04, abs(vLocal.y));
  float markerDash = step(0.54, fract(atan(vLocal.z, vLocal.x) * 3.82 + uSeed * 7.0));
  color += vec3(0.42, 0.72, 0.92) * markerBand * markerDash * uCollected * 0.18;

  float scan = 1.0 - smoothstep(0.018, 0.075, abs(vLocal.y - sin(uTime * 0.0012) * 0.78));
  color += vec3(0.25, 0.74, 1.0) * scan * uSelected * 0.46;
  color += vec3(0.16, 0.31, 0.42) * uFreshness * pow(1.0 - abs(dot(vNormal, lightDirection)), 3.0) * 0.16;

  gl_FragColor = vec4(color, 1.0);
}
`
