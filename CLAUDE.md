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
- Styling via CSS variables from `src/assets/main.css`; no hard-coded colors in components.
- User-facing text is Russian.

## Commands

```bash
make start        # docker build + up on http://localhost:5190
make check        # lint + type-check + test
npm run dev       # without Docker
```
