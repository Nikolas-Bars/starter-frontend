import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Только для авторизованных */
    requiresAuth?: boolean
    /** Только для гостей: вошедшего пользователя уводим на главную */
    guestOnly?: boolean
    /**
     * Сюда пускаем гостя по ссылке для звонка. С любой другой страницы его вход
     * сбрасывается: он нужен только для одного звонка
     */
    allowLinkGuest?: boolean
    /** Страница занимает всю высоту окна (мессенджер), а не карточку по центру */
    fill?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'chats',
      component: () => import('@/views/ChatsView.vue'),
      meta: { requiresAuth: true, fill: true },
    },
    {
      path: '/chats/:id(\\d+)',
      name: 'chat',
      component: () => import('@/views/ChatsView.vue'),
      meta: { requiresAuth: true, fill: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/calls',
      name: 'calls',
      component: () => import('@/views/CallsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/c/:code',
      name: 'call-link',
      component: () => import('@/views/CallLinkView.vue'),
      meta: { allowLinkGuest: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  await auth.fetchUser().catch(() => undefined)

  if (auth.isGuest && !to.meta.allowLinkGuest) {
    await auth.logout()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'chats' }
  }

  return true
})

export default router
