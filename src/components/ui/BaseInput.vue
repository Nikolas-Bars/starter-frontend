<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  type?: 'text' | 'email' | 'password'
  autocomplete?: string
  error?: string
  required?: boolean
}>()

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="field" :class="{ 'field--error': error }">
    <label class="field__label" :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      class="field__input"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :required="required"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${id}-error` : undefined"
    />
    <p v-if="error" :id="`${id}-error`" class="field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.field__input {
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.field__input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.field--error .field__input {
  border-color: var(--color-danger);
}

.field__error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-danger);
}
</style>
