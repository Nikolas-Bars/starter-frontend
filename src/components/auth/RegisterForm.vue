<script setup lang="ts">
import { reactive } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
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
      label="Имя"
      autocomplete="name"
      required
      :error="fieldError('name')"
    />
    <BaseInput
      v-model="form.username"
      label="Ник"
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      required
      :error="fieldError('username')"
    />
    <p class="auth-form__hint">
      По нику вас найдут в поиске: латиница, цифры и _, от 3 до 32 символов.
    </p>
    <BaseInput
      v-model="form.email"
      label="Email"
      type="email"
      autocomplete="email"
      required
      :error="fieldError('email')"
    />
    <BaseInput
      v-model="form.password"
      label="Пароль"
      type="password"
      autocomplete="new-password"
      required
      :error="fieldError('password')"
    />
    <BaseInput
      v-model="form.password_confirmation"
      label="Повторите пароль"
      type="password"
      autocomplete="new-password"
      required
    />
    <p class="auth-form__hint">Минимум 8 символов: заглавные и строчные буквы и цифры.</p>

    <BaseButton type="submit" :loading="loading">Зарегистрироваться</BaseButton>
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
