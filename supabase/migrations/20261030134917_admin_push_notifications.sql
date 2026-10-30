-- Push subscription endpoints are private admin data, never accessible from browsers directly.
create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;
revoke all on table public.admin_push_subscriptions from public, anon, authenticated;
grant all on table public.admin_push_subscriptions to service_role;
