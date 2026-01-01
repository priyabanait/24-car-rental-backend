# Firebase Push Setup (Backend)

This project now supports server-side Firebase Cloud Messaging (FCM) push deliveries.

## What I added

- `backend/lib/firebaseAdmin.js` - initializes Firebase Admin SDK using `FIREBASE_SERVICE_ACCOUNT_JSON` from `.env` and exports helpers `sendToToken` / `sendToTokens`.
- `backend/models/fcmToken.js` - a small model to store device tokens with `userId` and `userType`.
- `backend/routes/notifications.js` - new endpoints:
  - `POST /api/notifications/register-token` - register or update a token with `token`, optional `userId`, `userType`.
  - `POST /api/notifications/unregister-token` - delete token.

Also notification send flows now attempt to send FCM messages to registered tokens for users when admin sends immediate notifications.

## Environment

Ensure `FIREBASE_SERVICE_ACCOUNT_JSON` contains the service account JSON (already in `.env`).

## Install

From `backend/` run:

```
npm install
```

This will install `firebase-admin`.

## Endpoints

- Register token: `POST /api/notifications/register-token`
  - Body: `{ token: string, userId?: string, userType?: 'driver'|'investor'|'customer' }`

- Unregister token: `POST /api/notifications/unregister-token`
  - Body: `{ token: string }`

- Notes: admin notification routes (`/api/notifications/admin/send` and `/api/notifications/admin/send-specific`) will now attempt to deliver FCM messages to any registered tokens for recipients.

## Next steps / Testing

- Add the web client code (see client README in repo) and obtain a web FCM VAPID key (public key) from Firebase console.
- Use the client to request permission and register the token via API.
- Send an admin notification targeting that user and verify the device receives a push (foreground and background).

