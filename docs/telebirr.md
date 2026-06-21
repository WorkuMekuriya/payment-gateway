# Telebirr integration

H5 C2B **hosted checkout** integration for **Telebirr** in the EFDA Payment Gateway microservice.

← Back to [`architecture.md`](architecture.md)

---

## Overview

Telebirr checkout flow:

1. **Fabric token** — authenticate with `appSecret`
2. **Pre-order** — signed `payment.preorder` → `prepay_id`
3. **Checkout URL** — signed query string on `TELEBIRR_WEB_BASE_URL`
4. **Callback** — RSA-verified server notify
5. **Redirect callback** — browser return params (optional second channel)
6. **Reconcile** — `payment.queryorder` when callbacks are lost

Callbacks are **RSA-signed**. Unlike EthSwitch, Telebirr also needs **reconciliation** for local development (Telebirr cannot POST to `localhost`).

---

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/telebirr/initiate/:applicationId` | API key (if set) | Start or resume checkout |
| `POST` | `/api/telebirr/callback` | RSA signature | Server-to-server notify |
| `POST` | `/api/telebirr/redirect-callback` | API key + signature | Browser return payload |
| `POST` | `/api/telebirr/reconcile/:applicationId` | API key | On-demand `queryorder` |
| `GET` | `/api/telebirr/status/:merchOrderId` | API key | Diagnostic status query |

### Initiate

**Request body:**

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
    "checkoutUrl": "https://developerportal.ethiotelebirr.et:38443/payment/web/paygate?…",
    "merchOrderId": "FL12345…",
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
  participant TB as Telebirr API
  participant User as Payer

  Caller->>MS: POST /api/telebirr/initiate/:id
  MS->>TB: POST /payment/v1/token
  TB-->>MS: fabric token
  MS->>TB: POST /payment/v1/merchant/preOrder (signed)
  TB-->>MS: prepay_id
  MS-->>Caller: checkoutUrl
  Caller->>User: Redirect to checkoutUrl
  User->>TB: Complete payment
  alt Server callback
    TB->>MS: POST /callback (signed)
    MS->>Caller: payment-success webhook
  else Browser return
    User->>Caller: Redirect with signed query params
    Caller->>MS: POST /redirect-callback
    MS->>Caller: payment-success webhook
  else Lost callback (local dev)
    Caller->>MS: POST /reconcile/:applicationId
    MS->>TB: payment.queryorder
    MS->>Caller: payment-success webhook
  end
```

---

## Gateway protocol

### Fabric token

```
POST {TELEBIRR_BASE_URL}/payment/v1/token
X-APP-Key: {TELEBIRR_FABRIC_APP_ID}

{ "appSecret": "…" }
```

Response:

```json
{
  "token": "…",
  "effectiveDate": "20260101120000",
  "expirationDate": "20260101130000"
}
```

### Pre-order (`payment.preorder`)

```
POST {TELEBIRR_BASE_URL}/payment/v1/merchant/preOrder
X-APP-Key: {TELEBIRR_FABRIC_APP_ID}
Authorization: Bearer {fabric_token}
```

Signed body includes `biz_content`:

```json
{
  "notify_url": "{TELEBIRR_NOTIFY_URL}",
  "appid": "{TELEBIRR_MERCHANT_APP_ID}",
  "merch_code": "{TELEBIRR_MERCHANT_CODE}",
  "merch_order_id": "FL12345…",
  "trade_type": "Checkout",
  "title": "Application 12345 Facility License Fee",
  "total_amount": "1.00",
  "trans_currency": "ETB",
  "timeout_express": "120m",
  "redirect_url": "{TELEBIRR_REDIRECT_BASE_URL}/12345"
}
```

Success: `result: "SUCCESS"`, `code: "0"`, `biz_content.prepay_id` present.

### Checkout URL

Built after `prepay_id` is returned via `buildTelebirrCheckoutUrl()` in `signing.util.ts`.

Signed fields (ASCII-sorted, **five only**): `appid`, `merch_code`, `nonce_str`, `prepay_id`, `timestamp`. Do **not** include `sign_type`, `version`, or `trade_type` in the signature string.

Paygate `appid` is the same numeric **`TELEBIRR_MERCHANT_APP_ID`** used in `payment.preorder` `biz_content`. **`TELEBIRR_FABRIC_APP_ID`** is only for the `X-APP-Key` header and fabric token — using the UUID as paygate `appid` returns `appid error.common.param.must.be.number`.

```
{TELEBIRR_WEB_BASE_URL}appid={MERCHANT_APP_ID}&merch_code=…&nonce_str=…&prepay_id=…&timestamp=…&sign_type=SHA256WithRSA&sign=…&version=1.0&trade_type=Checkout
```

All query values (including `sign`) are URL-encoded. `version` and `trade_type` are appended after the signed block.

### Query order (`payment.queryorder`)

Used by reconcile job and `POST /reconcile/:applicationId`. Maps response `order_status`:

| Telebirr status | Internal status |
|-----------------|-----------------|
| `PAY_SUCCESS` | `SUCCESS` |
| `PAY_FAILED` | `FAIL` |
| `ORDER_CLOSED` | `TIMEOUT` |
| `WAIT_PAY`, `PAYING`, … | No change (retry later) |

---

## Signing & verification

Implementation: `src/telebirr/utils/signing.util.ts`

### Outbound signing (preorder, queryorder, checkout URL)

1. Exclude `sign`, `sign_type`, `biz_content` wrapper (flatten inner fields)
2. ASCII-sort keys, join as `key=value&…`
3. RSA-SHA256 **PSS** with **32-byte salt** (required by Telebirr; Node’s default max salt fails verification)
4. Base64-encode signature

### Inbound callback verification

**Server callback** (`POST /callback`):

- Build sign string with all declared fields (empty values included)
- Verify with `TELEBIRR_PUBLIC_KEY_PEM` using PSS

**Redirect callback** (`POST /redirect-callback`):

- Tries 8 combinations: redirect vs callback sign string × raw vs URL-encoded values × PSS vs PKCS#1
- If all fail and `TELEBIRR_ALLOW_DEV_SIGNATURE_BYPASS=true` (non-production), bypass is allowed for local E2E testing

---

## Service logic

### Initiate

1. Validate amount
2. Resume live `checkout_url` within `TELEBIRR_TIMEOUT_EXPRESS`
3. Signed `payment.preorder` → build checkout URL
4. Persist `telebirr_transaction` as `PENDING`

### Callback processing

Maps `trade_status` from callback or query:

| Callback value | Internal |
|----------------|----------|
| `Completed`, `Pending` | `SUCCESS` |
| `Failure` | `FAIL` |
| `Expired` | `TIMEOUT` |
| `PAY_SUCCESS` | `SUCCESS` |
| `PAY_FAILED` | `FAIL` |
| `ORDER_CLOSED` | `TIMEOUT` |
| `Paying` | Ignored (non-terminal) |

On `SUCCESS`: verify amount, update tx, webhook with `provider: "TELEBIRR"`.

### Reconciliation

**Background job** (`TelebirrReconciliationJob`): every 10 minutes, pending txs older than 30 minutes.

**On-demand** (`POST /reconcile/:applicationId`): no age cutoff — used when applicant returns from checkout or during local dev.

Both call `payment.queryorder` and apply the same status mapping.

---

## Transaction status lifecycle

```
PENDING ──► SUCCESS   (callback / reconcile: PAY_SUCCESS)
PENDING ──► FAIL      (callback: Failure / PAY_FAILED)
PENDING ──► TIMEOUT   (reconcile: ORDER_CLOSED or timeout exceeded)
```

Telebirr has no explicit cancel endpoint — abandoned checkouts time out.

---

## Data model

Migration: `database/002_telebirr.sql`

### `payment.telebirr_transaction`

| Column | Purpose |
|--------|---------|
| `payment_info_id` | Caller payment record id |
| `application_id` | For webhook and reconcile lookup |
| `merch_order_id` | Unique idempotency key |
| `prepay_id` | From pre-order response |
| `payment_order_id` | Telebirr payment order id |
| `trans_id` | Telebirr transaction id |
| `trade_status` | Internal status |
| `checkout_url` | Full paygate URL |
| `reconciled_at` | Last reconcile attempt timestamp |
| `reconcile_attempts` | Reconcile counter |

### `payment.telebirr_api_log`

Same as EthSwitch audit log, plus `signature_valid` on inbound entries.

---

## Source code map

```
src/telebirr/
  telebirr.module.ts
  telebirr.controller.ts
  telebirr.service.ts
  telebirr-api.client.ts
  telebirr-reconciliation.job.ts
  token-cache.service.ts
  dto/telebirr.dto.ts
  entities/
    telebirr-transaction.entity.ts
    telebirr-api-log.entity.ts
  constants/statuses.ts
  utils/signing.util.ts
```

---

## Configuration

| Variable | Purpose |
|----------|---------|
| `TELEBIRR_BASE_URL` | API gateway base |
| `TELEBIRR_WEB_BASE_URL` | Hosted checkout URL prefix (ends with `?`) |
| `TELEBIRR_FABRIC_APP_ID` | `X-APP-Key` header |
| `TELEBIRR_APP_SECRET` | Fabric token request body |
| `TELEBIRR_MERCHANT_APP_ID` | `appid` in orders |
| `TELEBIRR_MERCHANT_CODE` | Merchant short code |
| `TELEBIRR_PRIVATE_KEY_PEM` | PKCS#8 PEM for signing (use `\n` in `.env`) |
| `TELEBIRR_PUBLIC_KEY_PEM` | Telebirr **platform** public key for verify |
| `TELEBIRR_NOTIFY_URL` | Public callback URL on this service |
| `TELEBIRR_REDIRECT_BASE_URL` | SPA detail base for `redirect_url` |
| `TELEBIRR_TIMEOUT_EXPRESS` | Order timeout, e.g. `120m` |
| `TELEBIRR_QUERY_MAX_RETRIES` | Reserved for future retry policy |
| `TELEBIRR_RECONCILE_INTERVAL_MINUTES` | Documented interval (cron is 10 min) |
| `TELEBIRR_ALLOW_DEV_SIGNATURE_BYPASS` | `true` in dev when platform key unavailable |
| `TELEBIRR_ALLOW_INSECURE_TLS` | `true` in dev — skip TLS verify for Telebirr sandbox (incomplete cert chain) |

### PEM keys in `.env`

Use escaped newlines:

```env
TELEBIRR_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\nMIIE…\n-----END PRIVATE KEY-----"
```

---

## Local development workflow

Telebirr **cannot** POST to `localhost`. Recommended flow:

1. Tunnel `TELEBIRR_NOTIFY_URL` with ngrok (optional, for server callback testing)
2. Complete payment on Telebirr sandbox checkout
3. Caller forwards browser return params to `POST /api/telebirr/redirect-callback`, **or**
4. Caller calls `POST /api/telebirr/reconcile/:applicationId` to poll `queryorder`

Step 4 is the reliable path when only localhost is available.

---

## Operations & troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `unable to verify the first certificate` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Telebirr sandbox TLS chain — set `TELEBIRR_ALLOW_INSECURE_TLS=true` in dev |
| `Failed to reach Telebirr payment gateway` | Wrong `TELEBIRR_BASE_URL` or fabric credentials |
| `appid error.common.param.must.be.number` | Paygate `appid` must be numeric `TELEBIRR_MERCHANT_APP_ID`, not `TELEBIRR_FABRIC_APP_ID` (UUID) |
| `60320006` / required parameter empty | Wrong checkout signature (check private key on developer portal), expired `prepay_id`, or sandbox H5 outage — initiate a fresh payment and open the new `checkoutUrl` immediately |
| `Verify the sign field failed` / `60200099` | Wrong private key on portal, or PSS salt length not 32 — ensure latest service build |
| Callback `FAIL` / ignored | Signature verification failed — check `TELEBIRR_PUBLIC_KEY_PEM` |
| Payment stuck `PENDING` | No callback — run reconcile endpoint |
| `signature_valid: false` in api_log | Expected until correct platform public key is configured |

Inspect `payment.telebirr_api_log` for payloads and `signature_valid` flag.
