# Kolyansburg Web

Веб-версия семейного мессенджера Kolyansburg — https://call-yansburg.com. Работает с
[Kolyansburg API](../starter-backend); Android-приложение — [starter-mobile](../starter-mobile).

Что умеет: вход и регистрация, профиль с ником и аватаркой, поиск людей по нику, чаты с папками, реакциями, копированием,
пересылкой, правкой и удалением сообщений,
«прочитано» и «печатает…», фото, видео, голосовые и файлы в чатах, видеозвонки 1:1 с историей и
демонстрацией экрана, личная ссылка для звонка и вход гостем, светлая и тёмная тема.

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

## Файлы в чатах

Скрепка в поле ввода, перетаскивание в переписку или вставка из буфера — до 10 файлов по 50 МБ в
одном сообщении, подпись необязательна. Кнопка микрофона записывает голосовое. Фото и видео сервер
сжимает (галочка «Без сжатия (отправить файлом)»); пока идёт сжатие, в сообщении «Сжимаем…»,
готовое приходит событием `chat.attachment`. Каждый файл загружается отдельно с прогрессом
(`api/attachments.ts`, `XMLHttpRequest`), уже загруженные при повторе не отправляются заново.

## Название и иконка

Название — `<title>` в `index.html`. Иконка: `public/favicon.svg` (исходник знака: башня-облачко,
цвета `#1C1A2F` и `#F1A23B`), `public/favicon.ico` (16–64 px) и `public/apple-touch-icon.png`
(180 px, домашний экран iPhone). Иконки Android-приложения сделаны из того же знака
(`starter-mobile/assets`).

## Структура

```
src/
├── api/            # http.ts (fetch + Bearer + ApiError), auth, users, chats, attachments, calls, callLinks
├── stores/         # auth, chat (чаты и переписки), chatFolders, call (звонок), callSettings, theme
├── router/         # маршруты и guard'ы: meta.requiresAuth / meta.guestOnly
├── realtime/       # socket.ts — WebSocket с переподключением и ping; callSounds.ts — звуки звонка
├── composables/    # useFormSubmit, usePeerConnection (WebRTC), useCallSounds, useCallAttention, useWakeLock
├── components/
│   ├── ui/         # BaseInput, BaseButton, BaseCard, BaseAvatar, BaseIcon, FormAlert
│   ├── auth/       # LoginForm, RegisterForm
│   ├── chat/       # ChatSidebar, ChatThread, ChatComposer, ChatMessageBubble, ChatAttachments, ChatVoicePlayer, папки
│   ├── call/       # UserList, CallHistory, IncomingCallModal, CallWindow, CallChat, CallLinkCard
│   └── theme/      # ThemeToggle
├── views/          # LoginView, RegisterView, ChatsView, ProfileView, CallsView, CallLinkView
├── types/          # api.ts — ответы бэкенда; call.ts — протокол WebSocket-сообщений
├── utils/          # format.ts — даты и длительности; chatCall.ts, chatAttachment.ts — подписи в чате
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
