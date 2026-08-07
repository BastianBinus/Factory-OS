-- Applied to project eurpmeoicmiomsaviblv on 2026-08-07.
-- Kept in the repository so the schema has a history here too, not only in Supabase.

-- One row per player. The whole game state travels as a single jsonb document
-- because the client already has a versioned, self-validating save format; splitting
-- it into columns would duplicate that contract in two places that could disagree.
create table public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.game_saves is
  'Cloud save, one row per player. Conflicts between local and cloud are decided by updated_at.';

-- updated_at decides which save wins a conflict, so the client is not allowed to
-- set it. A trigger makes the database the only writer of that value.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger game_saves_touch_updated_at
  before insert or update on public.game_saves
  for each row execute function public.touch_updated_at();

alter table public.game_saves enable row level security;

-- auth.uid() is wrapped in a select so Postgres evaluates it once per statement
-- instead of once per row.
create policy "players read their own save"
  on public.game_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "players create their own save"
  on public.game_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "players update their own save"
  on public.game_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "players delete their own save"
  on public.game_saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);
