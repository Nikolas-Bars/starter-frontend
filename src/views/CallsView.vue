<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import CallHistory from '@/components/call/CallHistory.vue'
import CallLinkCard from '@/components/call/CallLinkCard.vue'
import UserList from '@/components/call/UserList.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useNotificationPermission } from '@/composables/useCallAttention'
import { useCallStore } from '@/stores/call'
import { useCallSettingsStore } from '@/stores/callSettings'

const callStore = useCallStore()
const settings = useCallSettingsStore()
const notifications = useNotificationPermission()

/** Сколько пропущенных было, когда пользователь открыл страницу: счётчик сбрасывается сразу */
const missedOnArrival = ref(0)

function markMissedSeen(): void {
  if (document.visibilityState !== 'visible' || callStore.missedCount === 0) {
    return
  }
  missedOnArrival.value = callStore.missedCount
  callStore.clearMissed()
}

onMounted(() => {
  markMissedSeen()
  document.addEventListener('visibilitychange', markMissedSeen)
  window.addEventListener('focus', markMissedSeen)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', markMissedSeen)
  window.removeEventListener('focus', markMissedSeen)
})

function missedText(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'пропущенный звонок'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'пропущенных звонка'
        : 'пропущенных звонков'
  return `У вас ${count} ${word}`
}

const connection = computed(() => {
  switch (callStore.socketStatus) {
    case 'open':
      return { text: 'Онлайн — вам могут позвонить', online: true }
    case 'unauthorized':
      return { text: 'Сессия истекла — войдите заново', online: false }
    default:
      return { text: 'Подключаемся к серверу звонков…', online: false }
  }
})
</script>

<template>
  <section class="calls">
    <header class="calls__header">
      <div>
        <h1 class="calls__title">Видеозвонки</h1>
        <p class="calls__status" :class="{ 'calls__status--online': connection.online }">
          <span class="calls__dot" aria-hidden="true" />
          {{ connection.text }}
        </p>
      </div>
      <RouterLink class="calls__back" :to="{ name: 'welcome' }">
        <BaseIcon name="arrow-left" />
        На главную
      </RouterLink>
    </header>

    <div class="calls__settings">
      <label class="calls__toggle">
        <input v-model="settings.ringtoneMuted" type="checkbox" />
        Входящие без звука
      </label>
      <button
        v-if="notifications.permission.value === 'default'"
        type="button"
        class="calls__link"
        @click="notifications.requestPermission()"
      >
        Уведомлять о звонках, когда вкладка в фоне
      </button>
      <span v-else-if="notifications.permission.value === 'denied'" class="calls__hint">
        Уведомления о звонках запрещены в настройках браузера
      </span>
    </div>

    <p v-if="missedOnArrival > 0" class="calls__missed" role="status">
      {{ missedText(missedOnArrival) }}
      <button type="button" class="calls__link" @click="missedOnArrival = 0">Понятно</button>
    </p>

    <div v-if="callStore.error" class="calls__error">
      <FormAlert :message="callStore.error" />
      <button type="button" class="calls__error-close" @click="callStore.clearError()">
        Скрыть
      </button>
    </div>

    <CallLinkCard />

    <div class="calls__columns">
      <UserList />
      <CallHistory />
    </div>
  </section>
</template>

<style scoped>
.calls {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 60rem;
  padding: 2rem;
  border-radius: calc(var(--radius) * 2);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.calls__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.calls__title {
  margin: 0;
  font-size: 1.5rem;
}

.calls__back {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
  padding-top: 0.25rem;
  font-size: 0.875rem;
  text-decoration: none;
  white-space: nowrap;
}

.calls__back:hover {
  text-decoration: underline;
}

.calls__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.375rem 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.calls__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-border);
}

.calls__status--online .calls__dot {
  background: var(--color-success);
}

.calls__settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
  font-size: 0.875rem;
}

.calls__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.calls__link {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent-text);
  font: inherit;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}

.calls__link:hover {
  text-decoration: underline;
}

.calls__hint {
  color: var(--color-text-muted);
}

.calls__missed {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
  font-weight: 600;
}

.calls__error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.calls__error > :first-child {
  flex: 1;
}

.calls__error-close {
  border: none;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.calls__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: 2rem;
  align-items: start;
}

@media (max-width: 40rem) {
  .calls {
    gap: 1.25rem;
    padding: 1.25rem 1rem;
  }

  .calls__title {
    font-size: 1.375rem;
  }

  .calls__settings {
    flex-direction: column;
    align-items: flex-start;
  }

  .calls__missed {
    justify-content: space-between;
  }
}
</style>
