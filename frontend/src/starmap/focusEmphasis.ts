export const NON_FOCUSED_OPACITY = 0.12

export function focusOpacity(current: boolean, focused: boolean): number {
  return !focused || current ? 1 : NON_FOCUSED_OPACITY
}

export function ownerOpacity<T extends string | number>(owner: T, focusOwner: T | null): number {
  return focusOpacity(owner === focusOwner, focusOwner !== null)
}
