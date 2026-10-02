<script setup lang="ts">
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'

withDefaults(
  defineProps<{
    icon: IconName
    /** Короткая подпись под кнопкой; на телефоне скрыта */
    label: string
    /** Полное название действия для экранных чтецов и подсказки */
    hint?: string
    /** Подсветка: выключенный микрофон, открытая панель, идущий показ экрана */
    active?: boolean
    danger?: boolean
    disabled?: boolean
    badge?: number
  }>(),
  { hint: undefined, active: false, danger: false, disabled: false, badge: 0 },
)
</script>

<template>
  <button
    type="button"
    class="control"
    :class="{ 'control--active': active, 'control--danger': danger }"
    :disabled="disabled"
    :aria-label="hint ?? label"
    :title="hint ?? label"
  >
    <span class="control__circle">
      <BaseIcon :name="icon" />
      <span v-if="badge > 0" class="control__badge" aria-hidden="true">{{ badge }}</span>
    </span>
    <span class="control__label" aria-hidden="true">{{ label }}</span>
  </button>
</template>

<style scoped>
.control {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  width: 4.75rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-video-text);
  font: inherit;
  cursor: pointer;
}

.control:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.control__circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  background: var(--color-video-control);
  font-size: 1.125rem;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.control:hover:not(:disabled) .control__circle {
  background: var(--color-video-control-hover);
}

.control:focus-visible {
  outline: none;
}

.control:focus-visible .control__circle {
  outline: 2px solid var(--color-video-text);
  outline-offset: 2px;
}

.control--active .control__circle,
.control--active:hover:not(:disabled) .control__circle {
  background: var(--color-video-control-active);
  color: var(--color-video-control-active-text);
}

.control--danger .control__circle {
  background: var(--color-danger);
  color: var(--color-on-accent);
}

.control--danger:hover:not(:disabled) .control__circle {
  background: var(--color-danger-hover);
}

.control__label {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.control__badge {
  position: absolute;
  top: -0.125rem;
  right: -0.125rem;
  min-width: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--color-on-accent);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25rem;
}

@media (max-width: 40rem) {
  .control {
    flex: 0 1 3rem;
    width: auto;
    min-width: 2.5rem;
  }

  .control__circle {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }

  .control__label {
    display: none;
  }
}
</style>
