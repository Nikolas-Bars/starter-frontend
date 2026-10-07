<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import BaseIcon from '@/components/ui/BaseIcon.vue'
import { t } from '@/i18n'
import { MAX_MESSAGE_LENGTH, type OutgoingFile } from '@/stores/chat'
import {
  formatFileSize,
  guessKind,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
} from '@/utils/chatAttachment'
import { formatDuration } from '@/utils/format'

const MAX_HEIGHT_PX = 160

/** Браузеры пишут звук в разных контейнерах: Chrome и Firefox — webm, Safari — mp4 */
const VOICE_TYPES = [
  { mime: 'audio/webm;codecs=opus', extension: 'webm' },
  { mime: 'audio/webm', extension: 'webm' },
  { mime: 'audio/mp4', extension: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
]

const props = defineProps<{
  chatId: number
  /** Редактируемое своё сообщение: поле ввода показывает его текст вместо черновика */
  editing: { id: number; body: string } | null
}>()

const emit = defineEmits<{
  send: [text: string, files: OutgoingFile[]]
  typing: []
  edit: [text: string]
  cancelEdit: []
}>()

/** Черновики живут, пока открыта вкладка: переключение между чатами их не теряет */
const drafts = new Map<number, string>()

interface Selected {
  file: File
  /** Картинка для превью в композере */
  preview: string | null
}

const text = ref('')
const field = ref<HTMLTextAreaElement | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const selected = ref<Selected[]>([])
const asFile = ref(false)
const error = ref('')

const recording = ref(false)
const recordedMs = ref(0)
let recorder: MediaRecorder | null = null
let recordStream: MediaStream | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
let recordStartedAt = 0
let recordChunks: Blob[] = []
let sendRecording = false

const hasMedia = computed(() =>
  selected.value.some(({ file }) => ['image', 'video'].includes(guessKind(file))),
)
const canSend = computed(() =>
  props.editing !== null
    ? text.value.trim() !== ''
    : text.value.trim() !== '' || selected.value.length > 0,
)

/** Черновик, отложенный на время редактирования, и чат, к которому он относится */
let editOrigin: { chatId: number; draft: string } | null = null
const canRecord = computed(
  () => typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined,
)

watch(
  () => props.chatId,
  (chatId, previous) => {
    if (previous !== undefined) {
      if (editOrigin?.chatId === previous) {
        drafts.set(previous, editOrigin.draft)
        editOrigin = null
      } else {
        drafts.set(previous, text.value)
      }
    }
    text.value = drafts.get(chatId) ?? ''
    clearFiles()
    cancelRecording()
    void nextTick(() => {
      resize()
      field.value?.focus({ preventScroll: true })
    })
  },
  { immediate: true },
)

watch(
  () => props.editing,
  (editing) => {
    if (editing !== null) {
      editOrigin ??= { chatId: props.chatId, draft: text.value }
      text.value = editing.body
    } else if (editOrigin !== null) {
      text.value = editOrigin.draft
      editOrigin = null
    }
    void nextTick(() => {
      resize()
      field.value?.focus({ preventScroll: true })
    })
  },
)

function resize(): void {
  const element = field.value
  if (element === null) {
    return
  }
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
}

/** Добавить файлы к сообщению: из выбора, вставки или перетаскивания */
function addFiles(files: File[]): void {
  error.value = ''
  for (const file of files) {
    if (selected.value.length >= MAX_FILES_PER_MESSAGE) {
      error.value = t('chats.attachments.tooMany', { count: MAX_FILES_PER_MESSAGE })
      break
    }
    if (file.size > MAX_FILE_BYTES) {
      error.value = t('chats.attachments.tooBig', {
        name: file.name,
        size: formatFileSize(MAX_FILE_BYTES),
      })
      continue
    }
    const preview =
      guessKind(file) === 'image' && file.type !== 'image/heic' && file.type !== 'image/heif'
        ? URL.createObjectURL(file)
        : null
    selected.value.push({ file, preview })
  }
  field.value?.focus({ preventScroll: true })
}

function removeFile(index: number): void {
  const [removed] = selected.value.splice(index, 1)
  if (removed?.preview) {
    URL.revokeObjectURL(removed.preview)
  }
  error.value = ''
}

function clearFiles(): void {
  selected.value.forEach(({ preview }) => preview && URL.revokeObjectURL(preview))
  selected.value = []
  asFile.value = false
  error.value = ''
}

function onPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles([...(input.files ?? [])])
  input.value = ''
}

function onPaste(event: ClipboardEvent): void {
  const files = [...(event.clipboardData?.files ?? [])]
  if (files.length > 0) {
    event.preventDefault()
    addFiles(files)
  }
}

function submit(): void {
  if (!canSend.value) {
    return
  }
  if (props.editing !== null) {
    emit('edit', text.value)
    return
  }
  const files: OutgoingFile[] = selected.value.map(({ file }) => ({
    file,
    name: file.name,
    asFile: asFile.value,
  }))
  emit('send', text.value, files)
  text.value = ''
  drafts.delete(props.chatId)
  clearFiles()
  void nextTick(resize)
}

function onInput(): void {
  resize()
  if (text.value.trim() !== '' && props.editing === null) {
    emit('typing')
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.editing !== null) {
    event.preventDefault()
    emit('cancelEdit')
    return
  }
  // Enter отправляет, Shift+Enter — новая строка; во время набора иероглифов Enter подтверждает ввод
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

async function startRecording(): Promise<void> {
  error.value = ''
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    error.value = t('chats.composer.noMicrophone')
    return
  }
  const type = VOICE_TYPES.find(({ mime }) => MediaRecorder.isTypeSupported(mime))
  recorder = new MediaRecorder(recordStream, type ? { mimeType: type.mime } : undefined)
  recordChunks = []
  sendRecording = false
  recorder.ondataavailable = (event) => recordChunks.push(event.data)
  recorder.onstop = () => finishRecording(type?.extension ?? 'webm')
  recorder.start()
  recordStartedAt = Date.now()
  recordedMs.value = 0
  recordTimer = setInterval(() => (recordedMs.value = Date.now() - recordStartedAt), 250)
  recording.value = true
}

function stopRecording(send: boolean): void {
  sendRecording = send
  recordedMs.value = Date.now() - recordStartedAt
  if (recorder?.state === 'recording') {
    recorder.stop()
  } else {
    finishRecording('webm')
  }
}

function finishRecording(extension: string): void {
  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }
  recordStream?.getTracks().forEach((track) => track.stop())
  recordStream = null
  const mime = recorder?.mimeType || 'audio/webm'
  recorder = null
  recording.value = false

  // Случайное касание — не голосовое
  if (sendRecording && recordedMs.value >= 700 && recordChunks.length > 0) {
    const blob = new Blob(recordChunks, { type: mime.split(';')[0] })
    emit('send', '', [
      { file: blob, name: `voice.${extension}`, voice: true, durationMs: recordedMs.value },
    ])
  }
  recordChunks = []
}

function cancelRecording(): void {
  if (recording.value) {
    stopRecording(false)
  }
}

onBeforeUnmount(() => {
  cancelRecording()
  selected.value.forEach(({ preview }) => preview && URL.revokeObjectURL(preview))
})

defineExpose({ addFiles })
</script>

<template>
  <div class="composer-wrap">
    <div v-if="editing" class="editing">
      <BaseIcon name="edit" class="editing__icon" />
      <span class="editing__text">
        <span class="editing__title">{{ t('chats.edit.title') }}</span>
        <span class="editing__body">{{ editing.body }}</span>
      </span>
      <button
        type="button"
        class="editing__close"
        :aria-label="t('chats.edit.cancel')"
        :title="t('chats.edit.cancelHint')"
        @click="emit('cancelEdit')"
      >
        <BaseIcon name="close" />
      </button>
    </div>
    <div v-else-if="selected.length > 0" class="tray">
      <div class="tray__items">
        <div v-for="(item, index) in selected" :key="index" class="tray__item">
          <img v-if="item.preview" class="tray__thumb" :src="item.preview" alt="" />
          <span v-else class="tray__thumb tray__thumb--icon">
            <BaseIcon :name="guessKind(item.file) === 'video' ? 'video' : 'file'" />
          </span>
          <span class="tray__name">{{ item.file.name }}</span>
          <button
            type="button"
            class="tray__remove"
            :aria-label="t('chats.attachments.remove', { name: item.file.name })"
            @click="removeFile(index)"
          >
            <BaseIcon name="close" />
          </button>
        </div>
      </div>
      <label v-if="hasMedia" class="tray__option">
        <input v-model="asFile" type="checkbox" />
        {{ t('chats.attachments.asFile') }}
      </label>
    </div>
    <p v-if="error" class="composer__error" role="alert">{{ error }}</p>

    <div v-if="recording" class="composer composer--recording">
      <button
        type="button"
        class="composer__icon"
        :aria-label="t('chats.composer.cancelRecording')"
        :title="t('common.cancel')"
        @click="stopRecording(false)"
      >
        <BaseIcon name="trash" />
      </button>
      <span class="recording">
        <span class="recording__dot" aria-hidden="true" />
        {{ t('chats.composer.recording', { duration: formatDuration(recordedMs / 1000) }) }}
      </span>
      <button
        type="button"
        class="composer__send"
        :aria-label="t('chats.composer.sendVoice')"
        :title="t('common.send')"
        @click="stopRecording(true)"
      >
        <BaseIcon name="send" />
      </button>
    </div>

    <form v-else class="composer" @submit.prevent="submit">
      <button
        v-if="!editing"
        type="button"
        class="composer__icon"
        :aria-label="t('chats.composer.attach')"
        :title="t('chats.composer.attach')"
        @click="picker?.click()"
      >
        <BaseIcon name="paperclip" />
      </button>
      <input ref="picker" type="file" multiple hidden @change="onPicked" />
      <textarea
        ref="field"
        v-model="text"
        class="composer__input"
        rows="1"
        :maxlength="MAX_MESSAGE_LENGTH"
        :placeholder="
          t(
            selected.length > 0 && !editing
              ? 'chats.composer.captionPlaceholder'
              : 'chats.composer.placeholder',
          )
        "
        :aria-label="t('chats.composer.label')"
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
      />
      <button
        v-if="editing"
        type="submit"
        class="composer__send"
        :disabled="!canSend"
        :aria-label="t('common.save')"
        :title="t('chats.edit.saveHint')"
      >
        <BaseIcon name="check" />
      </button>
      <button
        v-else-if="canSend || !canRecord"
        type="submit"
        class="composer__send"
        :disabled="!canSend"
        :aria-label="t('common.send')"
        :title="t('chats.composer.sendHint')"
      >
        <BaseIcon name="send" />
      </button>
      <button
        v-else
        type="button"
        class="composer__send"
        :aria-label="t('chats.composer.record')"
        :title="t('chats.composer.record')"
        @click="startRecording"
      >
        <BaseIcon name="mic" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.composer-wrap {
  border-top: 1px solid var(--color-border);
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.composer--recording {
  align-items: center;
}

.composer__input {
  flex: 1;
  min-height: 2.75rem;
  padding: 0.625rem 1rem;
  border: 1px solid transparent;
  border-radius: 1.375rem;
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  resize: none;
}

.composer__input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.composer__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}

.composer__icon:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.composer__send {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-accent);
  cursor: pointer;
}

.composer__send:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.composer__send:disabled {
  opacity: 0.5;
  cursor: default;
}

.composer__error {
  margin: 0.5rem 1rem 0;
  color: var(--color-danger-text);
  font-size: 0.8125rem;
}

.recording {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.recording__dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--color-danger-text);
  animation: pulse 1s ease-in-out infinite alternate;
}

@keyframes pulse {
  to {
    opacity: 0.3;
  }
}

.tray {
  padding: 0.75rem 1rem 0;
}

.editing {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem 0;
}

.editing__icon {
  flex-shrink: 0;
  color: var(--color-primary);
  font-size: 1.25rem;
}

.editing__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding-left: 0.75rem;
  border-left: 2px solid var(--color-primary);
}

.editing__title {
  color: var(--color-primary);
  font-size: 0.8125rem;
  font-weight: 600;
}

.editing__body {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editing__close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}

.editing__close:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.tray__items {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}

.tray__item {
  position: relative;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 0.25rem;
  width: 4.5rem;
}

.tray__thumb {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 0.5rem;
  object-fit: cover;
}

.tray__thumb--icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 1.5rem;
}

.tray__name {
  overflow: hidden;
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tray__remove {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgb(0 0 0 / 60%);
  color: #fff;
  font-size: 0.75rem;
  cursor: pointer;
}

.tray__option {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

@media (max-width: 40rem) {
  .composer {
    padding: 0.5rem 0.75rem;
  }
}
</style>
