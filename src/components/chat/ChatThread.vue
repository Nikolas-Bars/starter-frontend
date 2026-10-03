<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatFolderMenu from '@/components/chat/ChatFolderMenu.vue'
import ChatMessageBubble from '@/components/chat/ChatMessageBubble.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import { useChatStore, type OutgoingFile, type ThreadMessage } from '@/stores/chat'
import { dayKey, formatDay } from '@/utils/format'

/** Ближе к низу, чем на столько пикселей, — считаем, что пользователь читает последние сообщения */
const STICK_TO_BOTTOM_PX = 120

/** Ближе к верху — догружаем сообщения постарше */
const LOAD_OLDER_PX = 200

const props = defineProps<{ chatId: number }>()

const auth = useAuthStore()
const callStore = useCallStore()
const chatStore = useChatStore()

const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)
/** Над перепиской держат перетаскиваемые файлы: счётчик, потому что dragenter/dragleave приходят и от дочерних элементов */
const dragDepth = ref(0)
const atBottom = ref(true)

const chat = computed(() => chatStore.chats[props.chatId])
const thread = computed(() => chatStore.threads[props.chatId])
const messages = computed(() => thread.value?.messages ?? [])
const peer = computed(() => chat.value?.peer ?? null)
const peerOnline = computed(() => (peer.value ? callStore.isUserOnline(peer.value.id) : false))

const groups = computed(() => {
  const result: { key: string; label: string; messages: ThreadMessage[] }[] = []
  for (const message of messages.value) {
    const created = message.created_at ?? new Date().toISOString()
    const key = dayKey(created)
    const last = result.at(-1)
    if (last?.key === key) {
      last.messages.push(message)
    } else {
      result.push({ key, label: formatDay(created), messages: [message] })
    }
  }
  return result
})

const peerTyping = computed(() => chatStore.isTyping(props.chatId))

const status = computed(() => {
  if (peerTyping.value) {
    return 'печатает…'
  }
  if (peerOnline.value) {
    return 'в сети'
  }
  return peer.value?.username ? `@${peer.value.username}` : 'не в сети'
})

const canCall = computed(() => peer.value !== null && !callStore.isBusy && callStore.isOnline)

function isMine(message: ThreadMessage): boolean {
  return message.user_id === auth.user?.id
}

function isRead(message: ThreadMessage): boolean {
  return message.id > 0 && (chat.value?.peer_last_read_message_id ?? 0) >= message.id
}

function scrollToBottom(): void {
  const element = scroller.value
  if (element !== null) {
    element.scrollTop = element.scrollHeight
  }
}

function onScroll(): void {
  const element = scroller.value
  if (element === null) {
    return
  }
  atBottom.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX
  if (element.scrollTop < LOAD_OLDER_PX) {
    void loadOlder()
  }
  markReadIfVisible()
}

async function loadOlder(): Promise<void> {
  const element = scroller.value
  if (element === null || !thread.value?.hasMore || thread.value.loading) {
    return
  }
  // Сохраняем положение: новые сообщения добавятся сверху и не должны сдвигать то, что читают
  const fromBottom = element.scrollHeight - element.scrollTop
  await chatStore.loadOlder(props.chatId)
  await nextTick()
  element.scrollTop = element.scrollHeight - fromBottom
}

function markReadIfVisible(): void {
  if (document.visibilityState === 'visible' && document.hasFocus() && atBottom.value) {
    void chatStore.markRead(props.chatId)
  }
}

function markReadOnInteraction(): void {
  if (atBottom.value) {
    void chatStore.markRead(props.chatId)
  }
}

function send(text: string, files: OutgoingFile[]): void {
  if (chatStore.send(props.chatId, text, files)) {
    atBottom.value = true
  }
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

function onDragEnter(event: DragEvent): void {
  if (hasFiles(event) && peer.value) {
    dragDepth.value += 1
  }
}

function onDragLeave(event: DragEvent): void {
  if (hasFiles(event) && dragDepth.value > 0) {
    dragDepth.value -= 1
  }
}

function onDrop(event: DragEvent): void {
  dragDepth.value = 0
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length > 0) {
    composer.value?.addFiles(files)
  }
}

function callBack(): void {
  if (peer.value !== null && canCall.value) {
    void callStore.startCall(peer.value, { video: false })
  }
}

watch(
  () => props.chatId,
  async (chatId) => {
    chatStore.setActive(chatId)
    atBottom.value = true
    await chatStore.ensureChat(chatId)
    await chatStore.loadThread(chatId)
    await nextTick()
    scrollToBottom()
    if (document.visibilityState === 'visible') {
      markReadOnInteraction()
    }
  },
  { immediate: true },
)

watch(
  () => messages.value.length,
  async () => {
    if (!atBottom.value) {
      return
    }
    await nextTick()
    scrollToBottom()
    markReadIfVisible()
  },
)

onMounted(() => {
  document.addEventListener('visibilitychange', markReadIfVisible)
  window.addEventListener('focus', markReadIfVisible)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', markReadIfVisible)
  window.removeEventListener('focus', markReadIfVisible)
  chatStore.setActive(null)
})
</script>

<template>
  <section
    class="thread"
    :aria-label="peer ? `Переписка с ${peer.name}` : 'Переписка'"
    @pointerdown="markReadOnInteraction"
    @keydown="markReadOnInteraction"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div v-if="dragDepth > 0" class="thread__drop" aria-hidden="true">
      Отпустите, чтобы прикрепить
    </div>
    <header class="thread__header">
      <RouterLink class="thread__back" :to="{ name: 'chats' }" aria-label="К списку чатов">
        <BaseIcon name="arrow-left" />
      </RouterLink>
      <template v-if="peer">
        <BaseAvatar :name="peer.name" :online="peerOnline" />
        <div class="thread__who">
          <span class="thread__name">{{ peer.name }}</span>
          <span
            class="thread__status"
            :class="{ 'thread__status--online': peerOnline || peerTyping }"
          >
            {{ status }}
          </span>
        </div>
        <div class="thread__actions">
          <ChatFolderMenu :chat-id="chatId" />
          <BaseButton
            variant="ghost"
            icon="phone"
            class="thread__call"
            :disabled="!canCall"
            :aria-label="`Позвонить без видео: ${peer.name}`"
            title="Позвонить без видео"
            @click="callStore.startCall(peer, { video: false })"
          />
          <BaseButton
            variant="ghost"
            icon="video"
            class="thread__call"
            :disabled="!canCall"
            :aria-label="`Видеозвонок: ${peer.name}`"
            title="Видеозвонок"
            @click="callStore.startCall(peer)"
          />
        </div>
      </template>
      <span v-else-if="chatStore.listLoaded || thread?.loaded" class="thread__name">
        Чат не найден
      </span>
    </header>

    <div ref="scroller" class="thread__scroller" @scroll.passive="onScroll">
      <div class="thread__messages">
        <p v-if="thread?.loading && messages.length === 0" class="thread__hint">Загружаем…</p>
        <FormAlert v-if="thread?.error" :message="thread.error" />
        <p v-if="thread?.loaded && messages.length === 0" class="thread__hint">
          Сообщений пока нет. Напишите первым!
        </p>
        <p v-if="thread?.loading && messages.length > 0" class="thread__hint">
          Загружаем сообщения постарше…
        </p>

        <template v-for="group in groups" :key="group.key">
          <p class="thread__day">
            <span>{{ group.label }}</span>
          </p>
          <ChatMessageBubble
            v-for="message in group.messages"
            :key="message.client_id"
            :message="message"
            :mine="isMine(message)"
            :read="isRead(message)"
            :my-id="auth.user?.id ?? null"
            @retry="chatStore.retry(chatId, message.client_id)"
            @react="(emoji) => chatStore.react(chatId, message.id, emoji)"
            @call-back="callBack"
          />
        </template>
      </div>
    </div>

    <ChatComposer
      v-if="peer"
      ref="composer"
      :chat-id="chatId"
      @send="send"
      @typing="chatStore.notifyTyping(chatId)"
    />
  </section>
</template>

<style scoped>
.thread {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.thread__drop {
  position: absolute;
  inset: 0.5rem;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--color-primary);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
  color: var(--color-primary);
  font-weight: 600;
  pointer-events: none;
}

.thread__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.thread__back {
  display: none;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  margin-left: -0.5rem;
  border-radius: 50%;
  color: var(--color-text);
}

.thread__back:hover {
  background: var(--color-surface-muted);
}

.thread__who {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.thread__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread__status {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.thread__status--online {
  color: var(--color-success);
}

.thread__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.25rem;
}

.thread__actions .thread__call {
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border-color: transparent;
}

.thread__scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.thread__messages {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.25rem;
  min-height: 100%;
  padding: 1rem;
}

.thread__hint {
  margin: auto 0;
  color: var(--color-text-muted);
  text-align: center;
}

.thread__day {
  position: sticky;
  top: 0.5rem;
  z-index: 1;
  display: flex;
  justify-content: center;
  margin: 0.75rem 0 0.5rem;
  font-size: 0.75rem;
  pointer-events: none;
}

.thread__day span {
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  box-shadow: 0 1px 3px var(--color-shadow);
}

@media (max-width: 40rem) {
  .thread__header {
    padding: 0.5rem 0.75rem;
  }

  .thread__back {
    display: inline-flex;
  }

  .thread__messages {
    padding: 0.75rem;
  }
}
</style>
