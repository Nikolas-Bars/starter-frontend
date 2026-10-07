<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { usersApi } from '@/api/users'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { t } from '@/i18n'
import { useCallStore } from '@/stores/call'
import type { User } from '@/types/api'

const SEARCH_DELAY_MS = 300

const callStore = useCallStore()

const search = ref('')
const users = ref<User[]>([])
const page = ref(1)
const lastPage = ref(1)
const loading = ref(false)
const error = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0

async function load(nextPage: number): Promise<void> {
  const current = ++requestId
  loading.value = true
  error.value = ''

  try {
    const result = await usersApi.list(search.value, nextPage)
    if (current !== requestId) {
      return
    }
    users.value = nextPage === 1 ? result.items : [...users.value, ...result.items]
    page.value = result.meta.current_page
    lastPage.value = result.meta.last_page
  } catch {
    if (current === requestId) {
      error.value = t('calls.users.loadFailed')
    }
  } finally {
    if (current === requestId) {
      loading.value = false
    }
  }
}

watch(search, () => {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => void load(1), SEARCH_DELAY_MS)
})

onMounted(() => void load(1))

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
  }
})
</script>

<template>
  <section class="users">
    <h2 class="users__title">{{ t('calls.users.title') }}</h2>

    <BaseInput v-model="search" :label="t('calls.users.search')" />

    <FormAlert :message="error" />

    <ul v-if="users.length > 0" class="users__list">
      <li v-for="user in users" :key="user.id" class="users__item">
        <span
          class="users__presence"
          :class="{ 'users__presence--online': callStore.isUserOnline(user.id) }"
          :title="t(callStore.isUserOnline(user.id) ? 'presence.online' : 'presence.offline')"
          aria-hidden="true"
        />
        <div class="users__info">
          <span class="users__name">
            {{ user.name }}
            <span class="visually-hidden">
              —
              {{
                t(
                  callStore.isUserOnline(user.id)
                    ? 'presence.onlineLower'
                    : 'presence.offlineLower',
                )
              }}
            </span>
          </span>
          <span v-if="user.username" class="users__email">@{{ user.username }}</span>
        </div>
        <div class="users__actions">
          <BaseButton
            variant="ghost"
            class="users__call"
            icon="phone"
            :disabled="callStore.isBusy || !callStore.isOnline"
            :aria-label="t('calls.audioCallTo', { name: user.name })"
            :title="t('calls.audioCall')"
            @click="callStore.startCall(user, { video: false })"
          >
            <span class="users__label">{{ t('calls.users.voice') }}</span>
          </BaseButton>
          <BaseButton
            class="users__call"
            icon="video"
            :disabled="callStore.isBusy || !callStore.isOnline"
            :aria-label="t('calls.videoCallTo', { name: user.name })"
            :title="t('calls.videoCall')"
            @click="callStore.startCall(user)"
          >
            <span class="users__label">{{ t('calls.users.call') }}</span>
          </BaseButton>
        </div>
      </li>
    </ul>

    <p v-else-if="!loading && !error" class="users__empty">{{ t('common.nobodyFound') }}</p>

    <BaseButton v-if="page < lastPage" variant="ghost" :loading="loading" @click="load(page + 1)">
      {{ t('common.showMore') }}
    </BaseButton>
  </section>
</template>

<style scoped>
.users {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  container-type: inline-size;
}

.users__title {
  margin: 0;
  font-size: 1.125rem;
}

.users__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.users__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.users__presence {
  flex-shrink: 0;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--color-border);
}

.users__presence--online {
  background: var(--color-success);
}

.users__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.users__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.5rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.users__name {
  overflow-wrap: anywhere;
  font-weight: 600;
  line-height: 1.3;
}

.users__email {
  overflow: hidden;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.users__empty {
  margin: 0;
  color: var(--color-text-muted);
}

/* В узкой колонке остаются только иконки: подписи есть в aria-label и title */
@container (max-width: 30rem) {
  .users__item {
    padding: 0.625rem 0.75rem;
  }

  .users__label {
    display: none;
  }

  .users__actions .users__call {
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
  }
}
</style>
