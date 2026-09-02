import { describe, expect, test, vi } from 'vitest'
import { buildStrataSceneModel } from '../../domain/strata'
import { strataFixture } from '../../test/strataFixture'
import type { RendererCallbacks, StrataPhase, StrataPose, StrataRequest } from '../rendererContract'
import { StrataTransitionController, type StrataAnimationPort } from './strataTransition'

const initialPose: StrataPose = { depth: 7.5, yaw: 0.35, pitch: -0.2, snapId: null }

function harness() {
  const pending: Array<{
    phase: StrataPhase | 'exit'
    token: number
    complete: () => void
    fail: (cause: Error) => void
    cancelled: boolean
  }> = []
  const port: StrataAnimationPort = {
    capturePose: vi.fn(() => ({ ...initialPose })),
    applyPose: vi.fn(),
    setUniverseVisible: vi.fn(),
    animate: vi.fn((phase, token, complete, fail) => {
      const item = { phase, token, complete, fail, cancelled: false }
      pending.push(item)
      return () => { item.cancelled = true }
    }),
  }
  const events: string[] = []
  const callbacks: RendererCallbacks = {
    onStrataPhase: vi.fn(({ phase }) => events.push(phase)),
    onStrataEntered: vi.fn(() => events.push('entered')),
    onStrataExited: vi.fn(() => events.push('exited')),
    onStrataPose: vi.fn(() => events.push('pose')),
    onAnswerSpecimenFocus: vi.fn(({ answerId }) => events.push(`answer:${answerId}`)),
    onStrataError: vi.fn(() => events.push('error')),
  }
  return { controller: new StrataTransitionController(port, callbacks), port, callbacks, pending, events }
}

const request = (token: number): StrataRequest => ({
  token,
  questionId: 'question:7',
  scene: buildStrataSceneModel(strataFixture.index, 'question:7'),
})

describe('strata transition token protocol', () => {
  test('orders approach, crossing, entered, and free for one token', () => {
    const { controller, pending, events } = harness()
    controller.enter(request(1))
    expect(events).toEqual(['surface-approach'])

    pending[0].complete()
    expect(events).toEqual(['surface-approach', 'surface-crossing'])
    pending[1].complete()
    expect(events).toEqual(['surface-approach', 'surface-crossing', 'entered', 'strata-free', 'pose'])
  })

  test('is idempotent for the same token and cancels/suppresses late callbacks for a new token', () => {
    const { controller, pending, events, port } = harness()
    controller.enter(request(1))
    controller.enter(request(1))
    expect(port.animate).toHaveBeenCalledTimes(1)

    controller.enter(request(2))
    expect(pending[0].cancelled).toBe(true)
    pending[0].complete()
    pending[0].fail(new Error('late'))
    expect(events).toEqual(['surface-approach', 'surface-approach'])
  })

  test('reports an invalid answer once without mutating the pose', () => {
    const { controller, pending, callbacks, port } = harness()
    controller.enter(request(3))
    pending[0].complete()
    pending[1].complete()
    vi.mocked(port.applyPose).mockClear()

    controller.focusAnswer('answer:missing')

    expect(callbacks.onStrataError).toHaveBeenCalledTimes(1)
    expect(port.applyPose).not.toHaveBeenCalled()
  })

  test('focuses a valid specimen, restores its exact pose once, and ignores repeated close', () => {
    const { controller, pending, port, events } = harness()
    controller.enter(request(4))
    pending[0].complete()
    pending[1].complete()
    controller.move({ forward: 0.7, yaw: -0.4, pitch: 0.2 }, 1 / 60)
    const beforeFocus = controller.pose
    const answerId = request(4).scene.strata[0].specimens[0].answerId

    controller.focusAnswer(answerId)
    controller.closeAnswer()
    const callsAfterClose = vi.mocked(port.applyPose).mock.calls.length
    controller.closeAnswer()

    expect(events).toContain(`answer:${answerId}`)
    expect(vi.mocked(port.applyPose).mock.calls.at(-1)?.[0]).toEqual(beforeFocus)
    expect(port.applyPose).toHaveBeenCalledTimes(callsAfterClose)
  })

  test('exits only the active token and restores the exact captured entry pose', () => {
    const { controller, pending, port, events } = harness()
    controller.enter(request(5))
    pending[0].complete()
    pending[1].complete()
    controller.exit(99)
    expect(pending).toHaveLength(2)

    controller.exit(5)
    expect(pending.at(-1)?.phase).toBe('exit')
    pending.at(-1)?.complete()

    expect(vi.mocked(port.applyPose).mock.calls.at(-1)?.[0]).toEqual(initialPose)
    expect(port.setUniverseVisible).toHaveBeenLastCalledWith(true)
    expect(events.at(-1)).toBe('exited')
  })

  test('suppresses late exit completion and error after replacement', () => {
    const { controller, pending, events } = harness()
    controller.enter(request(6))
    pending[0].complete()
    pending[1].complete()
    controller.exit(6)
    const oldExit = pending.at(-1)!
    controller.enter(request(7))
    expect(oldExit.cancelled).toBe(true)
    oldExit.complete()
    oldExit.fail(new Error('late exit'))
    expect(events).not.toContain('exited')
    expect(events).not.toContain('error')
  })

  test('cleans up a failed entry and keeps a failed exit retryable', () => {
    const entry = harness()
    entry.controller.enter(request(8))
    entry.pending[0].fail(new Error('approach failed'))
    expect(entry.events).toEqual(['surface-approach', 'error'])
    expect(entry.controller.token).toBeNull()
    expect(entry.port.setUniverseVisible).toHaveBeenLastCalledWith(true)

    const exiting = harness()
    exiting.controller.enter(request(9))
    exiting.pending[0].complete()
    exiting.pending[1].complete()
    exiting.controller.exit(9)
    exiting.pending.at(-1)?.fail(new Error('exit failed'))
    exiting.controller.exit(9)
    expect(exiting.pending.filter(({ phase }) => phase === 'exit')).toHaveLength(2)
  })
})
