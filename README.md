# EFDA Payment Gateway

NestJS microservice for **EthSwitch (NGB)** and **Telebirr** hosted checkout payments.

## Documentation

| Doc | Description |
|-----|-------------|
| [`docs/architecture.md`](docs/architecture.md) | Microservice design, planning, shared platform |
| [`docs/payments-callback.md`](docs/payments-callback.md) | Production callback endpoints, verification, idempotency, events |
| [`docs/ethswitch.md`](docs/ethswitch.md) | EthSwitch (NGB) integration |
| [`docs/telebirr.md`](docs/telebirr.md) | Telebirr H5 C2B integration |

## Quick start

```bash
cp .env.example .env
# edit credentials + DB
psql -f src/database/001_etswitch.sql
psql -f src/database/002_telebirr.sql
psql -f src/database/003_payments.sql
npm install
npm run start:dev
```

Swagger (`NODE_ENV=development`): `http://localhost:3100/api/docs`

## API summary

**EthSwitch** — [`docs/ethswitch.md`](docs/ethswitch.md)

| Method | Path |
|--------|------|
| `POST` | `/api/ethswitch/initiate/:applicationId` |
| `POST` | `/api/v1/payments/ethswitch/callback` |
| `GET` | `/api/ethswitch/cancel` |

**Telebirr** — [`docs/telebirr.md`](docs/telebirr.md)

| Method | Path |
|--------|------|
| `POST` | `/api/telebirr/initiate/:applicationId` |
| `POST` | `/api/telebirr/callback` |
| `POST` | `/api/telebirr/redirect-callback` |
| `POST` | `/api/telebirr/reconcile/:applicationId` |
| `GET` | `/api/telebirr/status/:merchOrderId` |

**Initiate body** (all providers):

```json
{
  "paymentInfoId": 123,
  "amount": 1.00,
  "currency": "ETB"
}
```

On successful payment the service POSTs to `PAYMENT_SUCCESS_WEBHOOK_URL` with `provider` set to `ETHSWITCH` or `TELEBIRR`.

## Tests

```bash
npm test                                          # unit tests
npm run test:e2e -- --testPathPatterns=ethswitch-callback  # callback integration tests
```
