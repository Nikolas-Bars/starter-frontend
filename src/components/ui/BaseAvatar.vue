<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { apiUrl } from '@/api/http'

const props = withDefaults(
  defineProps<{
    name: string
    /** Ссылка на аватарку от API; null — инициалы */
    src?: string | null
    /** undefined — статус не показываем */
    online?: boolean
    size?: 'md' | 'lg' | 'xl'
  }>(),
  { online: undefined, size: 'md', src: null },
)

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <span class="avatar" :class="`avatar--${size}`" aria-hidden="true">
    <img
      v-if="src && !failed"
      class="avatar__image"
      :src="apiUrl(src)"
      alt=""
      @error="failed = true"
    />
    <template v-else>{{ initials || '?' }}</template>
    <span
      v-if="online !== undefined"
      class="avatar__presence"
      :class="{ 'avatar__presence--online': online }"
    />
  </span>
</template>

<style scoped>
.avatar {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-accent-text);
  font-weight: 600;
  font-size: 1rem;
  user-select: none;
}

.avatar__image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar--lg {
  width: 4rem;
  height: 4rem;
  font-size: 1.375rem;
}

.avatar--xl {
  width: 6rem;
  height: 6rem;
  font-size: 2rem;
}

.avatar__presence {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-border);
}

.avatar__presence--online {
  background: var(--color-success);
}
</style>
