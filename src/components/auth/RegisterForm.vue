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
  name: '',
  username: '',
  email: '',
  password: '',
  password_confirmation: '',
})

async function onSubmit(): Promise<void> {
  if (await submit(() => auth.register(form))) {
    emit('success')
  }
}
</script>

<template>
  <form class="auth-form" novalidate @submit.prevent="onSubmit">
    <FormAlert :message="message" />

    <BaseInput
      v-model="form.name"
      :label="t('auth.name')"
      autocomplete="name"
      required
      :error="fieldError('name')"
    />
    <BaseInput
      v-model="form.username"
      :label="t('auth.username')"
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      required
      :error="fieldError('username')"
    />
    <p class="auth-form__hint">{{ t('auth.usernameHint') }}</p>
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
      autocomplete="new-password"
      required
      :error="fieldError('password')"
    />
    <BaseInput
      v-model="form.password_confirmation"
      :label="t('auth.passwordConfirmation')"
      type="password"
      autocomplete="new-password"
      required
    />
    <p class="auth-form__hint">{{ t('auth.passwordHint') }}</p>

    <BaseButton type="submit" :loading="loading">{{ t('auth.registerAction') }}</BaseButton>
  </form>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-form__hint {
  margin: -0.5rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
</style>
