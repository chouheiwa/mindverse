import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { selectPlanetData, type UniverseIndex } from '../../domain/universe'
import type { Mode } from '../../types'
import { buildMaterialTimeline, planetMaterialInput } from '../gl/planetMaterials'
import { starData } from '../gl/starData'
import type { PlanetDatum } from '../gl/bodies'
import type {
  InspectionPose,
  MindverseRenderer,
  ProbePart,
  RendererCallbacks,
  StrataMoveIntent,
  StrataRequest,
  StrataToken,
} from '../rendererContract'
import { BabylonRuntime, BabylonWebGL2RequiredError } from './runtime'

const ORBIT_BASE = 2.1
const ORBIT_STEP = 1.15
const PLANET_MIN = 0.085
const PLANET_MAX = 0.20

export class BabylonRenderer implements MindverseRenderer {
  private readonly runtime: BabylonRuntime
  private readonly callbacks: RendererCallbacks
  private readonly canvas: HTMLCanvasElement
  private readonly planets: readonly PlanetDatum[]
  private readonly probes: ReadonlySet<string>
  private selected: PlanetDatum | null = null
  private destroyed = false
  private reducedMotion: boolean

  constructor(
    canvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    index: UniverseIndex,
    reducedMotion: boolean,
    callbacks: RendererCallbacks = {},
  ) {
    this.canvas = canvas
    this.callbacks = callbacks
    this.reducedMotion = reducedMotion
    this.planets = buildPlanetBookkeeping(index)
    this.probes = new Set(index.probesById.keys())

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
    })
    if (engine.webGLVersion < 2) {
      engine.dispose()
      throw new BabylonWebGL2RequiredError()
    }

    let scene: Scene | null = null
    let runtimeConstructionStarted = false
    try {
      scene = new Scene(engine)
      scene.clearColor = new Color4(0, 0, 0, 1)
      const camera = new FreeCamera('mindverse-camera', new Vector3(0, 0, -10), scene)
      camera.setTarget(Vector3.Zero())
      camera.minZ = 0.1
      scene.activeCamera = camera
      runtimeConstructionStarted = true
      this.runtime = new BabylonRuntime({
        engine,
        scene,
        canvas: {
          addEventListener: (type, listener) => canvas.addEventListener(type, listener),
          removeEventListener: (type, listener) => canvas.removeEventListener(type, listener),
        },
      }, {
        onReady: callbacks.onRenderReady,
        onError: callbacks.onRenderError,
      })
      labelCanvas.width = Math.max(1, labelCanvas.width)
      labelCanvas.height = Math.max(1, labelCanvas.height)
    } catch (cause) {
      if (!runtimeConstructionStarted) {
        if (scene) scene.dispose()
        engine.dispose()
      }
      throw cause
    }
  }

  start(): void { this.runtime.start() }
  stop(): void { this.runtime.stop() }
  suspend(): void { this.runtime.suspend() }
  resume(): void { this.runtime.resume() }
  resize(): void { this.runtime.resize() }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.selected = null
    this.runtime.destroy()
  }

  setMode(_mode: Mode, _wormIdx = 0): void {}

  resetView(): void {
    if (this.destroyed) return
    this.clearPlanet()
  }

  clearPlanet(): void {
    if (this.destroyed || !this.selected) return
    this.selected = null
    this.callbacks.onAnchor?.(0, 0, false)
    this.callbacks.onPickPlanet?.(null)
  }

  selectQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    if (this.destroyed) return null
    const planet = this.planets.find((candidate) =>
      'id' in candidate.star.s && candidate.star.s.id === starId && candidate.question.id === questionId) ?? null
    if (!planet) return null
    this.selected = planet
    this.callbacks.onPickPlanet?.(planet)
    return planet
  }

  restoreQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    return this.selectQuestionPlanet(starId, questionId)
  }

  setWorkspaceOpen(open: boolean): void {
    if (!this.destroyed) this.canvas.style.pointerEvents = open ? 'none' : ''
  }

  orbitWorkspace(_deltaX: number, _deltaY: number): void {}

  approachProbe(probeId: string, token: number): void {
    this.reportProbeUnsupported(probeId, token)
  }

  startProbeScan(probeId: string, token: number): void {
    this.reportProbeUnsupported(probeId, token)
  }

  setProbeInspectionPose(_pose: InspectionPose): void {}
  focusProbePart(_part: ProbePart | null): void {}
  exitProbeInspection(): void {}

  setReducedMotion(reduced: boolean): void {
    if (this.destroyed || this.reducedMotion === reduced) return
    this.reducedMotion = reduced
  }

  skipGenesis(): void {
    if (!this.destroyed) this.callbacks.onGenesisEnd?.()
  }

  enterStrata(request: StrataRequest): void {
    if (this.destroyed) return
    this.callbacks.onStrataError?.({
      token: request.token,
      questionId: request.questionId,
      scope: 'transition',
      cause: unsupported('答案地层尚未接入 Babylon 垂直样片。'),
    })
  }

  moveStrata(_input: StrataMoveIntent): void {}
  focusAnswerSpecimen(_answerId: string): void {}
  closeAnswerSpecimen(): void {}
  exitStrata(_token: StrataToken): void {}

  private reportProbeUnsupported(probeId: string, token: number): void {
    if (this.destroyed) return
    const label = this.probes.has(probeId) ? 'Babylon 垂直样片尚未迁移探测器检查。' : `未知探测器：${probeId}`
    this.callbacks.onProbeError?.({ probeId, token, cause: unsupported(label) })
  }
}

function unsupported(message: string): Error {
  const cause = new Error(message)
  cause.name = 'UnsupportedRendererFeatureError'
  return cause
}

function buildPlanetBookkeeping(index: UniverseIndex): readonly PlanetDatum[] {
  const timeline = buildMaterialTimeline([...index.answersById.values()])
  const planets: PlanetDatum[] = []
  for (const star of starData(index.universe)) {
    if (!('id' in star.s)) continue
    for (const datum of selectPlanetData(index, star.s)) {
      const material = planetMaterialInput(datum, timeline)
      const orbitR = ORBIT_BASE + (datum.orbitIndex - 1) * ORBIT_STEP
      planets.push(Object.freeze({
        star,
        question: datum.question,
        answerCount: datum.answerCount,
        created: datum.created,
        collected: datum.collected,
        ...(datum.latestPublicAt === undefined ? {} : { latestPublicAt: datum.latestPublicAt }),
        answers: datum.answers,
        material,
        orbitIndex: datum.orbitIndex,
        index: planets.length,
        u: [star.sysU[0], star.sysU[1], star.sysU[2]] as [number, number, number],
        v: [star.sysV[0], star.sysV[1], star.sysV[2]] as [number, number, number],
        orbitR,
        phase: ((datum.orbitIndex * 137.508 + star.seed * 31.7) * Math.PI) / 180,
        period: 7 + 2.4 * Math.pow(orbitR, 1.5),
        radius: PLANET_MIN + (PLANET_MAX - PLANET_MIN) * material.answerDensity,
      }))
    }
  }
  return Object.freeze(planets)
}
