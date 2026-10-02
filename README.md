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

Адрес API задаётся в `.env` (`VITE_API_URL`, по умолчанию `http://localhost:8090`), адрес
WebSocket-сервера звонков — `VITE_WS_URL` (по умолчанию `ws://localhost:8091`), порт фронта —
`WEB_PORT`. Без Docker: `npm install && npm run dev`.

## Видеозвонки

Страница `/calls`: список пользователей с поиском, кнопка «Позвонить» и история звонков. Звонки
1-на-1 идут напрямую между браузерами (WebRTC), бэкенд только передаёт служебные сообщения через
свой WebSocket-сервер. Сторонних пакетов и платных сервисов нет.

Проверить локально: откройте http://localhost:5190 и http://127.0.0.1:5190 (у разных адресов
разный `localStorage`, поэтому можно войти двумя пользователями), войдите как `ivan@example.com` и
`maria@example.com` (пароль `Password123`) и позвоните друг другу. Для второго адреса добавьте
`http://127.0.0.1:5190` в `CORS_ALLOWED_ORIGINS` бэкенда.

Камера и микрофон доступны браузеру только на `localhost` или по HTTPS — на сервере нужен HTTPS.

## Структура

```
src/
├── api/            # http.ts (fetch + Bearer + ApiError), auth.ts, users.ts, calls.ts, tokenStorage.ts
├── stores/         # auth.ts — пользователь и токен; call.ts — состояние звонка
├── router/         # маршруты и guard'ы: meta.requiresAuth / meta.guestOnly
├── realtime/       # socket.ts — WebSocket сигнализации с переподключением и ping
├── composables/    # useFormSubmit — формы; usePeerConnection — камера, микрофон, WebRTC
├── components/
│   ├── ui/         # BaseInput, BaseButton, BaseCard, FormAlert
│   ├── auth/       # LoginForm, RegisterForm
│   └── call/       # UserList, CallHistory, IncomingCallModal, CallWindow
├── views/          # LoginView, RegisterView, ChatsView, ProfileView, CallsView, CallLinkView
├── types/          # api.ts — ответы бэкенда; call.ts — протокол WebSocket-сообщений
├── utils/          # форматирование длительности и дат
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
