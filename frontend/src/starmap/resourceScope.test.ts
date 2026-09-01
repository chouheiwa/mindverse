import { describe, expect, test, vi } from 'vitest'
import { __failResourceAfterForTests, ResourceScope } from './resourceScope'

describe('ResourceScope', () => {
  test('reports zero owned resources after a failed construction rollback', () => {
    const failedSizes: number[] = []
    const originalDispose = ResourceScope.prototype.dispose
    const dispose = vi.spyOn(ResourceScope.prototype, 'dispose').mockImplementation(function (this: ResourceScope) {
      originalDispose.call(this)
      failedSizes.push(this.size)
    })
    try {
      expect(() => ResourceScope.construct((scope) => {
        scope.defer(() => undefined)
        throw new Error('partial construction')
      })).toThrow('partial construction')
      expect(failedSizes).toEqual([0])
    } finally {
      dispose.mockRestore()
    }
  })
  test('disposes in reverse order exactly once', () => {
    const calls: string[] = []
    const scope = new ResourceScope()
    scope.defer(() => calls.push('renderer'))
    scope.defer(() => calls.push('layers'))
    scope.defer(() => calls.push('listeners'))

    scope.dispose()
    scope.dispose()
    expect(calls).toEqual(['listeners', 'layers', 'renderer'])
  })

  test('release transfers ownership to one idempotent disposer', () => {
    const cleanup = vi.fn()
    const scope = new ResourceScope()
    scope.defer(cleanup)
    const dispose = scope.release()

    scope.dispose()
    dispose()
    dispose()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  test('defer after disposal returns the same already-run once cleanup', () => {
    const cleanup = vi.fn()
    const scope = new ResourceScope()
    scope.dispose()

    const deferred = scope.defer(cleanup)
    deferred()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  test('a partial construction failure cleans resources already registered once', () => {
    const calls: string[] = []
    expect(() => ResourceScope.construct((scope) => {
      scope.defer(() => calls.push('geometry'))
      scope.defer(() => calls.push('material'))
      throw new Error('injected failure')
    })).toThrow('injected failure')
    expect(calls).toEqual(['material', 'geometry'])
  })

  test('test-only failure injection throws after the requested resource and unwinds it', () => {
    const cleanup = vi.fn()
    __failResourceAfterForTests(1)
    expect(() => ResourceScope.construct((scope) => {
      scope.defer(cleanup)
    })).toThrow('injected resource failure after 1')
    expect(cleanup).toHaveBeenCalledOnce()
    __failResourceAfterForTests(null)
  })
})
