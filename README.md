# Starter Web

Заготовка фронтенда на Vue 3: регистрация, вход и приветственная страница для авторизованного
пользователя. Работает с [Starter API](../starter-backend).

Стек: Vue 3 (`<script setup>` + TypeScript), Vite, Vue Router, Pinia, Vitest, oxlint + ESLint, Prettier.

## Быстрый старт (macOS)

Сначала поднимите бэкенд (`make start` в `starter-backend`), затем:

```bash
make start
```

Откройте http://localhost:5190 и войдите как `admin@example.com` / `Password123`.

Адрес API задаётся в `.env` (`VITE_API_URL`, по умолчанию `http://localhost:8090`), порт фронта —
`WEB_PORT`. Без Docker: `npm install && npm run dev`.

## Структура

```
src/
├── api/            # http.ts (fetch + Bearer + ApiError), auth.ts (эндпоинты), tokenStorage.ts
├── stores/         # auth.ts — пользователь, токен, login/register/logout
├── router/         # маршруты и guard'ы: meta.requiresAuth / meta.guestOnly
├── composables/    # useFormSubmit — загрузка, общая ошибка, ошибки полей от бэкенда
├── components/
│   ├── ui/         # BaseInput, BaseButton, BaseCard, FormAlert
│   └── auth/       # LoginForm, RegisterForm
├── views/          # LoginView, RegisterView, WelcomeView
├── types/api.ts    # типы ответов бэкенда
└── __tests__/      # Vitest
```

Как это работает:

- Токен хранится в `localStorage` и добавляется в каждый запрос как `Authorization: Bearer ...`.
- Перед каждым переходом guard подгружает пользователя через `/api/auth/me`; если токен
  протух (401), он удаляется и пользователь попадает на `/login`.
- Ошибки валидации бэкенда (`errors.{field}`) показываются под соответствующими полями,
  общий текст ошибки — над формой.

## Команды

```bash
make start / make down  # поднять / остановить
make logs               # логи Vite
make test               # Vitest
make lint               # oxlint + eslint (с автоисправлением)
make type-check         # vue-tsc
make check              # lint + type-check + test
make install p=axios    # поставить пакет внутри контейнера
make build              # production-сборка в dist/
```
