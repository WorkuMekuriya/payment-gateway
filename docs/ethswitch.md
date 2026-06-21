# EthSwitch (NGB) integration

Hosted Payment Page (HPP) integration for **EthSwitch NGB** in the EFDA Payment Gateway microservice.

← Back to [`architecture.md`](architecture.md)

Official API reference: [NBG API sandbox](https://ethswitch.github.io/ngb-api-sandbox/)

---

## Overview

EthSwitch uses a **redirect-based hosted checkout**:

1. Caller requests initiate → service registers an HPP order with NGB
2. Service returns `checkoutUrl` (`hpp_url`)
3. Payer pays on EthSwitch’s hosted page
4. NGB POSTs completion to our callback URL
5. On `PAID`, we notify the caller via `PAYMENT_SUCCESS_WEBHOOK_URL`

There is **no cryptographic signature** on callbacks. Trust is established by matching `merch_order_id` and amount/currency.

---

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ethswitch/initiate/:applicationId` | API key (if set) | Start or resume HPP payment |
| `POST` | `/api/ethswitch/callback` | None | NGB completion webhook |
| `GET` | `/api/ethswitch/cancel` | None | Payer cancel → redirect to SPA |

### Initiate

**Request body** (same as all providers):

```json
{
  "paymentInfoId": 123,
  "amount": 1.00,
  "currency": "ETB"
}
```

**Success response:**

```json
{
  "success": true,
  "message": "Payment initiated successfully.",
  "data": {
    "success": true,
    "checkoutUrl": "https://cbs-uat.ethswitch.et:4443/hpp/…",
    "merchOrderId": "FL12345a1b2c3d4e5f6",
    "transactionId": 1,
    "applicationId": 12345,
    "amount": "1.00",
    "isResume": false
  }
}
```

---

## End-to-end sequence

```mermaid
sequenceDiagram
  participant Caller as Calling system
  participant MS as Payment Gateway
  participant NGB as EthSwitch NGB
  participant User as Payer

  Caller->>MS: POST /api/ethswitch/initiate/:id
  MS->>NGB: POST /user/auth/login
  NGB-->>MS: access_token
  MS->>NGB: POST order.create (HPP)
  NGB-->>MS: hpp_url
  MS-->>Caller: checkoutUrl
  Caller->>User: Redirect to hpp_url
  User->>NGB: Pay or cancel
  alt PAID
    NGB->>MS: POST /callback
    MS->>Caller: POST payment-success webhook
    NGB->>User: Redirect success_url
  else Cancelled
    NGB->>User: Redirect cancel_url
    User->>MS: GET /cancel?merchOrderId=…
    MS->>User: Redirect to application detail
  end
```

---

## Gateway protocol

### Authentication

```
POST {ETHSWITCH_BASE_URL}/user/auth/login
Content-Type: application/json

{ "username": "…", "password": "…" }
```

Response:

```json
{ "access_token": "…", "expires_in": 300 }
```

Token is cached in memory at **90% of `expires_in`**. Evicted on HTTP **401** from order calls.

### Register HPP order (`order.create`)

```
POST {ETHSWITCH_BASE_URL}/nbg/api/v1/payment/order/handle?action=order.create
Authorization: Bearer {access_token}
X-Correlation-ID: {uuid}
X-Biller-BIN: {ETHSWITCH_BILLER_BIN}
```

Body (sent as **snake_case**):

```json
{
  "amount": 500,
  "currency": "ETB",
  "merchant_order_number": "FL12345a1b2c3d4e5f6",
  "idempotency_key": "FL12345a1b2c3d4e5f6",
  "description": "Application 12345 Facility License Fee",
  "success_url": "{ETHSWITCH_FRONTEND_BASE_URL}/applications/detail/12345",
  "cancel_url": "{ETHSWITCH_CANCEL_URL}?merchOrderId=…",
  "callback_url": "{ETHSWITCH_NOTIFY_URL}",
  "line_items": [
    {
      "item_name": "Application Fee",
      "quantity": 1,
      "unit_price": 500,
      "total_usage_amount": 500
    }
  ]
}
```

Response fields (gateway uses snake_case; normalized to camelCase in code):

| Gateway field | Stored / returned as |
|---------------|----------------------|
| `hpp_url` | `checkoutUrl` |
| `hpp_token` | `hppToken` on transaction |
| `order_reference` | `orderReference` |
| `expires_at` | `expiresAt` (resume window) |

---

## Service logic

### Initiate (`EthSwitchService.initiatePayment`)

1. Validate `amount > 0`
2. **Resume** — if `PENDING` tx has live `checkout_url` (within `expires_at` or `ETHSWITCH_TIMEOUT_EXPRESS`), return with `isResume: true`
3. **Stale pending** — mark older rows `TIMEOUT`
4. **New order** — `merchOrderId` = `FL{applicationId}{12 random hex chars}`
5. Call `order.create`, persist transaction, return `checkoutUrl`
6. Log outbound to `ethswitch_api_log`

### Callback (`POST /api/ethswitch/callback`)

Key payload fields:

| Field | Meaning |
|-------|---------|
| `status` / `current_status` | `PAID` or `FAILED` |
| `data.request_id` | Our `merch_order_id` |
| `transaction_id` | Gateway transaction id |
| `data.bill_info` | Amount/currency integrity check |

Rules:

- Always respond `{ "code": "SUCCESS" }`
- Idempotent — skip if already `SUCCESS` or `FAIL`
- On `PAID` with amount mismatch → mark `FAIL`, do not webhook
- On success → update tx, POST webhook with `provider: "ETHSWITCH"`

### Cancel (`GET /api/ethswitch/cancel`)

Browser redirect when payer abandons HPP. Marks `PENDING` → `CANCELLED`, then redirects to:

```
{ETHSWITCH_FRONTEND_BASE_URL}/applications/detail/{applicationId}
```

---

## Transaction status lifecycle

```
PENDING ──► SUCCESS    (callback: PAID)
PENDING ──► FAIL       (callback: FAILED, or amount mismatch)
PENDING ──► TIMEOUT    (stale; new initiate creates fresh order)
PENDING ──► CANCELLED  (payer cancel redirect)
```

Terminal states (`SUCCESS`, `FAIL`) ignore duplicate callbacks.

---

## Data model

Migration: `database/001_init.sql`

### `payment.ethswitch_transaction`

| Column | Purpose |
|--------|---------|
| `payment_info_id` | Caller payment record id |
| `application_id` | For redirects and webhook |
| `merch_order_id` | Unique — idempotency key with NGB |
| `trade_status` | `PENDING`, `SUCCESS`, `FAIL`, `TIMEOUT`, `CANCELLED` |
| `checkout_url` | HPP URL for payer |
| `expires_at` | Gateway-reported link expiry |
| `raw_callback` | Full callback JSON for disputes |

### `payment.ethswitch_api_log`

Audit trail: direction (`INBOUND` / `OUTBOUND`), method, payloads, HTTP status, duration.

---

## Source code map

```
src/ethswitch/
  ethswitch.module.ts
  ethswitch.controller.ts
  ethswitch.service.ts
  ethswitch-api.client.ts
  token-cache.service.ts
  dto/ethswitch.dto.ts
  entities/
    ethswitch-transaction.entity.ts
    ethswitch-api-log.entity.ts
  constants/statuses.ts
  utils/normalize-gateway-response.ts   # hpp_url → hppUrl
```

---

## Configuration

| Variable | Purpose |
|----------|---------|
| `ETHSWITCH_BASE_URL` | Gateway host, e.g. `https://cbs-uat.ethswitch.et:4443` |
| `ETHSWITCH_USERNAME` | Login username |
| `ETHSWITCH_PASSWORD` | Login password |
| `ETHSWITCH_BILLER_BIN` | `X-Biller-BIN` header |
| `ETHSWITCH_CURRENCY` | Default currency (`ETB`) |
| `ETHSWITCH_FRONTEND_BASE_URL` | SPA origin for `success_url` redirect |
| `ETHSWITCH_CANCEL_URL` | Public cancel endpoint on this service |
| `ETHSWITCH_NOTIFY_URL` | Public callback endpoint on this service |
| `ETHSWITCH_TIMEOUT_EXPRESS` | Pending link window, e.g. `120m` |

### Sandbox values ([NBG docs](https://ethswitch.github.io/ngb-api-sandbox/))

| Variable | Example |
|----------|---------|
| `ETHSWITCH_USERNAME` | `admin@eeu.et` |
| `ETHSWITCH_PASSWORD` | `password` |
| `ETHSWITCH_BILLER_BIN` | `NEEUETAA` |

### Local development

- Set `ETHSWITCH_NOTIFY_URL` to a **public** URL (ngrok) — NGB cannot reach `localhost`
- `ETHSWITCH_CANCEL_URL` can be localhost for browser redirects from your machine

---

## Operations & troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `Payment gateway returned an unexpected response` | Gateway returned `hpp_url` missing — check credentials, BIN, or API path |
| Callback never arrives | `ETHSWITCH_NOTIFY_URL` not publicly reachable |
| Initiate works but no webhook | `PAYMENT_SUCCESS_WEBHOOK_URL` unset or caller endpoint down |
| Duplicate payment attempts | Expected — each new initiate after timeout creates new `merch_order_id`; old pending rows are marked `TIMEOUT` |

Inspect `payment.ethswitch_api_log` for raw request/response payloads.
