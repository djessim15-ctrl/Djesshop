-- One optional image per request. Objects themselves live in a private Storage bucket.
alter table public.print_requests add column if not exists photo_path text;
alter table public.print_requests add constraint print_requests_photo_path_check
  check (photo_path is null or photo_path = id::text || '.webp');

-- Keep the per-IP limit on photo submissions inexpensive.
create index if not exists print_requests_photo_ip_created_idx
  on public.print_requests (ip, created_at desc) where photo_path is not null;
