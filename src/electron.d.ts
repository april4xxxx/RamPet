import type { PetAction } from './lib/codex-status'

export {}

declare global {
  interface Window {
    ramPetWindow?: {
      moveBy(delta: { x: number; y: number }): Promise<{ x: number; y: number }>
      showContextMenu(): Promise<void>
      onAction(callback: (action: PetAction) => void): () => void
    }
  }
}
