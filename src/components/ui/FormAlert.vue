<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <p v-if="message" class="alert" role="alert">{{ message }}</p>
</template>

<style scoped>
.alert {
  margin: 0;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius);
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
  font-size: 0.875rem;
}
</style>
