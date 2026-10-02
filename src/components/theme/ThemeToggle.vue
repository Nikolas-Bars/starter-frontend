<script setup lang="ts">
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'
import { type ThemePreference, useThemeStore } from '@/stores/theme'

const theme = useThemeStore()

const options: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'Как в системе', icon: 'monitor' },
  { value: 'light', label: 'Светлая тема', icon: 'sun' },
  { value: 'dark', label: 'Тёмная тема', icon: 'moon' },
]
</script>

<template>
  <div class="theme" role="radiogroup" aria-label="Тема оформления">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="theme__option"
      :class="{ 'theme__option--active': theme.preference === option.value }"
      :aria-checked="theme.preference === option.value"
      :aria-label="option.label"
      :title="option.label"
      @click="theme.preference = option.value"
    >
      <BaseIcon :name="option.icon" />
    </button>
  </div>
</template>

<style scoped>
.theme {
  display: inline-flex;
  gap: 0.125rem;
  padding: 0.1875rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
}

.theme__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.theme__option:hover {
  color: var(--color-text);
}

.theme__option--active {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.theme__option:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
</style>
