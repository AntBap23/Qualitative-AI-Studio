create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  product_area text not null default 'General workspace',
  category text not null default 'other' check (category in ('bug', 'account', 'billing', 'feature', 'research-workflow', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text not null,
  description text not null,
  status text not null default 'triaged' check (status in ('new', 'triaged', 'waiting_on_customer', 'resolved')),
  ai_summary text not null default '',
  suggested_response text not null default '',
  next_action text not null default '',
  escalation_required boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

create index if not exists idx_support_tickets_owner_user_id on public.support_tickets(owner_user_id);
create index if not exists idx_support_tickets_study_id on public.support_tickets(study_id);
