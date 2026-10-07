<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { callLinksApi } from '@/api/callLinks'
import { ApiError } from '@/api/http'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { t } from '@/i18n'
import { DEFAULT_LOCALE } from '@/i18n/locale'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import type { CallLinkInvite, User } from '@/types/api'

/** Сколько ждать подключения к серверу звонков после входа гостем */
const SOCKET_WAIT_MS = 10000

const route = useRoute()
const auth = useAuthStore()
const callStore = useCallStore()
const { loading: joining, message, fieldError, submit } = useFormSubmit()

const code = computed(() => String(route.params.code))
const invite = ref<CallLinkInvite | null>(null)
const loading = ref(true)
const loadError = ref('')
const name = ref('')
const connecting = ref(false)
const callError = ref('')
const hasCalled = ref(false)

const owner = computed<User | null>(() =>
  invite.value === null
    ? null
    : {
        ...invite.value.owner,
        username: null,
        avatar_url: null,
        locale: DEFAULT_LOCALE,
        email: '',
        email_verified_at: null,
        created_at: null,
        is_guest: false,
      },
)

const isOwnLink = computed(() => auth.user !== null && auth.user.id === invite.value?.owner.id)

const presence = computed(() => {
  if (owner.value === null || !callStore.isOnline) {
    return null
  }
  return callStore.isUserOnline(owner.value.id)
    ? { online: true, text: t('callLinks.ownerOnline') }
    : { online: false, text: t('callLinks.ownerOffline') }
})

const showEnded = computed(() => hasCalled.value && callStore.phase === 'idle')

onMounted(async () => {
  if (auth.isGuest && auth.guestLinkCode !== code.value) {
    await auth.logout()
  }

  try {
    invite.value = await callLinksApi.show(code.value)
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : t('callLinks.openFailed')
  } finally {
    loading.value = false
  }
})

function waitForSocket(): Promise<boolean> {
  if (callStore.isOnline) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop()
      resolve(false)
    }, SOCKET_WAIT_MS)
    const stop = watch(
      () => callStore.isOnline,
      (online) => {
        if (online) {
          clearTimeout(timer)
          stop()
          resolve(true)
        }
      },
    )
  })
}

async function call(video: boolean): Promise<void> {
  if (owner.value === null || callStore.isBusy) {
    return
  }
  callError.value = ''

  if (!auth.isAuthenticated && !(await submit(() => auth.joinAsGuest(code.value, name.value)))) {
    return
  }

  connecting.value = true
  const ready = await waitForSocket()
  connecting.value = false

  if (!ready) {
    callError.value = t('callLinks.socketFailed')
    return
  }

  hasCalled.value = true
  await callStore.startCall(owner.value, { video })
}
</script>

<template>
  <BaseCard v-if="loading" :title="t('callLinks.opening')" />

  <BaseCard v-else-if="loadError || invite === null" :title="t('callLinks.broken')">
    <FormAlert :message="loadError" />
    <template #footer>
      <RouterLink :to="{ name: 'chats' }">{{ t('callLinks.toHome') }}</RouterLink>
    </template>
  </BaseCard>

  <BaseCard
    v-else-if="isOwnLink"
    :title="t('callLinks.ownTitle')"
    :subtitle="t('callLinks.ownText')"
  >
    <RouterLink class="link-call__primary" :to="{ name: 'calls' }">
      {{ t('callLinks.toCalls') }}
    </RouterLink>
  </BaseCard>

  <BaseCard v-else :title="invite.owner.name" :subtitle="t('callLinks.invites')">
    <form class="link-call" novalidate @submit.prevent="call(true)">
      <p
        v-if="presence"
        class="link-call__presence"
        :class="{ 'link-call__presence--online': presence.online }"
      >
        <span class="link-call__dot" aria-hidden="true" />
        {{ presence.text }}
      </p>

      <p v-if="showEnded" class="link-call__ended" role="status">
        {{ t('callLinks.ended') }}
      </p>

      <BaseInput
        v-if="!auth.isAuthenticated"
        v-model="name"
        :label="t('callLinks.nameLabel')"
        autocomplete="name"
        required
        :error="fieldError('name')"
      />
      <i18n-t v-else keypath="callLinks.callingAs" tag="p" class="link-call__me">
        <template #name>
          <strong>{{ auth.user?.name }}</strong>
        </template>
      </i18n-t>

      <FormAlert :message="message || callError" />

      <div class="link-call__actions">
        <BaseButton
          type="submit"
          icon="video"
          :loading="joining || connecting"
          :disabled="callStore.isBusy"
        >
          {{ t('callLinks.call') }}
        </BaseButton>
        <BaseButton
          variant="ghost"
          icon="phone"
          :disabled="joining || connecting || callStore.isBusy"
          @click="call(false)"
        >
          {{ t('callLinks.voiceOnly') }}
        </BaseButton>
      </div>

      <p class="link-call__hint">
        {{ t('callLinks.permissionsHint') }}
      </p>
    </form>

    <template #footer>
      <template v-if="auth.isGuest">
        {{ t('callLinks.wantOwnLink') }}
        <RouterLink :to="{ name: 'register' }">{{ t('callLinks.createAccount') }}</RouterLink>
      </template>
      <template v-else-if="!auth.isAuthenticated">
        {{ t('auth.haveAccount') }}
        <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
          {{ t('auth.loginLink') }}
        </RouterLink>
      </template>
    </template>
  </BaseCard>
</template>

<style scoped>
.link-call {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.link-call__presence {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: -0.75rem 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.link-call__dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-border);
}

.link-call__presence--online .link-call__dot {
  background: var(--color-success);
}

.link-call__ended {
  margin: 0;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius);
  background: var(--color-surface-muted);
  font-size: 0.875rem;
}

.link-call__me {
  margin: 0;
  color: var(--color-text-muted);
}

.link-call__me strong {
  color: var(--color-text);
}

.link-call__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.link-call__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.link-call__primary {
  display: block;
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius);
  background: var(--color-primary);
  color: var(--color-on-accent);
  text-align: center;
  text-decoration: none;
  font-weight: 600;
}

.link-call__primary:hover {
  background: var(--color-primary-hover);
}
</style>
