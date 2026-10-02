<script setup lang="ts">
import { watch } from 'vue'

import CallWindow from '@/components/call/CallWindow.vue'
import IncomingCallModal from '@/components/call/IncomingCallModal.vue'
import { useCallAttention } from '@/composables/useCallAttention'
import { useCallSounds } from '@/composables/useCallSounds'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'

const auth = useAuthStore()
const callStore = useCallStore()

useCallSounds()
useCallAttention()

// Входящие звонки принимаем на любой странице, пока пользователь авторизован
watch(
  () => auth.token,
  (token) => {
    if (token === null) {
      callStore.disconnect()
    } else {
      callStore.connect(token)
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="layout">
    <RouterView />
  </main>
  <IncomingCallModal />
  <CallWindow />
</template>

<style scoped>
.layout {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
}
</style>
