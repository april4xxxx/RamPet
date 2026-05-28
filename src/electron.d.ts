import type { PetAction } from './lib/codex-status'

export {}

declare global {
  interface Window {
    ramPetWindow?: {
      moveBy(delta: { x: number; y: number }): Promise<{ x: number; y: number }>
      startDrag(offset: { x: number; y: number }): Promise<void>
      endDrag(): Promise<void>
      setClickable(clickable: boolean): Promise<void>
      showContextMenu(): Promise<void>
      onAction(callback: (action: PetAction) => void): () => void
    }
  }
}
