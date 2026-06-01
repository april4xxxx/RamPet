import affectionAsset from '../assets/ram/affection.png'
import carriedAsset from '../assets/ram/carried.png'
import cleaningAsset from '../assets/ram/cleaning.png'
import dirtyAsset from '../assets/ram/dirty.png'
import excitedAsset from '../assets/ram/excited.png'
import happyAsset from '../assets/ram/happy.png'
import hungryAsset from '../assets/ram/hungry.png'
import idleAsset from '../assets/ram/idle.png'
import jumpingAsset from '../assets/ram/jumping.png'
import medicineAsset from '../assets/ram/medicine.png'
import playAsset from '../assets/ram/play.png'
import sadAsset from '../assets/ram/sad.png'
import sickAsset from '../assets/ram/sick.png'
import sleepAsset from '../assets/ram/sleep.png'
import spottedAsset from '../assets/ram/spotted.png'
import studyAsset from '../assets/ram/study.png'
import studyAltAsset from '../assets/ram/study-1.png'
import walk1Asset from '../assets/ram/walk-1.png'
import walk2Asset from '../assets/ram/walk-2.png'
import wavingAsset from '../assets/ram/waving.png'
import workAsset from '../assets/ram/work.png'
import workAltAsset from '../assets/ram/work-1.png'

export type PetMood =
  | 'idle'
  | 'happy'
  | 'walk'
  | 'sleep'
  | 'carried'
  | 'hungry'
  | 'eating'
  | 'dirty'
  | 'cleaning'
  | 'sick'
  | 'medicine'
  | 'sad'
  | 'excited'
  | 'study'
  | 'studyAlt'
  | 'spotted'
  | 'waving'
  | 'jumping'
  | 'work'
  | 'play'
  | 'affection'

export type PetCareStats = {
  hunger: number
  cleanliness: number
  mood: number
  health: number
}

export const PET_ASSET_PATHS: Record<PetMood, string> = {
  idle: idleAsset,
  happy: happyAsset,
  walk: walk1Asset,
  sleep: sleepAsset,
  carried: carriedAsset,
  hungry: hungryAsset,
  eating: happyAsset, // 临时复用 happy（吃东西时高兴脸），等独立素材接入后替换
  dirty: dirtyAsset,
  cleaning: cleaningAsset,
  sick: sickAsset,
  medicine: medicineAsset,
  sad: sadAsset,
  excited: excitedAsset,
  study: studyAsset,
  studyAlt: studyAltAsset,
  spotted: spottedAsset,
  waving: wavingAsset,
  jumping: jumpingAsset,
  work: workAsset,
  play: playAsset,
  affection: affectionAsset,
}

export const WALK_ASSET_PATHS = [walk1Asset, walk2Asset] as const
export const STUDY_ALT_ASSET_PATH = studyAltAsset
export const WORK_ALT_ASSET_PATH = workAltAsset

export const FALLBACK_ASSET_PATH = PET_ASSET_PATHS.idle

export const DEFAULT_STATS: PetCareStats = {
  hunger: 82,
  cleanliness: 88,
  mood: 86,
  health: 92,
}

export const SLEEP_AFTER_MS = 300000
export const TRANSIENT_FOR_MS = 1800
export const WALK_EVERY_MS = 25000          // 9s → 25s（减少自动走路频率）
export const WALK_DURATION_MS = 1920
export const WALK_STEP_INTERVAL_MS = 60
export const WALK_STEP_PX = 6
export const AMBIENT_EVERY_MS = 30000       // 10s → 30s（环境随机减一半）
export const AMBIENT_MOOD_DURATIONS: Partial<Record<PetMood, number>> = {
  study: 8000,
  work: 9000,
  play: 3000,
  excited: 2200,
}
// 用重复条目实现加权：idle 占 3/7 ≈ 43%，其余各 1/7 ≈ 14%（实际安静度更高，因
// `chooseAmbientMood` 抽到 idle 时只是停留 idle，不计入"状态变化"）。
export const AMBIENT_MOODS: PetMood[] = ['idle', 'idle', 'idle', 'study', 'work', 'play', 'excited']
export const SPEECH_BUBBLE_INTERVAL_MS = 300000  // 60s → 5min（说话气泡从 1min 一次降到 5min）
export const SPEECH_BUBBLE_INITIAL_MS = 12000    // 启动 3s → 12s（避开 waving 打招呼期间）

// === 养成数值层 (Care Stats) ===
//
// 设计原则：轻量陪伴档。一个工作日内自然衰减不至于触发危险阈值，但闲置一晚
// 回来通常会看到 hungry 或 dirty，给用户"该照顾一下"的钩子。
//
// 衰减速率（ms / -1 point）。值越大衰减越慢。
export const CARE_DECAY_INTERVAL_MS: Record<keyof PetCareStats, number> = {
  hunger: 5 * 60 * 1000,       // 5 分钟 -1，满→0 约 8.3h
  cleanliness: 8 * 60 * 1000,  // 8 分钟 -1，满→0 约 13.3h
  mood: 15 * 60 * 1000,        // 15 分钟 -1，满→0 约 25h（互动会反向回补）
  health: Number.POSITIVE_INFINITY, // 不自然衰减，只受联动惩罚
}

// 联动惩罚：其他三项持续 < 30 时，每 10 分钟扣 1 点 health
export const HEALTH_PENALTY_THRESHOLD = 30
export const HEALTH_PENALTY_INTERVAL_MS = 10 * 60 * 1000

// 危险阈值：低于这里就会触发对应 mood（独立检查器覆盖 ambient）
export const CARE_DANGER_THRESHOLD = 30
// 菜单显示阈值：低于这里才在右键菜单里出现"喂食/洗澡/吃药"
export const CARE_MENU_THRESHOLD = 60
// 阈值检查频率
export const CARE_CHECK_INTERVAL_MS = 30 * 1000

// 危险态对应的 mood + 优先级（数字越小越优先）
export const CARE_DANGER_MOODS: ReadonlyArray<{
  stat: keyof PetCareStats
  mood: PetMood
  priority: number
}> = [
  { stat: 'health', mood: 'sick', priority: 1 },
  { stat: 'hunger', mood: 'hungry', priority: 2 },
  { stat: 'cleanliness', mood: 'dirty', priority: 3 },
  { stat: 'mood', mood: 'sad', priority: 4 },
]

// 危险态持续时间（被覆盖后多久回到正常采样窗口）
export const CARE_DANGER_DURATION_MS = 6000

// 用户响应动作 → 数值回补
export const CARE_RESTORE: Record<'feed' | 'clean' | 'medicate', { stat: keyof PetCareStats; amount: number; mood: PetMood; duration: number }> = {
  feed:     { stat: 'hunger',      amount: 40, mood: 'eating',   duration: 1800 },
  clean:    { stat: 'cleanliness', amount: 40, mood: 'cleaning', duration: 1800 },
  medicate: { stat: 'health',      amount: 30, mood: 'medicine', duration: 1800 },
}

// 单次互动（单击/摸摸/玩耍）对 mood 数值的隐性回补
export const CARE_INTERACTION_MOOD_BONUS = 5

// 持久化：离线衰减封顶 8 小时
export const CARE_OFFLINE_CAP_MS = 8 * 60 * 60 * 1000
// 持久化写盘 debounce
export const CARE_PERSIST_DEBOUNCE_MS = 1000

export function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
