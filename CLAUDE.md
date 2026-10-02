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
  `App.vue`, which connects the socket whenever an auth token exists.
- Styling via CSS variables from `src/assets/main.css`; no hard-coded colors in components.
- User-facing text is Russian.

## Commands

```bash
make start        # docker build + up on http://localhost:5190
make check        # lint + type-check + test
npm run dev       # without Docker
```
