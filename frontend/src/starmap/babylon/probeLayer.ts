import { Constants } from '@babylonjs/core/Engines/constants.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { UniverseIndex } from '../../domain/universe'
import type { StarDatum } from '../gl/starData'
import { clusterAxis } from '../projection'
import type { Quality } from '../quality'
import { babylonUpliftTier, type BabylonUpliftTier } from './visualUplift'
import { PROBE_SCAN_SWEEP_SPAN, probeAccentLights, probeScanSweep, probeThrusterPlume } from './probeCinematics'
import type { ProbePart } from '../rendererContract'
import {
  PROBE_MATERIALS,
  PROBE_RADIUS,
  nextProbeLod,
  partsForLod,
  type ProbeLod,
  type ProbeMaterialKey,
  type ProbePartDefinition,
  type ProbeShape,
} from './probeGeometry'

// 文章探测器。与 gl/probe.ts 同构。
//
// 「旁轨材料」是绕着恒星飞的一艘船：远景就得是低多边形的三维机体，近景补上
// 机构细节与可逐件点选的模型。点、字、图标都读不出这个概念。
//
// 环境里的探测器按层级分批用 thin instance 画（每个层级每个部件一批），
// 被检查的那一艘单独建成可拾取的独立网格 —— 与 StarLayer 的
// 「全景点云 + 聚焦球体」是同一套结构。

const ORBIT_BASE = 1.35
const ORBIT_STEP = 0.42
const ORBIT_SPEED = 0.055

export interface ProbeOrbitRecord {
  readonly probeId: string
  readonly starId: string
  readonly slot: number
  readonly phase: number
  readonly radius: number
  readonly axis: readonly [number, number, number]
  readonly u: readonly [number, number, number]
  readonly v: readonly [number, number, number]
  readonly speed: number
}

function orthonormalBasis(axis: readonly [number, number, number]) {
  const helper: readonly [number, number, number] = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: [number, number, number] = [
    helper[1] * axis[2] - helper[2] * axis[1],
    helper[2] * axis[0] - helper[0] * axis[2],
    helper[0] * axis[1] - helper[1] * axis[0],
  ]
  const uLength = Math.hypot(u[0], u[1], u[2]) || 1
  u[0] /= uLength; u[1] /= uLength; u[2] /= uLength
  const v: [number, number, number] = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]
  return { u: Object.freeze(u), v: Object.freeze(v) }
}

/** 稳定的星局部轨道分配：同一份数据每次重建都得到同一组槽位。 */
export function allocateProbeOrbits(
  index: UniverseIndex,
  stars: readonly StarDatum[],
): readonly ProbeOrbitRecord[] {
  const records: ProbeOrbitRecord[] = []
  for (const datum of stars) {
    const star = datum.s as { id?: string, g?: number, probeIds?: readonly string[] }
    if (!star.id || !star.probeIds?.length) continue
    const axis = clusterAxis(star.g ?? 0) as readonly [number, number, number]
    const basis = orthonormalBasis(axis)
    const seen = new Set<string>()
    let slot = 0
    for (const probeId of star.probeIds) {
      if (seen.has(probeId) || !index.probesById.has(probeId)) continue
      seen.add(probeId)
      records.push(Object.freeze({
        probeId,
        starId: star.id,
        slot,
        phase: (slot * 2.399963) % (Math.PI * 2),
        radius: ORBIT_BASE + slot * ORBIT_STEP + (datum.bodyR ?? 0.3),
        axis,
        u: basis.u,
        v: basis.v,
        speed: ORBIT_SPEED / (1 + slot * 0.18),
      }))
      slot += 1
    }
  }
  return Object.freeze(records)
}

export interface ProbeLayerOptions {
  readonly reducedMotion: boolean
  readonly parent?: TransformNode
  /** 画质分档：控制补光数量与尾焰分段，不控制它们存不存在。 */
  readonly quality?: Quality
}

export interface ProbeFrameInput {
  readonly elapsedMs: number
  readonly projectionScale: number
  readonly focusedStarId: string | null
  readonly starPositions: ReadonlyMap<string, Vector3>
  readonly starOpacities: ReadonlyMap<string, number>
}

export interface ProbeLayerDiagnostics {
  readonly probeCount: number
  readonly batchCount: number
  readonly lods: readonly ProbeLod[]
  readonly inspectedProbeId: string | null
  readonly inspectedPartCount: number
  readonly scanning: boolean
  readonly highlightedPart: ProbePart | null
  /** 被检查机体的机头方向（单位向量），朝着它绕行的切线。 */
  readonly inspectionHeading: readonly [number, number, number]
  readonly nearOpacity: number
  /** 环境批次里真正提交的实例数（不含被检查的那一艘）。 */
  readonly ambientInstanceCount: number
  readonly disposed: boolean
}

interface Batch {
  readonly lod: ProbeLod
  readonly definition: ProbePartDefinition
  readonly mesh: Mesh
}

function buildShape(scene: Scene, name: string, shape: ProbeShape): Mesh {
  if (shape.kind === 'box') {
    return CreateBox(name, { width: shape.width, height: shape.height, depth: shape.depth }, scene)
  }
  if (shape.kind === 'sphere') {
    return CreateSphere(name, { diameter: shape.diameter, segments: shape.segments }, scene)
  }
  if (shape.kind === 'cone') {
    return CreateCylinder(name, {
      diameterTop: 0, diameterBottom: shape.diameter, height: shape.height, tessellation: shape.tessellation,
    }, scene)
  }
  if (shape.kind === 'torus') {
    return CreateTorus(name, {
      diameter: shape.diameter, thickness: shape.thickness, tessellation: shape.tessellation,
    }, scene)
  }
  if (shape.kind === 'disc') {
    return CreateDisc(name, { radius: shape.radius, tessellation: shape.tessellation }, scene)
  }
  return CreateCylinder(name, {
    diameterTop: shape.diameterTop, diameterBottom: shape.diameterBottom,
    height: shape.height, tessellation: shape.tessellation,
  }, scene)
}

export interface ProbeMaterialShading {
  /** 漫反射相对本色的比例：金属越强，漫反射越暗。 */
  readonly diffuseScale: number
  readonly specularScale: number
  readonly specularPower: number
  readonly emissive: readonly [number, number, number]
}

/**
 * 把 Three 的 metalness/roughness 折算到本渲染器的 Blinn-Phong 参数。
 *
 * 行星与恒星都跑在 StandardMaterial 上；只为探测器额外拉进整条 PBR 管线要
 * 多付四百多 KB 首屏，而金属感真正靠的是「暗漫反射 + 窄而强的高光」，
 * 这两点 Blinn-Phong 表达得了。metalness/roughness 仍是 gl/probe.ts 的原值，
 * 只是在这里换算，材质区分（船体/面板/金属/镜片/灯/蚀刻）一件不少。
 */
export function probeMaterialShading(key: ProbeMaterialKey): ProbeMaterialShading {
  const spec = PROBE_MATERIALS[key]
  const gain = spec.emissiveIntensity ?? 1
  return Object.freeze({
    diffuseScale: 1 - spec.metallic * 0.62,
    specularScale: 0.18 + spec.metallic * 0.72,
    specularPower: Math.max(4, 160 * (1 - spec.roughness) ** 2),
    emissive: Object.freeze(
      (spec.emissive ?? [0, 0, 0]).map((channel) => channel * gain) as [number, number, number],
    ),
  })
}

function buildMaterial(scene: Scene, key: ProbeMaterialKey, suffix: string): StandardMaterial {
  const spec = PROBE_MATERIALS[key]
  const shading = probeMaterialShading(key)
  const material = new StandardMaterial(`probe:${key}:${suffix}`, scene)
  material.diffuseColor = new Color3(
    spec.color[0] * shading.diffuseScale,
    spec.color[1] * shading.diffuseScale,
    spec.color[2] * shading.diffuseScale,
  )
  material.specularColor = new Color3(
    (0.25 + spec.color[0] * 0.75) * shading.specularScale,
    (0.25 + spec.color[1] * 0.75) * shading.specularScale,
    (0.25 + spec.color[2] * 0.75) * shading.specularScale,
  )
  material.specularPower = shading.specularPower
  material.emissiveColor = new Color3(...shading.emissive)
  // 深空里没有天光，纯靠恒星点光会让背光面彻底变成剪影。给一点点环境项，
  // 与 gl/probe.ts 里那盏 ambient 的作用相同。
  material.ambientColor = new Color3(spec.color[0] * 0.2, spec.color[1] * 0.2, spec.color[2] * 0.2)
  material.backFaceCulling = !spec.doubleSided
  material.alphaMode = Constants.ALPHA_COMBINE
  return material
}

/** 扫掠走完机体的时长，与 Renderer 的 PROBE_SCAN_MS 同值。 */
const PROBE_SCAN_SWEEP_MS = 900
/** 尾焰几何的基准长度；逐帧按 probeThrusterPlume 的长度伸缩。 */
const THRUSTER_BASE_LENGTH = 0.10

export class ProbeLayer {
  private readonly scene: Scene
  private readonly records: readonly ProbeOrbitRecord[]
  private readonly batches: readonly Batch[]
  private readonly materials: StandardMaterial[] = []
  private readonly lodByProbe = new Map<string, ProbeLod>()
  private readonly positions = new Map<string, Vector3>()
  private readonly parent?: TransformNode
  private readonly reducedMotion: boolean
  private inspected: string | null = null
  private inspectedParts: { readonly part: ProbePart, readonly mesh: Mesh }[] = []
  private inspectionRoot: TransformNode | null = null
  private scanningValue = false
  private highlighted: ProbePart | null = null
  private readonly headings = new Map<string, Vector3>()
  private readonly lights: (HemisphericLight | DirectionalLight)[] = []
  private readonly accents: PointLight[] = []
  private readonly uplift: BabylonUpliftTier
  private thrusterMeshes: Mesh[] = []
  private scanSweepMesh: Mesh | null = null
  private scanStartedAt: number | null = null
  private lastElapsedMs = 0
  private nearOpacityValue = 0
  private ambientInstances = 0
  private disposed = false

  constructor(
    scene: Scene,
    index: UniverseIndex,
    stars: readonly StarDatum[],
    options: ProbeLayerOptions,
  ) {
    this.scene = scene
    this.parent = options.parent
    this.reducedMotion = options.reducedMotion
    this.uplift = babylonUpliftTier(options.quality ?? 'high')
    this.records = allocateProbeOrbits(index, stars)
    for (const record of this.records) this.lodByProbe.set(record.probeId, 'far')

    const batches: Batch[] = []
    for (const lod of ['far', 'medium', 'near'] as const) {
      for (const definition of partsForLod(lod)) {
        const mesh = buildShape(scene, `probe:${lod}:${definition.part}`, definition.shape)
        mesh.parent = options.parent ?? null
        mesh.isPickable = false
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        const material = buildMaterial(scene, definition.material, lod)
        this.materials.push(material)
        mesh.material = material
        batches.push({ lod, definition, mesh })
      }
    }
    this.batches = Object.freeze(batches)

    // 自带补光与主光，与 gl/probe.ts 的那两盏逐字一致。深空里恒星是唯一光源，
    // 机体在检查视角下几乎总是背光 —— 没有这套灯，模型就是一块黑剪影，
    // 「近景更完整的三维模型与材质」根本看不见。
    const fill = new HemisphericLight('probe:fill', new Vector3(0, 1, 0), scene)
    fill.diffuse = new Color3(0xb9 / 255, 0xd4 / 255, 1)
    fill.groundColor = new Color3(0x10 / 255, 0x15 / 255, 0x22 / 255)
    fill.intensity = 1.25
    const key = new DirectionalLight('probe:key', new Vector3(-2, -3, -4).normalize(), scene)
    key.diffuse = new Color3(1, 0xd7 / 255, 0xa0 / 255)
    key.intensity = 2.1
    this.lights.push(fill, key)
    // 只照探测器：这个渲染器的行星也跑在 StandardMaterial 上，全局加两盏灯
    // 会把整个星系照亮成白天。
    this.retargetLights()
  }

  /** 把灯的照射对象限定在当前存在的机体网格上。 */
  private retargetLights(): void {
    const meshes = [
      ...this.batches.map(({ mesh }) => mesh),
      ...this.inspectedParts.map(({ mesh }) => mesh),
    ]
    for (const light of this.lights) light.includedOnlyMeshes = meshes
    // 补光只照被检查的那一艘：它们是近距离点光，照到别的东西上会穿帮。
    const inspected = this.inspectedParts.map(({ mesh }) => mesh)
    for (const accent of this.accents) accent.includedOnlyMeshes = inspected
  }

  update(input: ProbeFrameInput): void {
    if (this.disposed) return
    this.lastElapsedMs = Number.isFinite(input.elapsedMs) ? input.elapsedMs : this.lastElapsedMs
    this.applyThruster(this.lastElapsedMs)
    this.applyScanSweep(this.lastElapsedMs)
    const time = this.reducedMotion ? 0 : input.elapsedMs
    const matricesByLod = new Map<ProbeLod, Map<ProbePart, number[]>>()
    let nearOpacity = 0

    for (const record of this.records) {
      const centre = input.starPositions.get(record.starId)
      const opacity = input.starOpacities.get(record.starId) ?? 0
      if (!centre || opacity <= 0.001) continue
      const angle = record.phase + record.speed * (time / 1000)
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      const position = this.positions.get(record.probeId) ?? new Vector3()
      position.set(
        centre.x + (record.u[0] * cosine + record.v[0] * sine) * record.radius,
        centre.y + (record.u[1] * cosine + record.v[1] * sine) * record.radius,
        centre.z + (record.u[2] * cosine + record.v[2] * sine) * record.radius,
      )
      this.positions.set(record.probeId, position)

      const camera = this.scene.activeCamera
      const viewZ = camera ? Math.max(0.001, Vector3.Distance(camera.globalPosition, position)) : 1
      const projected = PROBE_RADIUS * input.projectionScale / viewZ
      const lod = nextProbeLod(this.lodByProbe.get(record.probeId) ?? 'far', projected)
      this.lodByProbe.set(record.probeId, lod)

      // 机头对着轨道切线（轨道的导数），于是它是**贴着轨道飞**的，
      // 而不是一个固定朝向、被平移着走的模型。倾斜轨道也成立。
      const tangent = this.headings.get(record.probeId) ?? new Vector3()
      tangent.set(
        (-record.u[0] * sine + record.v[0] * cosine),
        (-record.u[1] * sine + record.v[1] * cosine),
        (-record.u[2] * sine + record.v[2] * cosine),
      )
      tangent.normalize()
      this.headings.set(record.probeId, tangent)
      const heading = Quaternion.FromUnitVectorsToRef(Vector3.RightReadOnly, tangent, new Quaternion())
      if (record.probeId === this.inspected) {
        // 被检查的那一艘由独立的近景模型画，恒为近景：「检查」本身就是最近的
        // 观察距离，再让它过一次 LOD 阶梯只会在小屏上把机体降级成远景剪影。
        // 阶梯状态照常记录，于是关闭检查后它回到自己该在的那一档，而不是
        // 从 near 一级一级走回去。
        nearOpacity = Math.max(nearOpacity, opacity)
        continue
      }
      const perLod = matricesByLod.get(lod) ?? new Map<ProbePart, number[]>()
      matricesByLod.set(lod, perLod)
      for (const definition of partsForLod(lod)) {
        const local = Matrix.Compose(
          Vector3.OneReadOnly,
          Quaternion.FromEulerAngles(definition.rotation[0], definition.rotation[1], definition.rotation[2]),
          new Vector3(definition.offset[0], definition.offset[1], definition.offset[2]),
        )
        const world = local.multiply(Matrix.Compose(Vector3.OneReadOnly, heading, position))
        const target = perLod.get(definition.part) ?? []
        perLod.set(definition.part, target)
        for (const value of world.m) target.push(value)
      }
    }
    this.nearOpacityValue = nearOpacity
    this.ambientInstances = 0

    for (const batch of this.batches) {
      const values = matricesByLod.get(batch.lod)?.get(batch.definition.part)
      if (!values || values.length === 0) {
        batch.mesh.setEnabled(false)
        continue
      }
      batch.mesh.setEnabled(true)
      batch.mesh.thinInstanceSetBuffer('matrix', Float32Array.from(values), 16, true)
      this.ambientInstances += values.length / 16
    }

    if (this.inspectionRoot && this.inspected) {
      const position = this.positions.get(this.inspected)
      if (position) this.inspectionRoot.position.copyFrom(position)
      const tangent = this.headings.get(this.inspected)
      if (tangent) {
        this.inspectionRoot.rotationQuaternion ??= new Quaternion()
        Quaternion.FromUnitVectorsToRef(
          Vector3.RightReadOnly, tangent, this.inspectionRoot.rotationQuaternion,
        )
      }
    }
  }

  /** 被检查的那一艘单独建模：逐件可拾取，材质用近景一档。 */
  inspect(probeId: string | null): void {
    if (this.disposed) return
    if (this.inspected === probeId) return
    this.releaseInspection()
    this.inspected = probeId
    if (!probeId || !this.records.some((record) => record.probeId === probeId)) {
      this.inspected = null
      return
    }
    // 只作父节点，不自带几何：用 Mesh 会让 Babylon 顺手实例化场景的
    // default material，检查关闭后它留在场景里，看起来像泄漏。
    const root = new TransformNode(`probe:inspect:${probeId}`, this.scene)
    root.parent = this.parent ?? null
    this.inspectionRoot = root
    for (const definition of partsForLod('near')) {
      const mesh = buildShape(this.scene, `probe:inspect:${probeId}:${definition.part}`, definition.shape)
      mesh.parent = root
      mesh.position.set(definition.offset[0], definition.offset[1], definition.offset[2])
      mesh.rotation.set(definition.rotation[0], definition.rotation[1], definition.rotation[2])
      mesh.isPickable = true
      mesh.alwaysSelectAsActiveMesh = true
      const material = buildMaterial(this.scene, definition.material, `inspect:${definition.part}`)
      this.materials.push(material)
      mesh.material = material
      this.inspectedParts.push({ part: definition.part, mesh })
    }
    this.buildInspectionCinematics(root)
    this.applyHighlight()
    this.retargetLights()
  }

  /**
   * 检查视角的电影化装置：三点补光 + 尾焰 + 扫描扫掠。
   *
   * 全部挂在检查根节点下，关闭检查时随它一起释放 —— 这三件东西只在
   * 「玩家正在端详这艘船」的时候有意义，常驻会白白吃掉每一帧。
   */
  private buildInspectionCinematics(root: TransformNode): void {
    for (const accent of probeAccentLights(this.uplift)) {
      const light = new PointLight(
        `probe:accent:${accent.role}`,
        new Vector3(accent.position[0], accent.position[1], accent.position[2]),
        this.scene,
      )
      light.parent = root
      light.diffuse = new Color3(accent.color[0], accent.color[1], accent.color[2])
      light.specular = new Color3(accent.color[0], accent.color[1], accent.color[2])
      light.intensity = accent.intensity
      light.range = accent.range
      this.accents.push(light)
    }

    // 尾焰：一串同轴锥体，越往外越细越冷。分段数由画质分档给，
    // 但**至少一段** —— 没有尾焰的飞船读起来是残骸。
    const segments = Math.max(1, Math.round(this.uplift.probeThrusterSegments))
    this.thrusterMeshes = Array.from({ length: segments }, (_unused, index) => {
      const ratio = (index + 1) / segments
      const mesh = CreateCylinder(`probe:thruster:${index}`, {
        diameterTop: PROBE_RADIUS * 0.26 * (1 - ratio * 0.72),
        diameterBottom: PROBE_RADIUS * 0.30 * (1 - ratio * 0.5),
        height: THRUSTER_BASE_LENGTH / segments,
        tessellation: 10,
      }, this.scene)
      mesh.parent = root
      mesh.isPickable = false
      mesh.rotation.z = Math.PI / 2
      const material = new StandardMaterial(`probe:thruster:${index}:material`, this.scene)
      material.disableLighting = true
      material.backFaceCulling = false
      material.alphaMode = Constants.ALPHA_ADD
      material.alpha = 0.62 * (1 - ratio * 0.6)
      this.materials.push(material)
      mesh.material = material
      return mesh
    })

    // 扫掠：一枚朝向机头轴的圆盘，扫描期间从头滑到尾。
    const sweep = CreateDisc('probe:scan:sweep', { radius: PROBE_RADIUS * 1.15, tessellation: 32 }, this.scene)
    sweep.parent = root
    sweep.isPickable = false
    sweep.rotation.y = Math.PI / 2
    sweep.position.x = -PROBE_SCAN_SWEEP_SPAN
    const sweepMaterial = new StandardMaterial('probe:scan:sweep:material', this.scene)
    sweepMaterial.disableLighting = true
    sweepMaterial.backFaceCulling = false
    sweepMaterial.alphaMode = Constants.ALPHA_ADD
    sweepMaterial.emissiveColor = new Color3(0.42, 0.82, 1)
    sweepMaterial.alpha = 0
    this.materials.push(sweepMaterial)
    sweep.material = sweepMaterial
    sweep.setEnabled(false)
    this.scanSweepMesh = sweep
    this.applyThruster(0)
  }

  /** 尾焰逐帧刷新：怠速抖动 + 扫描期间加推力（扫描时飞船在机动）。 */
  private applyThruster(elapsedMs: number): void {
    if (this.thrusterMeshes.length === 0) return
    const plume = probeThrusterPlume({
      elapsedMs, throttle: this.scanningValue ? 0.85 : 0.12, reducedMotion: this.reducedMotion,
    })
    const segments = this.thrusterMeshes.length
    for (const [index, mesh] of this.thrusterMeshes.entries()) {
      const ratio = (index + 1) / segments
      const material = mesh.material as StandardMaterial | null
      if (!material) continue
      const core = plume.coreColor
      const edge = plume.edgeColor
      material.emissiveColor = new Color3(
        (core[0] + (edge[0] - core[0]) * ratio) * plume.intensity,
        (core[1] + (edge[1] - core[1]) * ratio) * plume.intensity,
        (core[2] + (edge[2] - core[2]) * ratio) * plume.intensity,
      )
      material.alpha = Math.min(0.9, 0.62 * (1 - ratio * 0.6) * plume.intensity)
      // 长度沿**圆柱自身的高度轴**（本地 Y）伸缩。绕 Z 转 90° 之后它落在
      // 世界 X 上，也就是机体的尾向；缩放发生在旋转之前，所以这里必须是 y。
      // 写成 x 的话尾焰不会变长，只会变粗。
      const stretch = plume.length / THRUSTER_BASE_LENGTH
      mesh.scaling.y = Math.max(0.25, stretch)
      mesh.position.x = -PROBE_RADIUS * 0.62 - plume.length * (ratio - 0.5 / segments)
    }
  }

  /** 扫掠逐帧刷新。 */
  private applyScanSweep(elapsedMs: number): void {
    const sweep = this.scanSweepMesh
    if (!sweep) return
    if (!this.scanningValue || this.scanStartedAt === null) {
      sweep.setEnabled(false)
      return
    }
    const progress = (elapsedMs - this.scanStartedAt) / PROBE_SCAN_SWEEP_MS
    const state = probeScanSweep(progress)
    const material = sweep.material as StandardMaterial | null
    sweep.position.x = state.position
    if (material) material.alpha = state.opacity
    sweep.setEnabled(state.opacity > 0.002)
  }

  setScanning(scanning: boolean): void {
    if (this.disposed) return
    if (this.scanningValue !== scanning) this.scanStartedAt = scanning ? this.lastElapsedMs : null
    this.scanningValue = scanning
    this.applyHighlight()
    this.applyThruster(this.lastElapsedMs)
    this.applyScanSweep(this.lastElapsedMs)
  }

  setPartHighlight(part: ProbePart | null): void {
    if (this.disposed) return
    this.highlighted = part
    this.applyHighlight()
  }

  /** 主动旋转观察：转的是机体，不是相机。 */
  inspectionTarget(out: Vector3): boolean {
    if (this.disposed || !this.inspected) return false
    const position = this.positions.get(this.inspected)
    if (!position) return false
    out.copyFrom(position)
    return true
  }

  pickPart(mesh: { readonly uniqueId: number } | null): ProbePart | null {
    if (this.disposed || !mesh) return null
    return this.inspectedParts.find((entry) => entry.mesh.uniqueId === mesh.uniqueId)?.part ?? null
  }

  hasProbe(probeId: string): boolean {
    return this.records.some((record) => record.probeId === probeId)
  }

  diagnostics(): ProbeLayerDiagnostics {
    return Object.freeze({
      probeCount: this.records.length,
      batchCount: this.disposed ? 0 : this.batches.length,
      lods: this.records.map((record) => this.lodByProbe.get(record.probeId) ?? 'far'),
      inspectedProbeId: this.inspected,
      inspectedPartCount: this.inspectedParts.length,
      scanning: this.scanningValue,
      highlightedPart: this.highlighted,
      inspectionHeading: this.inspectedHeading(),
      nearOpacity: this.nearOpacityValue,
      ambientInstanceCount: this.ambientInstances,
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.releaseInspection()
    for (const batch of this.batches) batch.mesh.dispose(false, false)
    for (const material of this.materials) material.dispose()
    this.materials.length = 0
    for (const light of this.lights) light.dispose()
    this.lights.length = 0
    for (const accent of this.accents) accent.dispose()
    this.accents.length = 0
  }

  private applyHighlight(): void {
    for (const entry of this.inspectedParts) {
      const material = entry.mesh.material as StandardMaterial | null
      if (!material) continue
      const spec = PROBE_MATERIALS[
        partsForLod('near').find((definition) => definition.part === entry.part)!.material
      ]
      const base = spec.emissive ?? ([0.05, 0.07, 0.1] as const)
      const intensity = spec.emissiveIntensity ?? 0.4
      // 扫描时整机泛起一层琥珀底光；被选中的部件再单独提亮。
      const scanLift = this.scanningValue ? 0.55 : 0
      const highlightLift = this.highlighted === entry.part ? 1.35 : 0
      const gain = intensity + scanLift + highlightLift
      material.emissiveColor = new Color3(base[0] * gain, base[1] * gain, base[2] * gain)
    }
  }

  private inspectedHeading(): readonly [number, number, number] {
    const tangent = this.inspected ? this.headings.get(this.inspected) : null
    return Object.freeze(tangent ? [tangent.x, tangent.y, tangent.z] as const : [1, 0, 0] as const)
  }

  private releaseInspection(): void {
    for (const entry of this.inspectedParts) {
      const material = entry.mesh.material as StandardMaterial | null
      entry.mesh.dispose(false, false)
      if (material) {
        material.dispose()
        const index = this.materials.indexOf(material)
        if (index >= 0) this.materials.splice(index, 1)
      }
    }
    this.inspectedParts = []
    for (const light of this.accents) light.dispose()
    this.accents.length = 0
    for (const mesh of this.thrusterMeshes) {
      const material = mesh.material as StandardMaterial | null
      mesh.dispose(false, false)
      if (material) {
        material.dispose()
        const index = this.materials.indexOf(material)
        if (index >= 0) this.materials.splice(index, 1)
      }
    }
    this.thrusterMeshes = []
    const sweepMaterial = this.scanSweepMesh?.material as StandardMaterial | null
    this.scanSweepMesh?.dispose(false, false)
    if (sweepMaterial) {
      sweepMaterial.dispose()
      const index = this.materials.indexOf(sweepMaterial)
      if (index >= 0) this.materials.splice(index, 1)
    }
    this.scanSweepMesh = null
    this.scanStartedAt = null
    if (!this.disposed) this.retargetLights()
    this.inspectionRoot?.dispose(false, true)
    this.inspectionRoot = null
    this.inspected = null
  }
}
