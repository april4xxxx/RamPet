<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AMBIENT_EVERY_MS,
  AMBIENT_MOOD_DURATIONS,
  AMBIENT_MOODS,
  FALLBACK_ASSET_PATH,
  PET_ASSET_PATHS,
  SLEEP_AFTER_MS,
  STUDY_ALT_ASSET_PATH,
  WORK_ALT_ASSET_PATH,
  TRANSIENT_FOR_MS,
  WALK_ASSET_PATHS,
  WALK_DURATION_MS,
  WALK_EVERY_MS,
  WALK_STEP_INTERVAL_MS,
  WALK_STEP_PX,
  type PetMood,
} from '../lib/pet-state'
import {
  CODEX_STATUS_LABELS,
  isPersistentCodexStatus,
  type CodexPetStatus,
  type CodexStatusAction,
  type PetAction,
} from '../lib/codex-status'

const props = defineProps<{
  desktop?: boolean
}>()

const mood = ref<PetMood>('idle')
const position = ref(props.desktop ? { x: 68, y: 92 } : { x: 80, y: 260 })
const dragOffset = ref({ x: 0, y: 0 })
const lastPointer = ref({ x: 0, y: 0 })
const pointerDown = ref<{ x: number; y: number } | null>(null)
const DRAG_THRESHOLD_PX = 4
const isDragging = ref(false)
const direction = ref<1 | -1>(1)
const hasAsset = ref(true)
const lastInteraction = ref(Date.now())
const walkFrame = ref(0)
const transientUntil = ref(0)
const clickMoodPool = ref<PetMood[]>([])
const lastClickMood = ref<PetMood | null>(null)
const isStudyAltFrame = ref(false)
const speechText = ref('')
const codexStatus = ref<CodexPetStatus>('idle')
const codexMessage = ref('Codex 已就绪')
const codexDetail = ref('')

let sleepTimer = 0
let walkTimer = 0
let moodTimer = 0
let walkFrameTimer = 0
let walkStepTimer = 0
let walkEndTimer = 0
let studySwapTimer = 0
let speechTimer = 0
let speechHideTimer = 0
let unsubscribePetAction: (() => void) | undefined

const SPEECH_ALLOWED_MOODS = ['affection', 'happy', 'play', 'excited'] as const satisfies readonly PetMood[]
const CARE_MESSAGES = [
  '坐太久啦，起来走走吧。',
  '活动一下肩颈吧。',
  '喝口水，休息一下眼睛。',
  '站起来陪我动一动？',
] as const

const assetPath = computed(() => {
  if (!hasAsset.value) return ''
  if (mood.value === 'walk') return WALK_ASSET_PATHS[walkFrame.value]
  if (mood.value === 'study' && isStudyAltFrame.value) return STUDY_ALT_ASSET_PATH
  if (mood.value === 'work') return direction.value === -1 ? WORK_ALT_ASSET_PATH : PET_ASSET_PATHS.work
  return PET_ASSET_PATHS[mood.value] || FALLBACK_ASSET_PATH
})

const codexStatusLabel = computed(() => CODEX_STATUS_LABELS[codexStatus.value])

const codexPreviewVisible = computed(() => props.desktop && codexStatus.value !== 'idle')

const codexPreviewLines = computed(() =>
  codexDetail.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3),
)

const petStyle = computed(() => ({
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
  '--pet-direction': mood.value === 'sleep' || mood.value === 'work' ? 1 : direction.value,
}))

function isTransientActive() {
  return Date.now() < transientUntil.value
}

function isCodexDrivingMood() {
  return isPersistentCodexStatus(codexStatus.value)
}

function markInteraction() {
  lastInteraction.value = Date.now()
  if (mood.value === 'sleep') mood.value = 'idle'
}

function setMood(nextMood: PetMood, duration = TRANSIENT_FOR_MS) {
  mood.value = nextMood
  transientUntil.value = Date.now() + duration
  if (studySwapTimer) {
    window.clearTimeout(studySwapTimer)
    studySwapTimer = 0
  }
  isStudyAltFrame.value = false
  if (nextMood === 'study') {
    studySwapTimer = window.setTimeout(() => {
      if (mood.value === 'study') isStudyAltFrame.value = true
      studySwapTimer = 0
    }, 2000)
  }
  if (nextMood === 'walk') {
    walkFrame.value = 0
    startWalkFrameTimer()
  }
  else {
    clearWalkTimers()
    stopWalkFrameTimer()
  }
}

function performMoodAction(nextMood: PetMood) {
  markInteraction()
  setMood(nextMood)
}

function shuffleMoods(moods: PetMood[]) {
  const next = [...moods]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function nextClickMood() {
  if (clickMoodPool.value.length === 0) {
    clickMoodPool.value = shuffleMoods(['affection', 'happy', 'play', 'excited'])
    if (lastClickMood.value && clickMoodPool.value[0] === lastClickMood.value && clickMoodPool.value.length > 1) {
      ;[clickMoodPool.value[0], clickMoodPool.value[1]] = [clickMoodPool.value[1], clickMoodPool.value[0]]
    }
  }
  const nextMood = clickMoodPool.value.shift() ?? 'happy'
  lastClickMood.value = nextMood
  return nextMood
}

function onPetClick() {
  performMoodAction(nextClickMood())
}

function onPetHover() {
  // 悬停仅唤醒：只刷新交互时间并从 sleep 回到 idle，不触发安抚 mood。
  markInteraction()
}

function showSpeechBubble() {
  if (isCodexDrivingMood()) return
  if (isDragging.value || mood.value === 'sleep' || mood.value === 'walk') return
  if (!SPEECH_ALLOWED_MOODS.includes(mood.value as (typeof SPEECH_ALLOWED_MOODS)[number])) {
    const speechMood = SPEECH_ALLOWED_MOODS[Math.floor(Math.random() * SPEECH_ALLOWED_MOODS.length)]
    setMood(speechMood, 7000)
  }
  const nextMessage = CARE_MESSAGES[Math.floor(Math.random() * CARE_MESSAGES.length)]
  speechText.value = nextMessage
  if (speechHideTimer) window.clearTimeout(speechHideTimer)
  speechHideTimer = window.setTimeout(() => {
    const shouldWalkAfterSpeech = speechText.value === '站起来陪我动一动？'
    speechText.value = ''
    speechHideTimer = 0
    if (shouldWalkAfterSpeech && !isDragging.value && mood.value !== 'sleep' && mood.value !== 'walk') {
      triggerWalkAction()
    }
  }, 7000)
}

function beginDrag(event: PointerEvent) {
  markInteraction()
  isDragging.value = true
  setMood('carried', 60 * 60 * 1000)
  lastPointer.value = { x: event.screenX, y: event.screenY }
  dragOffset.value = {
    x: event.clientX - position.value.x,
    y: event.clientY - position.value.y,
  }
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return
  pointerDown.value = { x: event.clientX, y: event.clientY }
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    /* pointer capture is best effort */
  }
}

function drag(event: PointerEvent) {
  if (pointerDown.value && !isDragging.value) {
    const dx = event.clientX - pointerDown.value.x
    const dy = event.clientY - pointerDown.value.y
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      beginDrag(event)
    }
  }
  if (!isDragging.value) return
  if (props.desktop && window.ramPetWindow) {
    const delta = {
      x: event.screenX - lastPointer.value.x,
      y: event.screenY - lastPointer.value.y,
    }
    lastPointer.value = { x: event.screenX, y: event.screenY }
    if (Math.abs(delta.x) > 1) {
      // 水平拖动方向与面朝方向相反：往右拖则脸朝左（scaleX -1）
      direction.value = delta.x > 0 ? -1 : 1
    }
    void window.ramPetWindow.moveBy(delta)
    return
  }
  if (Math.abs(event.movementX) > 1) {
    direction.value = event.movementX > 0 ? -1 : 1
  }
  const nextX = event.clientX - dragOffset.value.x
  const nextY = event.clientY - dragOffset.value.y
  position.value = {
    x: Math.max(12, Math.min(window.innerWidth - 160, nextX)),
    y: Math.max(12, Math.min(window.innerHeight - 170, nextY)),
  }
}

function stopDrag(event: PointerEvent) {
  pointerDown.value = null
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  } catch {
    /* not capturing */
  }
  if (!isDragging.value) return
  isDragging.value = false
  transientUntil.value = 0
  mood.value = 'idle'
  clearWalkTimers()
  stopWalkFrameTimer()
}

function showContextMenu(event: MouseEvent) {
  if (!props.desktop || !window.ramPetWindow) return
  event.preventDefault()
  void window.ramPetWindow.showContextMenu()
}

function clearWalkTimers() {
  if (walkStepTimer) {
    window.clearInterval(walkStepTimer)
    walkStepTimer = 0
  }
  if (walkEndTimer) {
    window.clearTimeout(walkEndTimer)
    walkEndTimer = 0
  }
}

function startWalkFrameTimer() {
  if (walkFrameTimer) return
  walkFrameTimer = window.setInterval(() => {
    walkFrame.value = walkFrame.value === 0 ? 1 : 0
  }, 320)
}

function stopWalkFrameTimer() {
  if (walkFrameTimer) {
    window.clearInterval(walkFrameTimer)
    walkFrameTimer = 0
  }
  walkFrame.value = 0
}

function startDesktopWalk(dir: 1 | -1) {
  clearWalkTimers()
  walkStepTimer = window.setInterval(async () => {
    if (isDragging.value || mood.value !== 'walk' || !window.ramPetWindow) {
      clearWalkTimers()
      return
    }
    const applied = await window.ramPetWindow.moveBy({ x: WALK_STEP_PX * dir, y: 0 })
    if (applied && applied.x === 0) {
      // 撞到屏幕边缘：本次走路提前结束，并把方向反过来留给下一轮
      direction.value = dir === 1 ? -1 : 1
      clearWalkTimers()
      stopWalkFrameTimer()
      mood.value = 'idle'
      transientUntil.value = 0
      walkFrame.value = 0
    }
  }, WALK_STEP_INTERVAL_MS)
  walkEndTimer = window.setTimeout(() => {
    clearWalkTimers()
    stopWalkFrameTimer()
    mood.value = 'idle'
    transientUntil.value = 0
  }, WALK_DURATION_MS)
}

function moveRandomly() {
  if (isCodexDrivingMood()) return
  if (isDragging.value || isTransientActive() || mood.value === 'sleep') return

  // 70% 维持上次方向，30% 反向，避免左右横跳
  const keep = Math.random() < 0.7
  const nextDirection: 1 | -1 = keep ? direction.value : direction.value === 1 ? -1 : 1
  direction.value = nextDirection

  setMood('walk', WALK_DURATION_MS)

  if (props.desktop && window.ramPetWindow) {
    startDesktopWalk(nextDirection)
    return
  }

  const movement = Math.round(70 + Math.random() * 110)
  position.value = {
    ...position.value,
    x: Math.max(12, Math.min(window.innerWidth - 160, position.value.x + movement * nextDirection)),
  }
}

function triggerWalkAction() {
  markInteraction()
  const nextDirection: 1 | -1 = direction.value
  setMood('walk', WALK_DURATION_MS)
  if (props.desktop && window.ramPetWindow) {
    startDesktopWalk(nextDirection)
    return
  }
  const movement = Math.round(70 + Math.random() * 110)
  position.value = {
    ...position.value,
    x: Math.max(12, Math.min(window.innerWidth - 160, position.value.x + movement * nextDirection)),
  }
}

function chooseAmbientMood() {
  if (isCodexDrivingMood()) return
  if (isDragging.value || isTransientActive() || mood.value === 'sleep') return
  const nextMood = AMBIENT_MOODS[Math.floor(Math.random() * AMBIENT_MOODS.length)]
  if (nextMood === 'idle') mood.value = 'idle'
  else setMood(nextMood, AMBIENT_MOOD_DURATIONS[nextMood] ?? 2200)
}

function checkSleep() {
  if (isCodexDrivingMood()) return
  if (isDragging.value || isTransientActive()) return
  if (Date.now() - lastInteraction.value > SLEEP_AFTER_MS) {
    mood.value = 'sleep'
    clearWalkTimers()
  }
}

function onAssetError() {
  if (assetPath.value !== FALLBACK_ASSET_PATH) {
    mood.value = 'idle'
    stopWalkFrameTimer()
    clearWalkTimers()
    transientUntil.value = 0
    return
  }
  hasAsset.value = false
}

function handleCodexStatus(action: CodexStatusAction) {
  codexStatus.value = action.status
  codexMessage.value = action.message || `Codex ${CODEX_STATUS_LABELS[action.status]}`
  codexDetail.value = action.preview?.length ? action.preview.join('\n') : action.detail || ''
  markInteraction()

  if (action.status === 'idle') {
    transientUntil.value = 0
    mood.value = 'idle'
    speechText.value = ''
    codexDetail.value = ''
    return
  }

  clearWalkTimers()
  stopWalkFrameTimer()
  setMood(action.mood, isPersistentCodexStatus(action.status) ? 60 * 60 * 1000 : 6000)
  speechText.value = ''
}

function handlePetAction(action: PetAction) {
  if (action.type === 'codex-status') {
    handleCodexStatus(action)
    return
  }
  if (action.type !== 'mood') return
  if (action.mood === 'walk') {
    triggerWalkAction()
    return
  }
  if (!(action.mood in PET_ASSET_PATHS)) return
  performMoodAction(action.mood as PetMood)
}

watch(mood, (nextMood) => {
  if (nextMood !== 'sleep' && nextMood !== 'walk') return
  speechText.value = ''
  if (speechHideTimer) {
    window.clearTimeout(speechHideTimer)
    speechHideTimer = 0
  }
})

onMounted(() => {
  sleepTimer = window.setInterval(checkSleep, 1000)
  walkTimer = window.setInterval(moveRandomly, WALK_EVERY_MS)
  moodTimer = window.setInterval(chooseAmbientMood, AMBIENT_EVERY_MS)
  speechHideTimer = window.setTimeout(showSpeechBubble, 3000)
  speechTimer = window.setInterval(showSpeechBubble, 60000)

  unsubscribePetAction = window.ramPetWindow?.onAction(handlePetAction)
})

onUnmounted(() => {
  window.clearInterval(sleepTimer)
  window.clearInterval(walkTimer)
  window.clearInterval(moodTimer)
  window.clearInterval(speechTimer)
  window.clearTimeout(speechHideTimer)
  stopWalkFrameTimer()
  clearWalkTimers()
  if (studySwapTimer) {
    window.clearTimeout(studySwapTimer)
    studySwapTimer = 0
  }
  unsubscribePetAction?.()
})
</script>

<template>
  <div
    class="ram-pet"
    :class="[
      `is-${mood}`,
      { 'is-desktop': desktop, 'is-dragging': isDragging, 'is-missing-asset': !hasAsset },
    ]"
    :style="petStyle"
    role="button"
    tabindex="0"
    aria-label="中级阶段拉姆宠物"
    @click="onPetClick"
    @contextmenu="showContextMenu"
    @pointerenter="onPetHover"
    @pointerdown="startDrag"
    @pointermove="drag"
    @pointerup="stopDrag"
    @pointercancel="stopDrag"
  >
    <div
      v-if="codexPreviewVisible"
      class="codex-preview-bubble"
      :class="[`is-codex-${codexStatus}`, { 'has-preview-lines': codexPreviewLines.length }]"
      role="status"
      aria-live="polite"
    >
      <div class="codex-preview-heading">
        <span class="codex-preview-kicker">{{ codexStatusLabel }}</span>
        <span class="codex-preview-pulse" aria-hidden="true"></span>
      </div>
      <div class="codex-preview-message">{{ codexMessage }}</div>
      <ul v-if="codexPreviewLines.length" class="codex-preview-lines">
        <li v-for="line in codexPreviewLines" :key="line">{{ line }}</li>
      </ul>
    </div>
    <div v-else-if="speechText" class="speech-bubble" role="status" aria-live="polite">
      {{ speechText }}
    </div>
    <img v-if="hasAsset" class="ram-image" :src="assetPath" alt="" draggable="false" @error="onAssetError" />
    <div v-if="!hasAsset" class="asset-placeholder">
      <strong>等待拉姆素材</strong>
      <span>放入 src/assets/ram/idle.png</span>
    </div>
  </div>
</template>
