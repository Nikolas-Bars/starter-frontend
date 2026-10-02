<script setup lang="ts">
import { watch } from 'vue'

import CallWindow from '@/components/call/CallWindow.vue'
import IncomingCallModal from '@/components/call/IncomingCallModal.vue'
import ThemeToggle from '@/components/theme/ThemeToggle.vue'
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
  <div class="app">
    <header class="app__bar">
      <ThemeToggle />
    </header>
    <main class="layout">
      <RouterView />
    </main>
  </div>
  <IncomingCallModal />
  <CallWindow />
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.app__bar {
  display: flex;
  justify-content: flex-end;
  padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0;
}

.layout {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

@media (max-width: 40rem) {
  .app__bar {
    padding-inline: 0.75rem;
  }

  .layout {
    align-items: flex-start;
    padding: 0.75rem 0.75rem 1.5rem;
  }
}
</style>
