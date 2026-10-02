# Starter Web

Vue 3 + Vite + TypeScript SPA for the Starter API (`../starter-backend`). Router, Pinia, Vitest,
oxlint + ESLint, Prettier (no semicolons, single quotes, width 100).

## Conventions

- Components: `<script setup lang="ts">`, typed `defineProps`/`defineEmits`/`defineModel`, scoped styles.
- Shared UI lives in `src/components/ui/Base*.vue`; feature components in `src/components/{feature}/`;
  route pages in `src/views/*View.vue` (lazy-loaded in the router).
- All HTTP goes through `src/api/http.ts` (`http.get/post`); one file per backend module in `src/api/`.
  The backend always answers `{status, message, data, errors}` — `request()` returns `data` or throws
  `ApiError(message, status, errors)`.
- Backend response types live in `src/types/api.ts` and mirror the API resources.
- Form submission state goes through `useFormSubmit()`; show `fieldError('field')` under inputs and
  `message` in `FormAlert`.
- Auth state only in `useAuthStore`; access rules via route `meta.requiresAuth` / `meta.guestOnly`.
- Video calls: `useCallStore` is the only owner of call state. It drives `SignalingSocket`
  (`src/realtime/socket.ts`, protocol types in `src/types/call.ts` mirror the backend `MessageRouter`)
  and `usePeerConnection()` (WebRTC). `IncomingCallModal` and `CallWindow` are mounted globally in
  `App.vue`, which connects the socket whenever an auth token exists. The socket never puts the
  access token in its URL: before every (re)connect it trades it for a one-time ticket
  (`POST /api/calls/ws-ticket`).
- The peer connection always negotiates an audio and a video transceiver plus an `app` DataChannel,
  so camera, device switching and screen sharing work mid-call via `replaceTrack` without
  renegotiation. Over the DataChannel peers exchange `PeerMessage`s: media state (mic/camera/screen)
  and chat. Only the caller restarts ICE; during an active call the store waits
  `RECONNECT_GRACE_MS` for the network or the signaling socket (`call.resume`) before hanging up.
- Side effects of the call phase live in composables mounted in `App.vue`: `useCallSounds()`
  (ringtone/ringback/hang-up beeps synthesized by `CallSounds`, `src/realtime/callSounds.ts`) and
  `useCallAttention()` (blinking tab title, missed-call badge, system notification in background).
  User preferences (silent ringtone, chosen devices) are persisted by `useCallSettingsStore`.
- Messenger: the home route `/` (and `/chats/:id`) is `ChatsView` — `ChatSidebar` (chat list +
  user search by name/email/`@username`) and `ChatThread`. `useChatStore` owns chats and threads;
  it reuses the call socket via `callStore.onServerMessage()` (`chat.message`, `chat.read`, reload
  on `ready`). Sends are optimistic: a pending message (`id: 0`, `pending`) keyed by a UUID
  `client_id` that the backend dedupes, so retries are safe. Read state is a per-member cursor
  (`last_read_message_id`); the thread marks read when opened, on interaction, or on a new message
  while the window is visible and focused. Guests have no chats. Full-height pages set
  `meta.fill`.
- Reactions: one per user per message from the fixed `REACTIONS` set (mirrors the backend
  `ChatReactionEnum`). `chatStore.react()` toggles optimistically and rolls back on error; while a
  request for a message is in flight, `chat.reaction` events for it are ignored so a stale echo
  can't undo the newer choice.
- Folders (`useChatFoldersStore`) are private to the user: tabs above the list, the folder menu
  in the thread header, the manager `<dialog>` (`managerOpen`). A folder tab pages through
  `GET chats?folder_id=` into the shared `chatStore.chats`; the unread badge is counted locally
  once all of the folder's chats are known, otherwise the server's `unread_chats_count` is used.
  `chat.folders` (from the user's other tabs) triggers a reload.
- Call messages (`type: 'call'`, `call {status, duration_seconds}`) are written by the backend when a
  call ends; `utils/chatCall.ts` labels them from the reader's side (the author is the caller), and
  clicking one calls back. Typing: the composer calls `chatStore.notifyTyping()` (sent over the call
  socket at most every `TYPING_NOTIFY_INTERVAL_MS`); incoming `chat.typing` shows «печатает…» in the
  header and the list for `TYPING_VISIBLE_MS` or until that user's message arrives.
- In Docker on macOS Vite sometimes misses a file change even with polling; if the served code
  is stale, `docker compose restart web`.
- Styling via CSS variables from `src/assets/main.css`; no hard-coded colors in components.
  Every theme-dependent token is a `light-dark(light, dark)` pair: the system scheme applies by
  default, `useThemeStore` pins it via `data-theme` on `<html>` (an inline script in `index.html`
  applies the saved choice before the first paint). The call window forces `color-scheme: dark`.
- Icons: `BaseIcon` (inline SVG paths, `currentColor`); `BaseButton` accepts `icon`.
- Mobile: page-level breakpoint `@media (max-width: 40rem)`; list rows use container queries
  (`@container (max-width: 30rem)`) to collapse buttons to icons, keeping text in `aria-label`.
- User-facing text is Russian.

## Commands

```bash
make start        # docker build + up on http://localhost:5190
make check        # lint + type-check + test
npm run format    # Prettier; CI runs `prettier --check src/`, and `make check` does not
npm run dev       # without Docker
```
