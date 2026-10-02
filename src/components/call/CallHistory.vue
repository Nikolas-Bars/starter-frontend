<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { callsApi } from '@/api/calls'
import BaseButton from '@/components/ui/BaseButton.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import type { Call, User } from '@/types/api'
import { formatDateTime, formatDuration } from '@/utils/format'

const auth = useAuthStore()
const callStore = useCallStore()

const calls = ref<Call[]>([])
const page = ref(1)
const lastPage = ref(1)
const loading = ref(false)
const error = ref('')

let requestId = 0

async function load(nextPage: number): Promise<void> {
  const current = ++requestId
  loading.value = true
  error.value = ''

  try {
    const result = await callsApi.history(nextPage)
    if (current !== requestId) {
      return
    }
    calls.value = nextPage === 1 ? result.items : [...calls.value, ...result.items]
    page.value = result.meta.current_page
    lastPage.value = result.meta.last_page
  } catch {
    if (current === requestId) {
      error.value = 'Не удалось загрузить историю звонков.'
    }
  } finally {
    if (current === requestId) {
      loading.value = false
    }
  }
}

function isOutgoing(call: Call): boolean {
  return call.caller.id === auth.user?.id
}

function counterpart(call: Call): User {
  return isOutgoing(call) ? call.callee : call.caller
}

function summary(call: Call): string {
  if (call.duration_seconds !== null) {
    return formatDuration(call.duration_seconds)
  }

  const outgoing = isOutgoing(call)
  switch (call.status) {
    case 'ringing':
      return 'Вызов'
    case 'active':
      return 'Идёт разговор'
    case 'rejected':
      return outgoing ? 'Отклонён собеседником' : 'Отклонён'
    case 'missed':
      return outgoing ? 'Без ответа' : 'Пропущенный'
    case 'busy':
      return 'Собеседник был занят'
    case 'unavailable':
      return 'Собеседник был не в сети'
    case 'ended':
      return 'Завершён'
  }
}

function isMissedByMe(call: Call): boolean {
  return !isOutgoing(call) && call.status === 'missed'
}

watch(
  () => callStore.historyVersion,
  () => void load(1),
)

onMounted(() => void load(1))
</script>

<template>
  <section class="history">
    <h2 class="history__title">История звонков</h2>

    <FormAlert :message="error" />

    <ul v-if="calls.length > 0" class="history__list">
      <li v-for="call in calls" :key="call.id" class="history__item">
        <span
          class="history__direction"
          :class="{ 'history__direction--missed': isMissedByMe(call) }"
          :title="isOutgoing(call) ? 'Исходящий' : 'Входящий'"
          aria-hidden="true"
        >
          {{ isOutgoing(call) ? '↗' : '↙' }}
        </span>
        <div class="history__info">
          <span class="history__name">{{ counterpart(call).name }}</span>
          <span class="history__meta">
            <span class="visually-hidden">{{ isOutgoing(call) ? 'Исходящий' : 'Входящий' }},</span>
            {{ summary(call) }} · {{ formatDateTime(call.started_at) }}
          </span>
        </div>
        <BaseButton
          variant="ghost"
          :disabled="callStore.isBusy || !callStore.isOnline"
          :aria-label="`Перезвонить: ${counterpart(call).name}`"
          @click="callStore.startCall(counterpart(call))"
        >
          Перезвонить
        </BaseButton>
      </li>
    </ul>

    <p v-else-if="!loading && !error" class="history__empty">Звонков пока не было.</p>

    <BaseButton v-if="page < lastPage" variant="ghost" :loading="loading" @click="load(page + 1)">
      Показать ещё
    </BaseButton>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history__title {
  margin: 0;
  font-size: 1.125rem;
}

.history__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.history__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.history__direction {
  font-size: 1.25rem;
  color: var(--color-success);
}

.history__direction--missed {
  color: var(--color-danger);
}

.history__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.history__name {
  font-weight: 600;
}

.history__meta {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.history__empty {
  margin: 0;
  color: var(--color-text-muted);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
