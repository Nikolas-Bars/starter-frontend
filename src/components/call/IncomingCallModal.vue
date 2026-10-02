<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'
import { useCallStore } from '@/stores/call'

const callStore = useCallStore()
</script>

<template>
  <Teleport to="body">
    <div v-if="callStore.phase === 'incoming'" class="overlay">
      <div
        class="incoming"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        aria-describedby="incoming-call-caller"
      >
        <span class="incoming__pulse" aria-hidden="true" />
        <h2 id="incoming-call-title" class="incoming__title">Входящий видеозвонок</h2>
        <p id="incoming-call-caller" class="incoming__caller">
          {{ callStore.counterpart?.name }}
          <span class="incoming__email">{{ callStore.counterpart?.email }}</span>
        </p>
        <div class="incoming__actions">
          <BaseButton variant="danger" @click="callStore.reject()">Отклонить</BaseButton>
          <BaseButton variant="success" @click="callStore.accept()">Принять</BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--color-overlay);
}

.incoming {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 22rem;
  padding: 2rem;
  border-radius: calc(var(--radius) * 2);
  background: var(--color-surface);
  box-shadow: var(--shadow);
  text-align: center;
}

.incoming__pulse {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--color-success);
  animation: pulse 1.2s ease-out infinite;
}

.incoming__title {
  margin: 0;
  font-size: 1.125rem;
}

.incoming__caller {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.incoming__email {
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.incoming__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 var(--color-success);
  }
  100% {
    box-shadow: 0 0 0 1.25rem transparent;
  }
}
</style>
