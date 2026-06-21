# EFDA Payment Gateway

NestJS microservice for **EthSwitch (NGB)** and **Telebirr** hosted checkout payments.

## Documentation

| Doc | Description |
|-----|-------------|
| [`docs/architecture.md`](docs/architecture.md) | Microservice design, planning, shared platform |
| [`docs/ethswitch.md`](docs/ethswitch.md) | EthSwitch (NGB) integration |
| [`docs/telebirr.md`](docs/telebirr.md) | Telebirr H5 C2B integration |

## Quick start

```bash
cp .env.example .env
# edit credentials + DB
psql -f database/001_init.sql
psql -f database/002_telebirr.sql
npm install
npm run start:dev
```

Swagger (dev): `http://localhost:3100/api/docs`

## API summary

**EthSwitch** — [`docs/ethswitch.md`](docs/ethswitch.md)

| Method | Path |
|--------|------|
| `POST` | `/api/ethswitch/initiate/:applicationId` |
| `GET` | `/api/ethswitch/cancel` |
| `POST` | `/api/ethswitch/callback` |

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
