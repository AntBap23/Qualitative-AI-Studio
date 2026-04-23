create table if not exists public.user_data_consents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('accepted', 'declined')),
  consented_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_user_data_consents_updated_at on public.user_data_consents;
create trigger trg_user_data_consents_updated_at
before update on public.user_data_consents
for each row execute function public.set_updated_at();

create unique index if not exists idx_user_data_consents_owner_user_id on public.user_data_consents(owner_user_id);
