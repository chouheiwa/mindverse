import { describe, expect, test } from 'vitest'
import { planetInteractionRim } from '../interactionFeedback'
import { planetFragmentShader } from './planet.fragment.fx'
import { planetVertexShader } from './planet.vertex.fx'

function expectNoReversedNumericSmoothstep(source: string): void {
  const calls = [...source.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
  expect(calls.filter(([, low, high]) => Number(low) > Number(high))).toEqual([])
}

describe('Babylon procedural planet shader contract', () => {
  test('supports continuous reveal without making geometry pop', () => {
    expect(planetFragmentShader).toContain('uniform float uReveal')
    expect(planetFragmentShader).toMatch(/gl_FragColor\s*=\s*vec4\([^;]+uReveal/)
  })

  test('passes CPU geometry and material signals through without GPU terrain evaluation', () => {
    expect(planetVertexShader).toContain('attribute vec3 position;')
    expect(planetVertexShader).toContain('attribute vec3 normal;')
    expect(planetVertexShader).toContain('attribute vec4 terrainData;')
    expect(planetVertexShader).toContain('worldViewProjection * vec4(position, 1.0)')
    expect(planetVertexShader).toContain('mat3(world) * normal')
    for (const [varying, component] of [['vHeight', 'x'], ['vRelief', 'y'], ['vRidgeMask', 'z'], ['vCraterMask', 'w']]) {
      expect(planetVertexShader).toContain(`${varying} = terrainData.${component};`)
    }
    expect(planetVertexShader).not.toMatch(/uDisplacement|terrainSample|gradientNoise|displacedNormal/)
  })

  test('contains thermal blending, terrain relief and evidence-safe overlays', () => {
    expect(planetFragmentShader).toMatch(/uniform\s+vec4\s+uThermal\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uThermalIce\s*;/)
    expect(planetFragmentShader).toMatch(/magma.*desert.*rock.*tundra.*ice/s)
    expect(planetFragmentShader).toMatch(/crater/i)
    expect(planetFragmentShader).toMatch(/microTone\s*=\s*clamp\(1\.0\s*\+\s*vRelief\s*\*\s*0\.16/)
    expect(planetFragmentShader).toContain('materialNoise')
    expect(planetFragmentShader).toContain('duneStrata')
    expect(planetFragmentShader).toContain('rockMottle')
    expect(planetFragmentShader).toMatch(/uThermal\.z\s*\*\s*rockDarkMask\s*\*\s*0\.62/)
    expect(planetFragmentShader).toContain('tundraPatches')
    expect(planetFragmentShader).toMatch(/uThermal\.w\s*\*\s*tundraDarkMask\s*\*\s*0\.58/)
    expect(planetFragmentShader).toContain('iceFractures')
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCraterDensity\s*;/)
    expect(planetFragmentShader).toMatch(/ridge/i)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCreated\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCollected\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uSelected\s*;/)
    expect(planetFragmentShader).not.toMatch(/scanPosition|scanFeedback/)
    // 选中/悬停反馈仍然是一圈**轮廓**，不是一层扫描罩：强度由
    // interactionFeedback.planetInteractionRim 给（自带 ≤ 0.42 的上限与单测），
    // 着色器这边只保证它乘在边缘项上。旧写法把 0.02 写死在着色器里 ——
    // 那个数在 bloom 与色调映射之后等于没写，用户点下去看不到「我点中了」。
    expect(planetFragmentShader).toMatch(/selectionRim[\s\S]*uInteractionRim/)
    expect(planetFragmentShader).toMatch(/selectionRim\s*=\s*pow\(1\.0 - NoV/)
    expect(planetInteractionRim(1, 1).intensity).toBeLessThanOrEqual(0.42)
  })

  test('lights spatial material zones with view-dependent dielectric GGX and bounded emissive', () => {
    expect(planetFragmentShader).toContain('uLightDirection')
    expect(planetFragmentShader).toContain('uCameraPosition')
    expect(planetFragmentShader).toContain('distributionGGX')
    expect(planetFragmentShader).toContain('geometrySmith')
    expect(planetFragmentShader).toContain('fresnelSchlick')
    expect(planetFragmentShader).toContain('emissive')
    expect(planetFragmentShader).toContain('latitude')
    expect(planetFragmentShader).toContain('polarMask')
    expect(planetFragmentShader).toContain('highlandMask')
    expect(planetFragmentShader).toContain('basinMask')
    expect(planetFragmentShader).toContain('uIncident')
    expect(planetVertexShader).toMatch(/varying\s+vec3\s+vWorldRadial\s*;/)
    expect(planetFragmentShader).toMatch(/mix\(vWorldRadial,\s*vNormal,\s*0\.18\)/)
    expect(planetFragmentShader).toMatch(/const\s+vec3\s+DIELECTRIC_F0\s*=\s*vec3\(0\.04\)/)
    expect(planetFragmentShader).not.toContain('vec3(-0.6, 0.45, -0.72)')
    expectNoReversedNumericSmoothstep(planetFragmentShader)
  })

  test('derives the snow band upper edge from its lower edge so the cap can never invert', () => {
    // GLSL 规定 smoothstep 在 `edge0 >= edge1` 时未定义；主流驱动实现成
    // clamp((x - e0) / (e1 - e0), 0, 1)，分母变号之后极冠整个**翻转** ——
    // 冰盖长在赤道、两极反而裸露。
    //
    // 提升批次一度把两个边**各自独立**算出来：
    //   smoothstep(mix(snowBand, 0.42, uThermalIce), min(0.995, snowBand + 0.22), latitude)
    // 冰行星（thermal.ice = 1、snowLine ≈ 0.067）于是得到 edge0 = 0.42 >
    // edge1 ≈ 0.287 —— 每一颗冰行星都落在未定义分支里。
    //
    // 唯一结构性的护栏是让上缘由下缘推出来，而不是另算一遍。冰权重改为在
    // CPU 侧（planetAppearance.snowLine）折进雪线，那里只能把它往赤道压。
    expect(planetFragmentShader).toMatch(
      /float\s+snowStart\s*=\s*clamp\([^;]*uSnowLine[^;]*\)\s*;/,
    )
    expect(planetFragmentShader).toMatch(
      /polarMask\s*=\s*smoothstep\(\s*snowStart\s*,\s*min\(\s*0\.995\s*,\s*snowStart\s*\+\s*0\.22\s*\)\s*,\s*latitude\s*\)/,
    )
    // 雪线一旦回到「两个边各自独立算」的写法，这条就会红。
    expect(planetFragmentShader).not.toMatch(/mix\(\s*snowBand\s*,\s*0\.42\s*,\s*uThermalIce\s*\)/)
  })

  test('uses portable varyings and no Three-specific shader built-ins', () => {
    for (const source of [planetVertexShader, planetFragmentShader]) {
      expect(source).not.toMatch(/modelMatrix|projectionMatrix|cameraPosition|uvTransform/)
      expect(source).not.toMatch(/#include\s+<three/)
    }
    expect(planetFragmentShader).toMatch(/precision\s+highp\s+float/)
    expect(planetFragmentShader).toMatch(/gl_FragColor/)
  })
})
