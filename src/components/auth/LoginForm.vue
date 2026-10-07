<script setup lang="ts">
import { reactive } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ success: [] }>()

const auth = useAuthStore()
const { loading, message, fieldError, submit } = useFormSubmit()

const form = reactive({
  email: '',
  password: '',
})

async function onSubmit(): Promise<void> {
  if (await submit(() => auth.login(form))) {
    emit('success')
  }
}
</script>

<template>
  <form class="auth-form" novalidate @submit.prevent="onSubmit">
    <FormAlert :message="message" />

    <BaseInput
      v-model="form.email"
      :label="t('auth.email')"
      type="email"
      autocomplete="email"
      required
      :error="fieldError('email')"
    />
    <BaseInput
      v-model="form.password"
      :label="t('auth.password')"
      type="password"
      autocomplete="current-password"
      required
      :error="fieldError('password')"
    />

    <BaseButton type="submit" :loading="loading">{{ t('auth.loginAction') }}</BaseButton>
  </form>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
