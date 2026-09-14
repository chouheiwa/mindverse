/** Shared by orbital and walking materials: the same latitude and elevation keep their snow. */
export const planetSnowShader = /* glsl */ `
float planetSnowCoverage(float latitude, float height, float snowLine, float iceWeight, float magmaWeight) {
  float snowEdge = clamp(snowLine - max(height, 0.0) * 0.55, 0.05, 0.99);
  float snowWidth = max(0.001, min(0.995, snowEdge + 0.22) - snowEdge);
  float polarSnow = smoothstep(0.0, 1.0, (latitude - snowEdge) / snowWidth);
  return clamp(max(iceWeight * 0.88, polarSnow) * (1.0 - magmaWeight), 0.0, 1.0);
}
vec3 planetSnowAlbedo(float coverage) {
  return mix(vec3(0.42, 0.70, 0.96), vec3(0.86, 0.92, 0.98), coverage);
}
`
