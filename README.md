# @xeplr/push

**Web Push for xeplr apps: a notification on a person's phone or computer, even when the app is closed.** It keeps each person's devices, sends to them, and gives the routes a device is switched on and off with. The browser side, the **"Notifications on this device"** switch and the service worker that shows them, is in [`@xeplr/ui-account`](https://www.npmjs.com/package/@xeplr/ui-account).

```js
var push = require('@xeplr/push')

await push.init({ knex })                                              // its table, in the app's own database
app.use('/api/push', gate, push.router({ userOf: (req) => req.user })) // behind the app's sign-in
await push.send({ emails: ['neha@example.com'] }, { title: 'Overdue: Pack the frame', body: '#GA1023', url: '/orders/abc' })
```

## How it works

```
browser (ui-account)                     the app's API (@xeplr/push)              push service (Google, Apple, Mozilla)
 "Notifications on this device" ─ subscribe ─▶ push_subscriptions
                                                  send(people, message) ── Web Push, signed with the app's keys ──▶ the phone, app open or not
 service worker shows it ◀────────────────────────────────────────────────────────────────────────────────────────────
 a tap opens message.url in the app
```

- **Who gets what is the app's choice.** This package only delivers. It never decides that an event is worth a buzz.
- A device the push service reports gone (404 or 410: switched off in the phone's settings, the app removed, the subscription expired) is **removed** and never tried again.
- A message waits **a day** for a phone that is off (`TTL_SECONDS`), then is dropped.
- **iPhone:** iOS 16.4 or later, and only from the app added to the Home Screen, never a Safari tab. **Android:** Chrome, installed or not. HTTPS is required everywhere (localhost is allowed).

## Settings

| variable | |
|---|---|
| `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` | The app's identity to the push services. Make them **once** with `npx xeplr-push keys`. The private key is a secret, like a database password. Changing the keys later switches every device off, and each must be switched on again. |
| `PUSH_VAPID_SUBJECT` | `mailto:you@domain` or `https://domain`. The push services contact it about problems. Anything else is refused at `init`. |
| `XEPLR_PUSH_MIGRATIONS` | Optional: the app's own migration directories for the push table, comma separated. They run after the package's own. |

**Without the keys, push is off, not broken.** `send()` sends nothing and says why (`skipped`), `/key` answers `enabled: false`, and ui-account's switch does not offer itself. `requiredEnv` lists the three, for an app that wants a missing one to fail at start.

## API

| export | |
|---|---|
| `init({ knex, vapid?, webPush?, log?, migrate? })` | The keys (from `vapid` or the env), and the `push_subscriptions` table in the app's database: migrations ledger `xeplr_push_migrations`. Safe at every start. `knex` may be the instance or a function returning it. Resolves `{ enabled, migrations }`. |
| `enabled()`, `publicKey()` | Whether keys are set; the public key the browser subscribes with. |
| `router({ userOf, express? })` | The routes below. `userOf(req)` returns the signed-in person, `{ id, email? }`, or null. Mount it behind the app's sign-in. |
| `send(target, message, opts?)` | To every device of `target`, `{ userIds?, emails? }`, or `{ everyone: true }` for every device switched on (news everyone follows, such as a new order), each device once. `message`: `{ title, body?, url?, tag? }`. `opts.except: { userIds?, emails? }` never sends to these (whoever did it). `opts.ttl` in seconds. Resolves `{ devices, sent, removed, failed, skipped? }`. It never throws for a device; one bad device never stops the others. It throws only for a message without a title. |
| `payloadOf`, `subscriptionOf` | Pure: what a message becomes (trimmed, kept short); a browser's `PushSubscription.toJSON()` checked, or null. |
| `createStore`, `createSender`, `createRouter` | The pieces, to wire by hand or test with fakes. |

**A message** is at most 120 characters of title and 300 of body. `url` is a path **inside the app** (`/orders/abc`): a full URL to another site is replaced by `/`, so a tap can never open somewhere else. `tag` makes a new notification replace the last one with the same tag (one task's alerts stack as one).

## Routes

Relative to where `router()` is mounted. Answers use xeplr's `{ code, message, dataArray }`. Every route needs a signed-in person (401 otherwise).

| route | does |
|---|---|
| `GET /key` | `{ enabled, publicKey }` |
| `GET /device?endpoint=` | `{ on }`: whether this device is switched on, for this person |
| `POST /subscribe` `{ subscription }` | Switch this device on. A device is one row: switched on again by someone else, it becomes theirs. 400 for something that is not a subscription; 409 when the server has no keys. |
| `POST /unsubscribe` `{ endpoint }` | Switch it off. ui-account calls it on sign-out too, so a shared phone stops getting the last person's notifications. |

Each route the app mounts needs its `apis` row in the app's `migrations-auth/`, like any other route.

## The table

`push_subscriptions`, in the app's database: `id`, `userId`, `email` (lowercased; an app may know a person by email rather than account id), `endpoint` (unique), `p256dh`, `auth`, `userAgent`, `createdAt`, `lastSentAt`.

## Commands

```sh
npx xeplr-push keys     # prints the three lines for the .env
```

## Tests

`npm test`: payloads and subscriptions, sending (each device once, the person who did it left out, a gone device removed, a failure logged while the rest still go, no keys means nothing sent), and the routes against a real Express app.
