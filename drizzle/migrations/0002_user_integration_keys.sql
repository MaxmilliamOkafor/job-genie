create table if not exists public.user_integration_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('leadocean', 'flow')),
  api_key text not null check (char_length(api_key) between 20 and 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_integration_keys enable row level security;
alter table public.user_integration_keys force row level security;

create policy "own keys: read" on public.user_integration_keys
  for select to authenticated using (auth.uid() = user_id);
create policy "own keys: insert" on public.user_integration_keys
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own keys: update" on public.user_integration_keys
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own keys: delete" on public.user_integration_keys
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.user_integration_keys from anon;
grant select, insert, update, delete on public.user_integration_keys to authenticated;