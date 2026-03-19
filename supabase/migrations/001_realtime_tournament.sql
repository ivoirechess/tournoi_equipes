create table if not exists public.tournament_state (
  id text primary key,
  started boolean not null default false,
  paused boolean not null default false,
  started_at timestamptz null,
  elapsed integer not null default 0,
  final_started boolean not null default false,
  final_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.boards (
  board_key text primary key,
  phase text not null check (phase in ('semi','final')),
  semi_id integer null,
  board_number integer not null,
  player1 text not null,
  player2 text not null,
  scheduled_at timestamptz null,
  paused boolean not null default false,
  games jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id bigserial primary key,
  poll_key text not null,
  voter_id text not null,
  voter_name text not null default 'Anonyme',
  winner_vote text not null,
  score_vote text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poll_votes_unique_vote unique (poll_key, voter_id)
);

create index if not exists tournament_state_updated_at_idx on public.tournament_state (updated_at desc);
create index if not exists boards_phase_semi_idx on public.boards (phase, semi_id, board_number);
create index if not exists poll_votes_poll_key_idx on public.poll_votes (poll_key);

alter table public.tournament_state replica identity full;
alter table public.boards replica identity full;
alter table public.poll_votes replica identity full;

alter table public.tournament_state enable row level security;
alter table public.boards enable row level security;
alter table public.poll_votes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_state' and policyname = 'public_read_tournament_state') then
    create policy public_read_tournament_state on public.tournament_state for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_state' and policyname = 'public_write_tournament_state') then
    create policy public_write_tournament_state on public.tournament_state for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'boards' and policyname = 'public_read_boards') then
    create policy public_read_boards on public.boards for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'boards' and policyname = 'public_write_boards') then
    create policy public_write_boards on public.boards for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'public_read_poll_votes') then
    create policy public_read_poll_votes on public.poll_votes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'public_write_poll_votes') then
    create policy public_write_poll_votes on public.poll_votes for all using (true) with check (true);
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.tournament_state;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.boards;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.poll_votes;
  exception when duplicate_object then null;
  end;
end $$;
