<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import CallHistory from '@/components/call/CallHistory.vue'
import UserList from '@/components/call/UserList.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useCallStore } from '@/stores/call'

const callStore = useCallStore()

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
      <RouterLink :to="{ name: 'welcome' }">На главную</RouterLink>
    </header>

    <div v-if="callStore.error" class="calls__error">
      <FormAlert :message="callStore.error" />
      <button type="button" class="calls__error-close" @click="callStore.clearError()">
        Скрыть
      </button>
    </div>

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
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 2rem;
  align-items: start;
}
</style>
