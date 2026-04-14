create extension if not exists pgcrypto;

create table if not exists public.teams (
  id bigint generated always as identity primary key,
  name text not null unique,
  pool text check (pool in ('A','B')),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id bigint generated always as identity primary key,
  team_id bigint references public.teams(id) on delete set null,
  chess_username text not null unique,
  display_name text not null,
  is_captain boolean not null default false,
  rapid_rating int,
  blitz_rating int,
  bullet_rating int,
  peak_rapid int,
  peak_blitz int,
  peak_bullet int,
  peak_global int,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  phase text not null check (phase in ('group','semi','final')),
  pool text check (pool in ('A','B')),
  round_no int,
  team_a_id bigint references public.teams(id) on delete cascade,
  team_b_id bigint references public.teams(id) on delete cascade,
  scheduled_at timestamptz,
  status text not null default 'scheduled',
  score_a numeric(4,2),
  score_b numeric(4,2),
  goal_diff_a int default 0,
  goal_diff_b int default 0,
  override_score boolean default false,
  winner_team_id bigint references public.teams(id),
  created_at timestamptz default now()
);

create table if not exists public.match_boards (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  board_no int not null check (board_no between 1 and 4),
  player_a_id bigint references public.players(id),
  player_b_id bigint references public.players(id),
  board_points_a numeric(3,1),
  board_points_b numeric(3,1),
  game_points_a numeric(3,1),
  game_points_b numeric(3,1),
  unique(match_id, board_no)
);

create table if not exists public.board_windows (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  board_no int not null check (board_no between 1 and 4),
  start_at timestamptz not null,
  end_at timestamptz not null,
  unique(match_id, board_no)
);

create table if not exists public.games (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  board_no int not null,
  played_at timestamptz not null,
  white_username text not null,
  black_username text not null,
  white_result text,
  black_result text,
  result text not null,
  pgn text,
  game_url text,
  excluded boolean not null default false,
  source_json jsonb,
  unique(match_id, board_no, game_url)
);

create table if not exists public.captain_tiebreak_sets (
  id bigint generated always as identity primary key,
  match_id bigint references public.matches(id) on delete cascade,
  set_no int not null,
  captain_a_score numeric(3,1) not null default 0,
  captain_b_score numeric(3,1) not null default 0,
  winner_team_id bigint references public.teams(id),
  created_at timestamptz default now(),
  unique(match_id, set_no)
);

create or replace view public.standings as
with group_matches as (
  select * from public.matches where phase='group' and status in ('finished','validated')
), team_rows as (
  select id as team_id, name as team_name, pool from public.teams
), stats as (
  select
    tr.pool,
    tr.team_id,
    tr.team_name,
    coalesce(sum(case
      when gm.team_a_id=tr.team_id and gm.score_a>gm.score_b then 3
      when gm.team_b_id=tr.team_id and gm.score_b>gm.score_a then 3
      when gm.score_a=gm.score_b then 1 else 0 end),0)::int as points,
    coalesce(sum(case when gm.team_a_id=tr.team_id then gm.goal_diff_a when gm.team_b_id=tr.team_id then gm.goal_diff_b else 0 end),0)::int as goal_diff
  from team_rows tr
  left join group_matches gm on gm.team_a_id=tr.team_id or gm.team_b_id=tr.team_id
  group by tr.pool,tr.team_id,tr.team_name
)
select pool,team_id,team_name,points,goal_diff,
  row_number() over(partition by pool order by points desc, goal_diff desc, team_name) as rank_in_pool
from stats;

create or replace view public.team_strength as
select
  t.id as team_id,
  t.name as team_name,
  avg(coalesce(p.peak_rapid,p.rapid_rating,0)) as avg_peak_rapid,
  sum(coalesce(p.peak_global,p.peak_rapid,p.rapid_rating,0)) as sum_peak_global,
  (avg(coalesce(p.peak_rapid,p.rapid_rating,0))*0.6 + avg(coalesce(p.peak_blitz,p.blitz_rating,0))*0.25 + avg(coalesce(p.peak_bullet,p.bullet_rating,0))*0.15) as strength_score
from public.teams t
left join public.players p on p.team_id=t.id
group by t.id,t.name;

create or replace function public.generate_playoff_matches()
returns text
language plpgsql
security definer
as $$
declare a1 bigint; a2 bigint; b1 bigint; b2 bigint;
begin
  select team_id into a1 from public.standings where pool='A' and rank_in_pool=1;
  select team_id into a2 from public.standings where pool='A' and rank_in_pool=2;
  select team_id into b1 from public.standings where pool='B' and rank_in_pool=1;
  select team_id into b2 from public.standings where pool='B' and rank_in_pool=2;

  delete from public.matches where phase in ('semi','final');

  if a1 is null or a2 is null or b1 is null or b2 is null then
    return 'Classements incomplets pour générer la phase finale';
  end if;

  insert into public.matches(phase,round_no,team_a_id,team_b_id,status)
  values ('semi',1,a1,b2,'scheduled'), ('semi',2,b1,a2,'scheduled');

  insert into public.matches(phase,round_no,status)
  values ('final',1,'scheduled');

  return 'Demi-finales et finale créées';
end $$;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_boards enable row level security;
alter table public.board_windows enable row level security;
alter table public.games enable row level security;
alter table public.captain_tiebreak_sets enable row level security;

create policy "public_read_teams" on public.teams for select using (true);
create policy "public_read_players" on public.players for select using (true);
create policy "public_read_matches" on public.matches for select using (true);
create policy "public_read_boards" on public.match_boards for select using (true);
create policy "public_read_windows" on public.board_windows for select using (true);
create policy "public_read_games" on public.games for select using (true);
create policy "public_read_tiebreak" on public.captain_tiebreak_sets for select using (true);

create policy "admin_write_teams" on public.teams for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_players" on public.players for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_matches" on public.matches for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_boards" on public.match_boards for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_windows" on public.board_windows for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_games" on public.games for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admin_write_tiebreak" on public.captain_tiebreak_sets for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into public.teams(name,pool) values
('Jean_daniel23','A'),('Elfirouj225','A'),('Google_maitre','A'),('Daviddigbeu','B'),('IvoireChess','B'),('yoann565','B')
on conflict (name) do nothing;

insert into public.players(team_id,chess_username,display_name,is_captain,rapid_rating,peak_rapid,peak_global)
select t.id,v.username,v.display_name,v.is_captain,v.rapid,v.rapid,v.rapid
from (values
('Jean_daniel23','Jean_daniel23','Jean_daniel23',true,2327),('Jean_daniel23','DrBlitzkill','DrBlitzkill',false,2001),('Jean_daniel23','LeoVigilant','LeoVigilant',false,1850),('Jean_daniel23','Anonyme2026','Anonyme2026',false,1500),
('Elfirouj225','Elfirouj225','Elfirouj225',true,2315),('Elfirouj225','GMinthemakinggggggg','GMinthemakinggggggg',false,1965),('Elfirouj225','Baymanchess07','Baymanchess07',false,1927),('Elfirouj225','TRANKIL225','TRANKIL225',false,1450),
('Google_maitre','Google_maitre','Google_maitre',true,2199),('Google_maitre','Sernser','Sernser',false,2068),('Google_maitre','Nantyoff_2000','Nantyoff_2000',false,2038),('Google_maitre','Death_meins','Death_meins',false,1350),
('Daviddigbeu','Daviddigbeu','Daviddigbeu',true,2198),('Daviddigbeu','Syldon','Syldon',false,2120),('Daviddigbeu','MatmasterN1','MatmasterN1',false,1959),('Daviddigbeu','Otoibelebe','Otoibelebe',false,1400),
('IvoireChess','IvoireChess','IvoireChess',true,2156),('IvoireChess','Red_Tetrix','Red_Tetrix',false,2101),('IvoireChess','Njably31','Njably31',false,1815),('IvoireChess','365Nightmare','365Nightmare',false,1603),
('yoann565','yoann565','yoann565',true,2111),('yoann565','Yaniss_ard','Yaniss_ard',false,1926),('yoann565','Novadanieldemon','Novadanieldemon',false,1815),('yoann565','loicleheros','loicleheros',false,1808),
(null,'Le_roi_Lylou','Le_roi_Lylou',false,970),(null,'willpensy','willpensy',false,1031)
) as v(team_name,username,display_name,is_captain,rapid)
left join public.teams t on t.name=v.team_name
on conflict (chess_username) do nothing;
