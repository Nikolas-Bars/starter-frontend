<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { ApiError } from '@/api/http'
import { usersApi } from '@/api/users'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types/api'

const auth = useAuthStore()
const router = useRouter()
const { loading, message, fieldError, submit } = useFormSubmit()

const name = ref(auth.user?.name ?? '')
const username = ref(auth.user?.username ?? '')
const saved = ref(false)
const loggingOut = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
const avatarError = ref('')

async function changeAvatar(task: () => Promise<User>): Promise<void> {
  avatarBusy.value = true
  avatarError.value = ''
  try {
    auth.setUser(await task())
  } catch (error) {
    avatarError.value =
      error instanceof ApiError
        ? (Object.values(error.errors)[0]?.[0] ?? error.message)
        : 'Не удалось обновить аватарку.'
  } finally {
    avatarBusy.value = false
  }
}

function onAvatarPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file !== undefined) {
    void changeAvatar(() => usersApi.updateAvatar(file))
  }
}

function removeAvatar(): void {
  if (window.confirm('Убрать аватарку?')) {
    void changeAvatar(() => usersApi.deleteAvatar())
  }
}

async function save(): Promise<void> {
  saved.value = false
  saved.value = await submit(async () => {
    const user = await usersApi.updateProfile({ name: name.value, username: username.value })
    auth.setUser(user)
    name.value = user.name
    username.value = user.username ?? ''
  })
}

async function logout(): Promise<void> {
  loggingOut.value = true
  try {
    await auth.logout()
  } finally {
    loggingOut.value = false
    void router.replace({ name: 'login' })
  }
}
</script>

<template>
  <BaseCard title="Профиль" :subtitle="auth.user?.email ?? undefined">
    <div class="profile__avatar">
      <BaseAvatar :name="auth.user?.name ?? ''" :src="auth.user?.avatar_url" size="xl" />
      <div class="profile__avatar-actions">
        <BaseButton
          variant="ghost"
          icon="image"
          :loading="avatarBusy"
          @click="avatarInput?.click()"
        >
          {{ auth.user?.avatar_url ? 'Сменить фото' : 'Поставить фото' }}
        </BaseButton>
        <BaseButton
          v-if="auth.user?.avatar_url"
          variant="ghost"
          :disabled="avatarBusy"
          @click="removeAvatar"
        >
          Убрать
        </BaseButton>
      </div>
      <input
        ref="avatarInput"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
        hidden
        @change="onAvatarPicked"
      />
      <FormAlert :message="avatarError" />
    </div>
    <form class="profile" novalidate @submit.prevent="save">
      <BaseInput
        v-model="name"
        label="Имя"
        autocomplete="name"
        :error="fieldError('name')"
        required
      />
      <div class="profile__field">
        <BaseInput
          v-model="username"
          label="Ник"
          autocomplete="username"
          :error="fieldError('username')"
        />
        <p class="profile__hint">
          По нику вас найдут в поиске: латиница, цифры и _, от 3 до 32 символов.
        </p>
      </div>
      <FormAlert :message="message" />
      <p v-if="saved" class="profile__saved" role="status">Сохранено</p>
      <BaseButton type="submit" :loading="loading">Сохранить</BaseButton>
    </form>

    <template #footer>
      <div class="profile__footer">
        <RouterLink :to="{ name: 'chats' }" class="profile__back">
          <BaseIcon name="arrow-left" />
          К чатам
        </RouterLink>
        <BaseButton variant="ghost" icon="log-out" :loading="loggingOut" @click="logout">
          Выйти
        </BaseButton>
      </div>
    </template>
  </BaseCard>
</template>

<style scoped>
.profile__avatar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.profile__avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.profile__avatar :deep(.alert) {
  flex-basis: 100%;
}

.profile {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.profile__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.profile__saved {
  margin: 0;
  color: var(--color-success);
  font-weight: 500;
}

.profile__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.profile__back {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  text-decoration: none;
}

.profile__back:hover {
  text-decoration: underline;
}
</style>
