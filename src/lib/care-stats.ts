import { ref, type Ref } from 'vue'
import {
  CARE_CHECK_INTERVAL_MS,
  CARE_DANGER_MOODS,
  CARE_DANGER_THRESHOLD,
  CARE_DECAY_INTERVAL_MS,
  CARE_INTERACTION_MOOD_BONUS,
  CARE_OFFLINE_CAP_MS,
  CARE_PERSIST_DEBOUNCE_MS,
  CARE_RESTORE,
  DEFAULT_STATS,
  HEALTH_PENALTY_INTERVAL_MS,
  HEALTH_PENALTY_THRESHOLD,
  clampStat,
  type PetCareStats,
  type PetMood,
} from './pet-state'

export type CareStatKey = keyof PetCareStats
export type CareAction = keyof typeof CARE_RESTORE

export type PersistedCareStats = {
  stats: PetCareStats
  savedAt: number
}

export type DangerSignal = {
  stat: CareStatKey
  mood: PetMood
  value: number
} | null

const STAT_KEYS: CareStatKey[] = ['hunger', 'cleanliness', 'mood', 'health']

function applyDecayBetween(stats: PetCareStats, elapsedMs: number, residual: Record<CareStatKey, number>): {
  next: PetCareStats
  residual: Record<CareStatKey, number>
  unhealthyResidualMs: number
} {
  if (elapsedMs <= 0) {
    return { next: { ...stats }, residual: { ...residual }, unhealthyResidualMs: 0 }
  }
  const next: PetCareStats = { ...stats }
  const nextResidual = { ...residual }
  for (const key of STAT_KEYS) {
    const interval = CARE_DECAY_INTERVAL_MS[key]
    if (!Number.isFinite(interval)) continue
    const total = elapsedMs + nextResidual[key]
    const drops = Math.floor(total / interval)
    if (drops > 0) {
      next[key] = clampStat(next[key] - drops)
      nextResidual[key] = total - drops * interval
    } else {
      nextResidual[key] = total
    }
  }
  // 健康联动惩罚：取 hunger / cleanliness / mood 三项中"该项 < 30 的实际时长"的最大值
  // （= 并集时长，因为三项都单调递减、unhealthy 段都是 [t_cross, elapsedMs]）。
  // 修复了之前把整段 elapsed 一刀切当作 unhealthy 的离线惩罚 bug。
  const monitored: CareStatKey[] = ['hunger', 'cleanliness', 'mood']
  let unhealthyMs = 0
  for (const key of monitored) {
    const start = stats[key]
    const end = next[key]
    let segment = 0
    if (start < HEALTH_PENALTY_THRESHOLD) {
      segment = elapsedMs
    } else if (end >= HEALTH_PENALTY_THRESHOLD) {
      segment = 0
    } else {
      const interval = CARE_DECAY_INTERVAL_MS[key]
      if (Number.isFinite(interval)) {
        const crossTime = (start - HEALTH_PENALTY_THRESHOLD) * interval
        segment = Math.max(0, elapsedMs - crossTime)
      }
    }
    if (segment > unhealthyMs) unhealthyMs = segment
  }
  return { next, residual: nextResidual, unhealthyResidualMs: unhealthyMs }
}

export function useCareStats(options: {
  load: () => Promise<PersistedCareStats | null>
  save: (snapshot: PersistedCareStats) => void
  report?: (stats: PetCareStats) => void
}) {
  const stats: Ref<PetCareStats> = ref({ ...DEFAULT_STATS })
  const dangerSignal: Ref<DangerSignal> = ref(null)

  // 衰减残差：上次结算后剩余的不足 1 个 interval 的累积时间
  const residual: Record<CareStatKey, number> = { hunger: 0, cleanliness: 0, mood: 0, health: 0 }
  let unhealthyAccumMs = 0
  let healthPenaltyResidualMs = 0

  let lastTick = Date.now()
  let decayTimer = 0
  let persistDebounceTimer = 0
  let stopped = false

  function notifyChange() {
    options.report?.({ ...stats.value })
    if (persistDebounceTimer) window.clearTimeout(persistDebounceTimer)
    persistDebounceTimer = window.setTimeout(() => {
      persistDebounceTimer = 0
      options.save({ stats: { ...stats.value }, savedAt: Date.now() })
    }, CARE_PERSIST_DEBOUNCE_MS)
  }

  function advance(now: number) {
    const elapsed = Math.max(0, now - lastTick)
    lastTick = now
    if (elapsed === 0) return
    const result = applyDecayBetween(stats.value, elapsed, residual)
    stats.value = result.next
    Object.assign(residual, result.residual)
    if (result.unhealthyResidualMs > 0) {
      unhealthyAccumMs += result.unhealthyResidualMs
      const total = unhealthyAccumMs + healthPenaltyResidualMs
      const penalty = Math.floor(total / HEALTH_PENALTY_INTERVAL_MS)
      if (penalty > 0) {
        stats.value = { ...stats.value, health: clampStat(stats.value.health - penalty) }
        healthPenaltyResidualMs = total - penalty * HEALTH_PENALTY_INTERVAL_MS
        unhealthyAccumMs = 0
      } else {
        healthPenaltyResidualMs = total
        unhealthyAccumMs = 0
      }
    } else {
      // 健康连续条件被打破，重置累计
      unhealthyAccumMs = 0
      healthPenaltyResidualMs = 0
    }
    notifyChange()
  }

  function evaluateDanger() {
    let chosen: DangerSignal = null
    for (const entry of CARE_DANGER_MOODS) {
      const value = stats.value[entry.stat]
      if (value < CARE_DANGER_THRESHOLD) {
        if (!chosen || entry.priority < CARE_DANGER_MOODS.find((m) => m.stat === chosen!.stat)!.priority) {
          chosen = { stat: entry.stat, mood: entry.mood, value }
        }
      }
    }
    dangerSignal.value = chosen
  }

  async function hydrate() {
    const saved = await options.load().catch(() => null)
    if (!saved) {
      lastTick = Date.now()
      options.report?.({ ...stats.value })
      return
    }
    const cappedNow = Date.now()
    const rawElapsed = cappedNow - saved.savedAt
    // sanity check：负值（时钟回拨）或 > 30 天（异常）按 0 处理，避免离线封顶被恶意/异常时钟触发
    const sane = Number.isFinite(rawElapsed) && rawElapsed >= 0 && rawElapsed < 30 * 24 * 60 * 60 * 1000
    const offlineElapsed = sane ? Math.min(rawElapsed, CARE_OFFLINE_CAP_MS) : 0
    const result = applyDecayBetween(saved.stats, offlineElapsed, residual)
    stats.value = result.next
    Object.assign(residual, result.residual)
    lastTick = cappedNow
    options.report?.({ ...stats.value })
  }

  function tickDecay() {
    if (stopped) return
    advance(Date.now())
    evaluateDanger()
  }

  function start() {
    // 衰减 tick 内已经会调用 evaluateDanger，不需要额外的检查 timer
    decayTimer = window.setInterval(tickDecay, CARE_CHECK_INTERVAL_MS)
    evaluateDanger()
  }

  function stop() {
    stopped = true
    if (decayTimer) window.clearInterval(decayTimer)
    if (persistDebounceTimer) {
      window.clearTimeout(persistDebounceTimer)
      persistDebounceTimer = 0
      options.save({ stats: { ...stats.value }, savedAt: Date.now() })
    }
  }

  function restore(action: CareAction) {
    const recipe = CARE_RESTORE[action]
    if (!recipe) return null
    advance(Date.now())
    stats.value = {
      ...stats.value,
      [recipe.stat]: clampStat(stats.value[recipe.stat] + recipe.amount),
    }
    notifyChange()
    evaluateDanger()
    return recipe
  }

  function applyInteractionBonus() {
    advance(Date.now())
    stats.value = { ...stats.value, mood: clampStat(stats.value.mood + CARE_INTERACTION_MOOD_BONUS) }
    notifyChange()
    evaluateDanger()
  }

  return {
    stats,
    dangerSignal,
    hydrate,
    start,
    stop,
    restore,
    applyInteractionBonus,
  }
}
