import type { PetAction } from './lib/codex-status'
import type { PetCareStats } from './lib/pet-state'
import type { PersistedCareStats } from './lib/care-stats'

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
      loadCareStats(): Promise<PersistedCareStats | null>
      saveCareStats(payload: PersistedCareStats): Promise<void>
      reportCareStats(stats: PetCareStats): Promise<void>
    }
  }
}
