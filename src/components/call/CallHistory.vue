<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { callsApi } from '@/api/calls'
import BaseButton from '@/components/ui/BaseButton.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useAuthStore } from '@/stores/auth'
import { t } from '@/i18n'
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
      error.value = t('calls.history.loadFailed')
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
      return t('calls.history.ringing')
    case 'active':
      return t('calls.history.active')
    case 'rejected':
      return t(outgoing ? 'calls.history.rejectedByPeer' : 'calls.history.rejected')
    case 'missed':
      return t(outgoing ? 'calls.history.noAnswer' : 'calls.history.missed')
    case 'busy':
      return t('calls.history.busy')
    case 'unavailable':
      return t('calls.history.unavailable')
    case 'ended':
      return t('calls.history.ended')
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
    <h2 class="history__title">{{ t('calls.history.title') }}</h2>

    <FormAlert :message="error" />

    <ul v-if="calls.length > 0" class="history__list">
      <li v-for="call in calls" :key="call.id" class="history__item">
        <span
          class="history__direction"
          :class="{ 'history__direction--missed': isMissedByMe(call) }"
          :title="t(isOutgoing(call) ? 'calls.history.outgoing' : 'calls.history.incoming')"
          aria-hidden="true"
        >
          {{ isOutgoing(call) ? '↗' : '↙' }}
        </span>
        <div class="history__info">
          <span class="history__name">
            {{ counterpart(call).name }}
            <span v-if="counterpart(call).is_guest" class="history__guest">{{
              t('calls.guest')
            }}</span>
          </span>
          <span class="history__meta">
            <span class="visually-hidden"
              >{{
                t(isOutgoing(call) ? 'calls.history.outgoing' : 'calls.history.incoming')
              }},</span
            >
            {{ summary(call) }} · {{ formatDateTime(call.started_at) }}
          </span>
        </div>
        <BaseButton
          variant="ghost"
          class="history__call"
          icon="phone"
          :disabled="callStore.isBusy || !callStore.isOnline"
          :aria-label="t('calls.callBackTo', { name: counterpart(call).name })"
          :title="t('calls.callBack')"
          @click="callStore.startCall(counterpart(call))"
        >
          <span class="history__label">{{ t('calls.callBack') }}</span>
        </BaseButton>
      </li>
    </ul>

    <p v-else-if="!loading && !error" class="history__empty">{{ t('calls.history.empty') }}</p>

    <BaseButton v-if="page < lastPage" variant="ghost" :loading="loading" @click="load(page + 1)">
      {{ t('common.showMore') }}
    </BaseButton>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  container-type: inline-size;
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
  color: var(--color-danger-text);
}

.history__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.history__name {
  overflow-wrap: anywhere;
  font-weight: 600;
  line-height: 1.3;
}

.history__guest {
  margin-left: 0.25rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  vertical-align: 0.0625rem;
}

.history__meta {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.history__empty {
  margin: 0;
  color: var(--color-text-muted);
}

@container (max-width: 30rem) {
  .history__item {
    padding: 0.625rem 0.75rem;
  }

  .history__label {
    display: none;
  }

  .history__item .history__call {
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
  }
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
