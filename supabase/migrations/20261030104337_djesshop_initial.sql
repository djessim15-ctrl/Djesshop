-- Djesshop: requests and moderation data are accessible only from the server.
create table if not exists public.print_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 3 and 254),
  description text not null check (char_length(description) between 10 and 3000),
  color text not null check (color in ('Noir', 'Gris', 'Rouge', 'Rose', 'Jaune', 'Bleu', 'Vert')),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  ip inet not null,
  status text not null default 'new' check (status in ('new', 'contacted'))
);

create index if not exists print_requests_created_at_idx on public.print_requests (created_at desc);

create table if not exists public.blocked_ips (
  id uuid primary key default gen_random_uuid(),
  ip inet not null unique,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  -- Only individual addresses, never entire networks.
  constraint blocked_ips_single_address check (masklen(ip) = case family(ip) when 4 then 32 else 128 end)
);

alter table public.print_requests enable row level security;
alter table public.blocked_ips enable row level security;

-- Do not let browsers or ordinary authenticated users bypass the API.
revoke all on table public.print_requests from public, anon, authenticated;
revoke all on table public.blocked_ips from public, anon, authenticated;
grant all on table public.print_requests to service_role;
grant all on table public.blocked_ips to service_role;
