-- Multi-format platform core schema for IvoireChess

create table if not exists public.tournaments (
  id bigserial primary key,
  title text not null,
  season text,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','archived')),
  format_type text not null,
  hero_subtitle text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_registrations (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  team_id bigint references public.teams(id) on delete set null,
  captain_for_tournament boolean not null default false,
  status text not null default 'active' check (status in ('active','withdrawn','pending')),
  created_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create table if not exists public.rounds (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  round_key text not null,
  round_name text,
  sequence_no int not null,
  phase text,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_key)
);

create table if not exists public.fixtures (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  round_id bigint references public.rounds(id) on delete set null,
  home_team_id bigint references public.teams(id) on delete set null,
  away_team_id bigint references public.teams(id) on delete set null,
  white_player_id bigint references public.players(id) on delete set null,
  black_player_id bigint references public.players(id) on delete set null,
  scheduled_at timestamptz,
  venue text,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','validated','postponed','cancelled')),
  result_summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tournaments_format on public.tournaments(format_type, status);
create index if not exists idx_registrations_tournament on public.tournament_registrations(tournament_id, status);
create index if not exists idx_fixtures_tournament_schedule on public.fixtures(tournament_id, scheduled_at);

