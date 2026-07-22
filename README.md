# meridian

A payment processing pipeline built with Node.js, TypeScript, Express, and BullMQ. Uses the transactional outbox pattern for reliable queueing, PostgreSQL for persistence, and includes a React frontend with real-time updates, comprehensive Prometheus metrics, and OpenTelemetry tracing.

---

## Architecture

```mermaid
flowchart LR
    subgraph Frontend
        UI["React + Vite + Tailwind"]
    end

    subgraph Backend
        API["Express API<br/>:8080"]
        MW["Middleware<br/>Rate Limiter · Logger · Metrics"]
        Handler["Route Handlers"]

        subgraph Service
            SVC["Payment Service"]
            OUTBOX["Transactional Outbox<br/>(poll 200ms)"]
        end

        RECON["Reconciliation<br/>(poll 30s)"]
    end

    subgraph Workers
        WK["BullMQ Worker<br/>payment:process"]
    end

    subgraph Storage
        PG[("PostgreSQL<br/>payments + outbox_events")]
        RQ[("Redis<br/>BullMQ queues")]
    end

    subgraph Observability
        PROM["Prometheus<br/>:8080/metrics"]
        OTLP["OTLP Exporter<br/>(optional)"]
        LOG["Structured Logger"]
    end

    subgraph Provider
        MOCK["Mock Provider<br/>:3000"]
    end

    UI -->|HTTP| API
    MW --> API
    API --> Handler
    Handler --> SVC
    SVC -->|atomic INSERT| PG
    SVC -->|INSERT| OUTBOX
    OUTBOX -->|poll & publish| RQ
    RQ -->|consume| WK
    WK -->|process| MOCK
    WK -->|update status| PG
    RECON -->|re-enqueue stuck| RQ
    RECON -->|update status| PG
    SVC --> PROM
    WK --> PROM
    MW --> PROM
    API --> OTLP
    MW --> LOG
```

---

## Features

### Core Pipeline
- **Transactional Outbox** — `createPaymentWithOutbox` atomically inserts both the payment record and an outbox event in a single PostgreSQL transaction. A background poller (200ms) publishes outbox events to BullMQ, ensuring at-least-once delivery without two-phase commits.
- **BullMQ Queue** — Payment tasks are routed to `critical`, `default`, or `low` queues with priority weighting based on amount.
- **Idempotency Guard** — Postgres unique constraint on `idempotency_key` prevents duplicate creation. Deterministic `jobId: paymentID` prevents duplicate queue entries.
- **Automatic Retries** — BullMQ retries failed jobs with exponential backoff (max 8 attempts). Transient provider errors (503) transition to `failed_retryable`; validation errors (422) immediately go to `failed_final`.
- **Retry/Replay** — `POST /v1/payments/{id}/retry` re-enqueues a failed payment with a fresh attempt.

### Reconciliation
A background job (every 30s) detects payments stuck in `pending` for more than 2 minutes and re-enqueues them. Idempotent via deterministic `jobId`.

### Observability
- **Prometheus Metrics** — 18 metrics across HTTP, payments, workers, outbox, provider, rate limiter, and system layers. Exposed at `GET /metrics`.
- **OpenTelemetry Tracing** — Configurable OTLP exporter for distributed traces.
- **Structured Logging** — Request-level debug/info logging via middleware.

### Frontend (React)
- Vercel-inspired dark UI with real-time auto-refresh (2s for selected payment, 3s for active payments)
- Payment creation form with amount presets and manual idempotency key
- Live payments table with search and pagination
- Detail panel with full payment state
- Prometheus metrics viewer at `/logs`
- Persistent state across page refresh (localStorage)

### API
| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/payments` | Create and enqueue a payment |
| `GET` | `/v1/payments/:id` | Get payment status |
| `POST` | `/v1/payments/:id/retry` | Retry a failed payment |
| `GET` | `/v1/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics (18 metrics) |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis (or Memurai on Windows)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and Redis connection strings
```

Required `.env` variables:
```
PORT=8080
DATABASE_URL=postgresql://user:pass@localhost:5432/meridiandb
REDIS_HOST=localhost
REDIS_PORT=6379
PROVIDER_BASE_URL=http://localhost:3000
RATE_LIMIT=200
RATE_LIMIT_WINDOW_MS=60000
```

### Start the Mock Provider

```bash
cd mock-provider
npm install
npx tsx server.ts
```

### Start the Backend

```bash
npm run dev
```

Starts the Express server on `:8080` with BullMQ worker, outbox poller, reconciliation job, and metrics endpoint.

### Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens the React dashboard at `http://localhost:5173`.

---

## Project Structure

```
meridian/
├── src/
│   ├── index.ts              # Express server, outbox poller, reconciliation, shutdown
│   ├── config.ts             # Environment configuration
│   ├── db.ts                 # PostgreSQL pool (pg)
│   ├── queue.ts              # BullMQ queue definitions (critical/default/low)
│   ├── schema.sql            # Database schema (payments + outbox_events)
│   ├── handler/              # Route handlers + validation + middleware
│   │   └── middleware.ts     # Rate limiter, request logger, metrics recording
│   ├── service/              # Payment service, outbox writer, provider client
│   ├── worker/               # BullMQ worker with retry logic
│   ├── outbox/               # Outbox poller + publisher
│   ├── reconciliation/       # Stuck payment re-enqueuer
│   ├── metrics/              # Prometheus metric definitions (18 metrics)
│   ├── ratelimit/            # Sliding-window rate limiter
│   └── tracing/              # OpenTelemetry initialization
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Router, localStorage persistence
│   │   ├── components/       # Header, PaymentForm, PaymentsTable, PaymentDetail, Logs, Toast, SystemInfo
│   │   ├── hooks/            # API helpers
│   │   └── types/            # TypeScript interfaces
│   ├── index.html
│   └── vite.config.ts
├── mock-provider/
│   └── server.ts             # Mock payment provider (Express :3000)
├── docker-compose.yml        # PostgreSQL + Redis + Mock Provider
└── .env.example
```

---

## API Documentation

### `POST /v1/payments`

Creates and enqueues a payment via the transactional outbox.

```bash
curl -X POST http://localhost:8080/v1/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 12500, "idempotency_key": "unique-key-1"}'
```

**Response (202 — New payment)**
```json
{
  "payment": {
    "id": "2d1b827e-85b4-4e3f-a631-f542289c4b7b",
    "amount": 12500,
    "status": "pending",
    "idempotency_key": "unique-key-1",
    "attempts": 0,
    "provider_ref": null,
    "last_error": null,
    "created_at": "2026-07-19T12:00:00.000Z",
    "updated_at": "2026-07-19T12:00:00.000Z"
  },
  "created": true,
  "enqueued": true
}
```

**Response (200 — Duplicate idempotency key)**
```json
{
  "payment": { "...existing payment..." },
  "created": false,
  "enqueued": false
}
```

### `GET /v1/payments/:id`

```bash
curl http://localhost:8080/v1/payments/2d1b827e-85b4-4e3f-a631-f542289c4b7b
```

### `POST /v1/payments/:id/retry`

Re-enqueues a failed payment for reprocessing.

```bash
curl -X POST http://localhost:8080/v1/payments/2d1b827e-85b4-4e3f-a631-f542289c4b7b/retry
```

### `GET /v1/health`

```bash
curl http://localhost:8080/v1/health
```

### `GET /metrics`

Prometheus-formatted metrics (18 metrics). View them in the frontend at `/logs` or scrape directly.

---

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | method, status | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, status_class | Request latency |
| `payments_created_total` | Counter | result (new/duplicate) | Payments created |
| `payments_amount` | Histogram | — | Payment amount distribution |
| `payments_enqueued_total` | Counter | queue | Payments enqueued |
| `payments_total` | Counter | outcome | Terminal outcomes |
| `payment_retry_attempts` | Histogram | — | Retries to terminal state |
| `payments_by_status` | Gauge | status | Current payments by status |
| `outbox_events_created_total` | Counter | — | Outbox events created |
| `outbox_events_published_total` | Counter | — | Outbox events published |
| `outbox_events_failed_total` | Counter | — | Outbox publish failures |
| `outbox_events_pending` | Gauge | — | Current pending outbox events |
| `payments_reconciled_total` | Counter | — | Stuck payments re-enqueued |
| `worker_jobs_total` | Counter | queue, result | Worker jobs processed |
| `worker_job_duration_seconds` | Histogram | queue | Worker job duration |
| `asynq_queue_depth` | Gauge | queue | Pending tasks per queue |
| `provider_calls_total` | Counter | status_code | Provider HTTP calls |
| `provider_call_duration_seconds` | Histogram | outcome | Provider latency |
| `rate_limiter_denied_total` | Counter | — | Requests denied by rate limiter |
| `up` | Gauge | — | Server accepting requests |

---

## Payment States

```
pending → processing → success
                    → failed_retryable → processing (retry)
                                       → failed_final (max attempts)
```

- **pending** — Payment created, waiting to be processed
- **processing** — Worker is actively processing
- **success** — Provider accepted the payment
- **failed_retryable** — Transient error, will be retried automatically
- **failed_final** — Terminal error or max retries exhausted

---

## License

MIT
