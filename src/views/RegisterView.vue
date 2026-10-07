<script setup lang="ts">
import { useRouter } from 'vue-router'

import RegisterForm from '@/components/auth/RegisterForm.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { t } from '@/i18n'

const router = useRouter()
</script>

<template>
  <BaseCard :title="t('auth.registerTitle')" :subtitle="t('auth.registerSubtitle')">
    <RegisterForm @success="router.replace({ name: 'chats' })" />
    <template #footer>
      {{ t('auth.haveAccount') }}
      <RouterLink :to="{ name: 'login' }">{{ t('auth.loginLink') }}</RouterLink>
    </template>
  </BaseCard>
</template>
