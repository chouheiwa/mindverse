import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalDialogLifecycleOptions {
  active?: boolean
  getReturnFocus?: () => HTMLElement | null
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocusOnCleanupRef?: RefObject<boolean>
}

function scheduleFocusRestore(generationRef: RefObject<number>, generation: number, returnFocus: HTMLElement | null | undefined) {
  queueMicrotask(() => {
    if (generationRef.current !== generation) return
    if (returnFocus?.isConnected) returnFocus.focus()
  })
}

const shouldRestoreFocus = (ref: RefObject<boolean> | undefined) => ref?.current !== false

export function useModalDialogLifecycle(
  dialogRef: RefObject<HTMLDialogElement | null>,
  options: ModalDialogLifecycleOptions = {},
) {
  const nativeModalRef = useRef(false)
  const generationRef = useRef(0)
  const { active = true, getReturnFocus, initialFocusRef, restoreFocusOnCleanupRef } = options

  useLayoutEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const generation = ++generationRef.current
    const returnFocus = getReturnFocus?.()
    const inerted: Array<{ element: HTMLElement; hadAttribute: boolean }> = []
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      const parent = branch.parentElement
      for (const sibling of parent.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue
        inerted.push({ element: sibling, hadAttribute: sibling.hasAttribute('inert') })
        sibling.setAttribute('inert', '')
      }
      branch = parent
      if (parent === document.body) break
    }
    const hadAriaModal = dialog.hasAttribute('aria-modal')
    const hadTabIndex = dialog.hasAttribute('tabindex')
    dialog.setAttribute('aria-modal', 'true')
    if (!hadTabIndex) dialog.tabIndex = -1
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
      nativeModalRef.current = true
    } else {
      dialog.setAttribute('open', '')
      nativeModalRef.current = false
    }
    const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE)
    ;(initialFocusRef?.current ?? firstFocusable ?? dialog).focus()

    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      if (!hadAriaModal) dialog.removeAttribute('aria-modal')
      if (!hadTabIndex) dialog.removeAttribute('tabindex')
      for (const { element, hadAttribute } of inerted) if (!hadAttribute) element.removeAttribute('inert')
      if (!shouldRestoreFocus(restoreFocusOnCleanupRef)) return
      scheduleFocusRestore(generationRef, generation, returnFocus)
    }
  }, [active, dialogRef, getReturnFocus, initialFocusRef, restoreFocusOnCleanupRef])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { nativeModalRef, onKeyDown }
}
