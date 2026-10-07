<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { callLinkUrl, callLinksApi } from '@/api/callLinks'
import BaseButton from '@/components/ui/BaseButton.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { t } from '@/i18n'
import type { CallLink } from '@/types/api'

const COPIED_MS = 2000

const link = ref<CallLink | null>(null)
const error = ref('')
const rotating = ref(false)
const copied = ref(false)

const url = computed(() => (link.value === null ? '' : callLinkUrl(link.value.code)))
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

let copiedTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  try {
    link.value = await callLinksApi.own()
  } catch {
    error.value = t('callLinks.loadFailed')
  }
})

onBeforeUnmount(() => {
  if (copiedTimer !== null) {
    clearTimeout(copiedTimer)
  }
})

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(url.value)
  } catch {
    error.value = t('callLinks.copyFailed')
    return
  }
  copied.value = true
  if (copiedTimer !== null) {
    clearTimeout(copiedTimer)
  }
  copiedTimer = setTimeout(() => (copied.value = false), COPIED_MS)
}

async function share(): Promise<void> {
  // Пользователь закрыл системное меню «Поделиться» — это не ошибка
  await navigator.share({ title: t('callLinks.shareTitle'), url: url.value }).catch(() => undefined)
}

async function rotate(): Promise<void> {
  if (!window.confirm(t('callLinks.rotateConfirm'))) {
    return
  }
  rotating.value = true
  error.value = ''
  try {
    link.value = await callLinksApi.rotate()
  } catch {
    error.value = t('callLinks.rotateFailed')
  } finally {
    rotating.value = false
  }
}
</script>

<template>
  <section class="call-link" aria-labelledby="call-link-title">
    <div class="call-link__text">
      <h2 id="call-link-title" class="call-link__title">{{ t('callLinks.title') }}</h2>
      <p class="call-link__hint">{{ t('callLinks.hint') }}</p>
    </div>

    <FormAlert :message="error" />

    <template v-if="link">
      <p class="call-link__url" tabindex="0" :aria-label="t('callLinks.urlLabel')">{{ url }}</p>
      <div class="call-link__actions">
        <BaseButton v-if="canShare" icon="share" @click="share()">
          {{ t('callLinks.share') }}
        </BaseButton>
        <BaseButton :variant="canShare ? 'ghost' : 'primary'" icon="copy" @click="copy()">
          {{ t(copied ? 'callLinks.copied' : 'callLinks.copy') }}
        </BaseButton>
        <BaseButton variant="ghost" :loading="rotating" @click="rotate()">
          {{ t('callLinks.rotate') }}
        </BaseButton>
      </div>
      <p class="visually-hidden" role="status">{{ copied ? t('callLinks.copiedStatus') : '' }}</p>
    </template>
  </section>
</template>

<style scoped>
.call-link {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.call-link__title {
  margin: 0;
  font-size: 1rem;
}

.call-link__hint {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.call-link__url {
  width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  user-select: all;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
}

.call-link__url:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.call-link__actions {
  display: flex;
  flex-wrap: wrap;
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

@media (max-width: 40rem) {
  .call-link {
    padding: 1rem;
  }

  .call-link__actions > * {
    flex: 1 1 auto;
  }

  .call-link__url {
    font-size: 1rem;
  }
}
</style>
