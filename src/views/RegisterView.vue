<script setup lang="ts">
import { useRouter } from 'vue-router'

import RegisterForm from '@/components/auth/RegisterForm.vue'
import BaseCard from '@/components/ui/BaseCard.vue'

const router = useRouter()
</script>

<template>
  <BaseCard title="Регистрация" subtitle="Создайте аккаунт за минуту">
    <RegisterForm @success="router.replace({ name: 'welcome' })" />
    <template #footer>
      Уже есть аккаунт? <RouterLink :to="{ name: 'login' }">Войти</RouterLink>
    </template>
  </BaseCard>
</template>
