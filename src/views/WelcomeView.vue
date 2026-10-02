<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const loggingOut = ref(false)

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
  <BaseCard :title="`Добро пожаловать, ${auth.user?.name ?? ''}!`" :subtitle="auth.user?.email">
    <div class="actions">
      <RouterLink class="actions__link" :to="{ name: 'calls' }">Видеозвонки</RouterLink>
      <BaseButton variant="ghost" :loading="loggingOut" @click="logout">Выйти</BaseButton>
    </div>
  </BaseCard>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.actions__link {
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius);
  background: var(--color-primary);
  color: var(--color-on-accent);
  text-align: center;
  text-decoration: none;
  font-weight: 600;
}

.actions__link:hover {
  background: var(--color-primary-hover);
}
</style>
