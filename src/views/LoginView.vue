<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import LoginForm from '@/components/auth/LoginForm.vue'
import BaseCard from '@/components/ui/BaseCard.vue'

const route = useRoute()
const router = useRouter()

function onSuccess(): void {
  const redirect = route.query.redirect
  // Только относительный путь: иначе ?redirect= можно использовать для увода на чужой сайт
  const target =
    typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect
      : '/'

  void router.replace(target)
}
</script>

<template>
  <BaseCard title="Вход" subtitle="Рады видеть вас снова">
    <LoginForm @success="onSuccess" />
    <template #footer>
      Нет аккаунта? <RouterLink :to="{ name: 'register' }">Зарегистрироваться</RouterLink>
    </template>
  </BaseCard>
</template>
