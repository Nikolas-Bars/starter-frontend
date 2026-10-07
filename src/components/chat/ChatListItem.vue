<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import { useChatStore } from '@/stores/chat'
import type { Chat } from '@/types/api'
import { messagePreview } from '@/utils/chatAttachment'
import { callSummary, isMissedCall } from '@/utils/chatCall'
import { formatChatTime } from '@/utils/format'

const props = defineProps<{
  chat: Chat
  active: boolean
}>()

const auth = useAuthStore()
const callStore = useCallStore()
const chatStore = useChatStore()

const name = computed(() => props.chat.peer?.name ?? t('chats.deletedUser'))
const lastMessage = computed(() => props.chat.last_message)
const mine = computed(() => lastMessage.value?.user_id === auth.user?.id)
const read = computed(
  () => lastMessage.value !== null && props.chat.peer_last_read_message_id >= lastMessage.value.id,
)
const online = computed(() =>
  props.chat.peer === null ? false : callStore.isUserOnline(props.chat.peer.id),
)
const typing = computed(() => chatStore.isTyping(props.chat.id))
const lastCall = computed(() => {
  const call = lastMessage.value?.call ?? null
  return call === null
    ? null
    : { text: callSummary(call, mine.value), missed: isMissedCall(call, mine.value) }
})
</script>

<template>
  <RouterLink
    class="item"
    :class="{ 'item--active': active }"
    :to="{ name: 'chat', params: { id: chat.id } }"
    :aria-current="active ? 'page' : undefined"
  >
    <BaseAvatar :name="name" :src="chat.peer?.avatar_url" :online="online" />
    <span class="item__body">
      <span class="item__top">
        <span class="item__name">{{ name }}</span>
        <span v-if="lastMessage?.created_at" class="item__time">
          <BaseIcon
            v-if="mine && !lastCall"
            class="item__tick"
            :class="{ 'item__tick--read': read }"
            :name="read ? 'check-double' : 'check'"
          />
          {{ formatChatTime(lastMessage.created_at) }}
        </span>
      </span>
      <span class="item__bottom">
        <span
          class="item__preview"
          :class="{
            'item__preview--accent': typing,
            'item__preview--missed': lastCall?.missed && !typing,
          }"
        >
          <template v-if="typing">{{ t('chats.typing') }}</template>
          <template v-else-if="lastCall">
            <BaseIcon name="phone" class="item__call-icon" />
            {{ lastCall.text }}
          </template>
          <template v-else-if="lastMessage">
            <span v-if="mine" class="item__you">{{ t('chats.you') }}</span>
            {{ messagePreview(lastMessage) }}
          </template>
          <template v-else>{{ t('chats.noMessages') }}</template>
        </span>
        <span
          v-if="chat.unread_count > 0"
          class="item__badge"
          :aria-label="t('chats.unread', { count: chat.unread_count })"
        >
          {{ chat.unread_count > 99 ? '99+' : chat.unread_count }}
        </span>
      </span>
    </span>
  </RouterLink>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius);
  color: inherit;
  font-weight: 400;
  text-decoration: none;
}

.item:hover {
  background: var(--color-surface-muted);
}

.item--active,
.item--active:hover {
  background: var(--color-primary-soft);
}

.item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.item__top,
.item__bottom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.item__name {
  flex: 1;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__time {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.item__tick {
  width: 0.875rem;
  height: 0.875rem;
}

.item__tick--read {
  color: var(--color-accent-text);
}

.item__preview {
  flex: 1;
  overflow: hidden;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__preview--accent {
  color: var(--color-primary);
}

.item__preview--missed {
  color: var(--color-danger-text);
}

.item__call-icon {
  width: 0.875rem;
  height: 0.875rem;
  vertical-align: -0.125em;
}

.item__you {
  color: var(--color-text);
}

.item__badge {
  flex-shrink: 0;
  min-width: 1.375rem;
  padding: 0.0625rem 0.4375rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-accent);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25rem;
  text-align: center;
}
</style>
