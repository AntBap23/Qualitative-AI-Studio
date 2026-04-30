create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.studies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.protocols (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  name text not null,
  shared_context text not null default '',
  interview_style_guidance text not null default '',
  consistency_rules text not null default '',
  analysis_focus text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  name text not null,
  age integer,
  job text not null default 'Professional',
  education text not null default 'Not specified',
  personality text not null default 'Not specified',
  original_text text not null default '',
  opinions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.question_guides (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  name text not null,
  content text not null,
  source_type text not null default 'text',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  question_guide_id uuid references public.question_guides(id) on delete set null,
  protocol_id uuid references public.protocols(id) on delete set null,
  responses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gioia_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  simulation_id uuid references public.simulations(id) on delete cascade,
  protocol_id uuid references public.protocols(id) on delete set null,
  markdown text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete cascade,
  transcript_id uuid references public.transcripts(id) on delete cascade,
  simulation_id uuid references public.simulations(id) on delete cascade,
  protocol_id uuid references public.protocols(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create table if not exists public.user_data_consents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('accepted', 'declined')),
  consented_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_studies_updated_at on public.studies;
create trigger trg_studies_updated_at
before update on public.studies
for each row execute function public.set_updated_at();

drop trigger if exists trg_protocols_updated_at on public.protocols;
create trigger trg_protocols_updated_at
before update on public.protocols
for each row execute function public.set_updated_at();

drop trigger if exists trg_personas_updated_at on public.personas;
create trigger trg_personas_updated_at
before update on public.personas
for each row execute function public.set_updated_at();

drop trigger if exists trg_question_guides_updated_at on public.question_guides;
create trigger trg_question_guides_updated_at
before update on public.question_guides
for each row execute function public.set_updated_at();

drop trigger if exists trg_transcripts_updated_at on public.transcripts;
create trigger trg_transcripts_updated_at
before update on public.transcripts
for each row execute function public.set_updated_at();

drop trigger if exists trg_simulations_updated_at on public.simulations;
create trigger trg_simulations_updated_at
before update on public.simulations
for each row execute function public.set_updated_at();

drop trigger if exists trg_gioia_analyses_updated_at on public.gioia_analyses;
create trigger trg_gioia_analyses_updated_at
before update on public.gioia_analyses
for each row execute function public.set_updated_at();

drop trigger if exists trg_comparisons_updated_at on public.comparisons;
create trigger trg_comparisons_updated_at
before update on public.comparisons
for each row execute function public.set_updated_at();

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_data_consents_updated_at on public.user_data_consents;
create trigger trg_user_data_consents_updated_at
before update on public.user_data_consents
for each row execute function public.set_updated_at();

create index if not exists idx_studies_owner_user_id on public.studies(owner_user_id);
create index if not exists idx_protocols_owner_user_id on public.protocols(owner_user_id);
create index if not exists idx_personas_owner_user_id on public.personas(owner_user_id);
create index if not exists idx_question_guides_owner_user_id on public.question_guides(owner_user_id);
create index if not exists idx_transcripts_owner_user_id on public.transcripts(owner_user_id);
create index if not exists idx_simulations_owner_user_id on public.simulations(owner_user_id);
create index if not exists idx_gioia_analyses_owner_user_id on public.gioia_analyses(owner_user_id);
create index if not exists idx_comparisons_owner_user_id on public.comparisons(owner_user_id);
create index if not exists idx_support_tickets_owner_user_id on public.support_tickets(owner_user_id);
create index if not exists idx_support_tickets_study_id on public.support_tickets(study_id);
create unique index if not exists idx_user_data_consents_owner_user_id on public.user_data_consents(owner_user_id);
