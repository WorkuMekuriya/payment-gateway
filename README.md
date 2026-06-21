# EFDA-ETSwitch

NestJS microservice for the EthSwitch (NGB) payment gateway.

**Architecture & EthSwitch integration:** [`docs/architecture.md`](docs/architecture.md)

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ethswitch/initiate/:applicationId` | Start or resume hosted payment |
| `GET` | `/api/ethswitch/cancel` | Payer cancel return → redirect to SPA |
| `POST` | `/api/ethswitch/callback` | Gateway completion webhook |

## Initiate body

```json
{
  "paymentInfoId": 123,
  "amount": 500.00,
  "currency": "ETB"
}
```

## Payment success webhook

On `PAID` callback the service POSTs to `PAYMENT_SUCCESS_WEBHOOK_URL` with `paymentInfoId`, `applicationId`, `merchOrderId`, and `transId`.

## Setup

```bash
cp .env.example .env
# edit credentials + DB
psql -f database/001_init.sql
npm install
npm run start:dev
```

Swagger UI is available in non-production environments at `http://localhost:3100/api/docs` (`NODE_ENV` must not be `production`).

## Config

See `.env.example` and [`docs/architecture.md`](docs/architecture.md#6-configuration).
