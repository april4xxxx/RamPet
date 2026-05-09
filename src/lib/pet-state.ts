import affectionAsset from '../assets/ram/affection.png'
import carriedAsset from '../assets/ram/carried.png'
import cleaningAsset from '../assets/ram/cleaning.png'
import dirtyAsset from '../assets/ram/dirty.png'
import excitedAsset from '../assets/ram/excited.png'
import happyAsset from '../assets/ram/happy.png'
import hungryAsset from '../assets/ram/hungry.png'
import idleAsset from '../assets/ram/idle.png'
import medicineAsset from '../assets/ram/medicine.png'
import playAsset from '../assets/ram/play.png'
import sadAsset from '../assets/ram/sad.png'
import sickAsset from '../assets/ram/sick.png'
import sleepAsset from '../assets/ram/sleep.png'
import studyAsset from '../assets/ram/study.png'
import studyAltAsset from '../assets/ram/study-1.png'
import walk1Asset from '../assets/ram/walk-1.png'
import walk2Asset from '../assets/ram/walk-2.png'
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
  eating: idleAsset,
  dirty: dirtyAsset,
  cleaning: cleaningAsset,
  sick: sickAsset,
  medicine: medicineAsset,
  sad: sadAsset,
  excited: excitedAsset,
  study: studyAsset,
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
export const WALK_EVERY_MS = 9000
export const WALK_DURATION_MS = 1920
export const WALK_STEP_INTERVAL_MS = 60
export const WALK_STEP_PX = 6
export const AMBIENT_EVERY_MS = 10000
export const AMBIENT_MOOD_DURATIONS: Partial<Record<PetMood, number>> = {
  study: 8000,
  work: 9000,
  play: 3000,
  excited: 2200,
}
export const CARE_DECAY_EVERY_MS = 9000
export const AMBIENT_MOODS: PetMood[] = ['idle', 'study', 'work', 'play', 'excited']

export function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
