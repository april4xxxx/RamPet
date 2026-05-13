import type { PetMood } from './pet-state'

export type CodexPetStatus =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'planning'
  | 'running'
  | 'review'
  | 'success'
  | 'blocked'
  | 'error'

export type CodexStatusAction = {
  type: 'codex-status'
  status: CodexPetStatus
  mood: PetMood
  message: string
  detail?: string
  preview?: string[]
  updatedAt: string
  source?: string
}

export type PetAction =
  | {
      type: 'mood'
      mood: string
    }
  | CodexStatusAction

export const CODEX_STATUS_LABELS: Record<CodexPetStatus, string> = {
  idle: '就绪',
  thinking: '思考中',
  reading: '阅读中',
  planning: '规划中',
  running: '执行中',
  review: '检查中',
  success: '已完成',
  blocked: '等待确认',
  error: '需要处理',
}

export function isPersistentCodexStatus(status: CodexPetStatus) {
  return status !== 'idle' && status !== 'success'
}
