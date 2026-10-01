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
    <BaseButton variant="ghost" :loading="loggingOut" @click="logout">Выйти</BaseButton>
  </BaseCard>
</template>
