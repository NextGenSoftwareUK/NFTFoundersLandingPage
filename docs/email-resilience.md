# Email Resilience — Retry Queue & Manual Resend

## Overview

All Resend API calls retry automatically up to 3 times before failing. If all retries are exhausted, the email is pushed to a Redis queue and retried by a Vercel cron job every 10 minutes. A manual resend endpoint is also available for support use.

---

## Retry Behaviour

### Client-side (buyer confirmation email)
`sendConfirmationEmail()` in `index.html` retries the `/api/sendEmail` fetch up to 3 times with a 3s/6s backoff before giving up silently (non-fatal — the success overlay is already shown).

### Server-side (all Resend calls)
`resendWithRetry()` in `api/sendEmail.js` and `api/oasis.js` retries each Resend API call up to 3 times with a 2s/4s backoff. If all 3 attempts fail, `sendEmail.js` pushes the payload to the Redis queue (see below). The owner notification in `oasis.js` is non-fatal and does not queue on failure.

---

## Redis Email Queue

**Key:** `email-queue` (or `test:email-queue` in TEST_MODE)  
**Type:** Redis List (LPUSH to enqueue, RPOP to drain)

Each entry is a JSON object:
```json
{
  "payload": { "from": "...", "to": "...", "subject": "...", "html": "..." },
  "queuedAt": 1723196400000,
  "attempts": 0
}
```

Emails stay in the queue until successfully sent or until they exceed **10 attempts**, at which point they are dropped with a console error.

### Vercel Cron

`vercel.json` schedules a GET to `/api/sendEmail` every 10 minutes:
```json
{ "path": "/api/sendEmail", "schedule": "*/10 * * * *" }
```

The GET handler calls `handleProcessEmailQueue`, which drains up to 20 emails per invocation. Requires the `EMAIL_QUEUE_SECRET` query param if that env var is set:
```
GET /api/sendEmail?secret=YOUR_SECRET
```

---

## Manual Resend Endpoint

Use this when a customer reports not receiving their confirmation email.

**Request:**
```
POST /api/sendEmail
Content-Type: application/json

{
  "action": "resend-confirmation",
  "orderId": "<orderId from Redis / Stripe / logs>",
  "secret": "<EMAIL_QUEUE_SECRET>"
}
```

**What it does:**
1. Looks up `order:<orderId>` in Redis
2. Verifies status is `minted`
3. Reconstructs the confirmation email from order fields (`email`, `tier`, `mintTx`, `avatarActivationUrl`, `avatarCreated`)
4. Checks if the email is on the waitlist (to set the Early Bird flag)
5. Sends via `handleSendEmail` (which itself uses `resendWithRetry`)

**Responses:**
- `200 { success: true }` — email sent
- `400` — missing orderId, or order not yet minted
- `401` — wrong secret
- `404` — orderId not found in Redis

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Yes | Resend API key |
| `EMAIL_FROM` | Yes | Verified sender address (e.g. `noreply@oasisomniverse.one`) |
| `EMAIL_QUEUE_SECRET` | Recommended | Protects the cron GET and manual resend endpoints |

---

## Checking Queue Depth

To see how many emails are queued:
```
redis-cli LLEN email-queue
```
Or inspect via Railway's Redis panel.

---

## Process Queue Manually (if cron is delayed)

```
POST /api/sendEmail
{ "action": "process-email-queue", "secret": "<EMAIL_QUEUE_SECRET>" }
```

Response:
```json
{ "success": true, "sent": 3, "failed": 0, "remaining": 0 }
```
