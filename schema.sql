create table if not exists payments (
    id  uuid primary key default gen_random_uuid(),
    amount BIGINT NOT NULL,
    status text not null check (status in ('pending', 'processing', 'success', 'failed_retryable', 'failed_final')),
    idempotency_key text unique not null,
    provider_ref text,
    attempts int default 0,
    last_error text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_payments on payments(status);

create table if not exists outbox_events (
    id          uuid primary key default gen_random_uuid(),
    payment_id  uuid not null references payments(id),
    event_type  text not null default 'payment.process',
    payload     jsonb not null,
    status      text not null default 'pending' check (status in ('pending', 'published')),
    created_at  timestamptz not null default now(),
    published_at timestamptz
);

create index if not exists idx_outbox_pending on outbox_events (created_at) where status = 'pending';

create table if not exists webhook_config (
    id integer primary key default 1,
    target_url text not null,
    updated_at timestamptz default now(),
    constraint single_row check (id = 1)
);

create table if not exists webhook_deliveries (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references payments(id),
    event_type text not null,
    payload jsonb not null,
    target_url text not null,
    status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
    attempt int default 1,
    response_status int,
    response_body text,
    created_at timestamptz default now(),
    delivered_at timestamptz
);

create index if not exists idx_webhook_deliveries_pending on webhook_deliveries (created_at) where status = 'pending';
create index if not exists idx_outbox_webhook_pending on outbox_events (created_at) where event_type = 'webhook.deliver' and status = 'pending';
