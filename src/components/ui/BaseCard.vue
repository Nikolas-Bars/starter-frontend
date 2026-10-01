<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="card">
    <header class="card__header">
      <h1 class="card__title">{{ title }}</h1>
      <p v-if="subtitle" class="card__subtitle">{{ subtitle }}</p>
    </header>
    <slot />
    <footer v-if="$slots.footer" class="card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.card {
  width: 100%;
  max-width: 26rem;
  padding: 2rem;
  border-radius: calc(var(--radius) * 2);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.card__header {
  margin-bottom: 1.5rem;
}

.card__title {
  margin: 0;
  font-size: 1.5rem;
}

.card__subtitle {
  margin: 0.375rem 0 0;
  color: var(--color-text-muted);
}

.card__footer {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
</style>
