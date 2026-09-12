import { afterEach, describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PlanetSurfaceBeacons } from './planetSurfaceBeacons'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()) })

describe('PlanetSurfaceBeacons', () => {
  it('hangs one pickable body per beacon well above the surface, and cleans up', () => {
    const engine = new NullEngine()
    const scene = new Scene(engine)
    const root = new TransformNode('planet-surface-root', scene)
    const beacons = new PlanetSurfaceBeacons(scene, root, {
      radius: 0.3,
      origin: [0, 0.3, 0],
      beacons: [
        { kind: 'planet', key: 'question:8', label: 'Eight', direction: [0, 1, 0], questionId: 'question:8', starId: 'star:a' },
        { kind: 'wormhole', key: 'wormhole:0', label: '→ 正则', direction: [1, 0, 0], wormholeIndex: 0 },
      ],
    })
    cleanup.push(() => { beacons.dispose(); scene.dispose(); engine.dispose() })
    expect(beacons.diagnostics().beaconCount).toBe(2)
    const anchors = beacons.anchors()
    expect(anchors.map(({ beacon }) => beacon.key)).toEqual(['question:8', 'wormhole:0'])
    for (const { local } of anchors) expect(local.length()).toBeGreaterThan(0.3 * 2)
    // 从落点挂出去：第一个信标沿 +Y，在落点 [0,0.3,0] 之上 2.6R。
    expect(anchors[0]!.local.y).toBeCloseTo(0.3 + 0.3 * 2.6, 9)
    for (const mesh of scene.meshes) {
      expect(mesh.isPickable).toBe(true)
      expect(mesh.parent).toBe(root)
      expect(beacons.beaconOf(mesh.uniqueId)?.kind).toMatch(/planet|wormhole/)
    }
    expect(beacons.beaconOf(-1)).toBeNull()
    beacons.dispose()
    expect(scene.meshes).toHaveLength(0)
    expect(beacons.diagnostics().beaconCount).toBe(0)
  })
})
