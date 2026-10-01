<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'button' | 'submit'
    variant?: 'primary' | 'ghost'
    loading?: boolean
  }>(),
  { type: 'button', variant: 'primary', loading: false },
)
</script>

<template>
  <button
    class="button"
    :class="`button--${variant}`"
    :type="type"
    :disabled="loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.15s,
    opacity 0.15s;
}

.button:disabled {
  opacity: 0.7;
  cursor: progress;
}

.button--primary {
  background: var(--color-primary);
  color: #fff;
}

.button--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.button--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text);
}

.button--ghost:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.button__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
