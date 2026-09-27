create table if not exists public.studio_characters (
  id text primary key,
  name text not null,
  identity jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_workspaces (
  user_email text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('studio-media', 'studio-media', false)
on conflict (id) do nothing;

create table if not exists public.studio_generations (
  id text primary key,
  job_id text,
  character_id text references public.studio_characters(id) on delete set null,
  provider text not null,
  model text not null,
  model_version text,
  prompt text,
  negative_prompt text,
  seed text,
  parameters jsonb not null default '{}'::jsonb,
  output jsonb,
  labels jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.studio_characters enable row level security;
alter table public.studio_generations enable row level security;
alter table public.studio_workspaces enable row level security;

drop policy if exists "service role manages studio workspaces" on public.studio_workspaces;
create policy "service role manages studio workspaces"
on public.studio_workspaces
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role manages studio characters" on public.studio_characters;
create policy "service role manages studio characters"
on public.studio_characters
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role manages studio generations" on public.studio_generations;
create policy "service role manages studio generations"
on public.studio_generations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
