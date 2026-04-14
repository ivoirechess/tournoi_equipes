-- Hardening idempotent: sécurité RLS + robustesse scoring + cohérence permissions.
-- Cette migration est safe si certaines tables/fonctions/policies existent déjà.

-- 1) Recompute scoring: éviter la troncature silencieuse des demi-points.
create or replace function public.recompute_match_scores(p_match_id bigint)
returns void
language plpgsql
security definer
as $$
declare v_score_a numeric; v_score_b numeric; v_goal_a int; v_goal_b int;
begin
  with board_scores as (
    select
      mb.match_id,
      mb.board_no,
      coalesce(sum(case
        when lower(g.white_username)=lower(pa.chess_username) then case when g.white_result='win' then 1 when g.white_result in ('agreed','repetition','stalemate','insufficient','50move','timevsinsufficient') then 0.5 else 0 end
        when lower(g.black_username)=lower(pa.chess_username) then case when g.black_result='win' then 1 when g.black_result in ('agreed','repetition','stalemate','insufficient','50move','timevsinsufficient') then 0.5 else 0 end
        else 0 end),0) as gp_a,
      coalesce(sum(case
        when lower(g.white_username)=lower(pb.chess_username) then case when g.white_result='win' then 1 when g.white_result in ('agreed','repetition','stalemate','insufficient','50move','timevsinsufficient') then 0.5 else 0 end
        when lower(g.black_username)=lower(pb.chess_username) then case when g.black_result='win' then 1 when g.black_result in ('agreed','repetition','stalemate','insufficient','50move','timevsinsufficient') then 0.5 else 0 end
        else 0 end),0) as gp_b
    from public.match_boards mb
    left join public.players pa on pa.id=mb.player_a_id
    left join public.players pb on pb.id=mb.player_b_id
    left join public.games g on g.match_id=mb.match_id and g.board_no=mb.board_no and g.excluded=false
    where mb.match_id=p_match_id
    group by mb.match_id,mb.board_no
  )
  update public.match_boards mb
  set game_points_a = bs.gp_a,
      game_points_b = bs.gp_b,
      board_points_a = case when bs.gp_a > bs.gp_b then 1 when bs.gp_a = bs.gp_b and bs.gp_a > 0 then 0.5 else 0 end,
      board_points_b = case when bs.gp_b > bs.gp_a then 1 when bs.gp_a = bs.gp_b and bs.gp_a > 0 then 0.5 else 0 end
  from board_scores bs
  where mb.match_id=bs.match_id and mb.board_no=bs.board_no;

  select coalesce(sum(board_points_a),0), coalesce(sum(board_points_b),0),
         round(coalesce(sum(game_points_a-game_points_b),0))::int,
         round(coalesce(sum(game_points_b-game_points_a),0))::int
    into v_score_a, v_score_b, v_goal_a, v_goal_b
  from public.match_boards
  where match_id=p_match_id;

  update public.matches
  set score_a = case when override_score then score_a else v_score_a end,
      score_b = case when override_score then score_b else v_score_b end,
      goal_diff_a = case when override_score then goal_diff_a else v_goal_a end,
      goal_diff_b = case when override_score then goal_diff_b else v_goal_b end
  where id=p_match_id;
end $$;

-- 2) Renforcer les policies core tournoi avec gardes IF EXISTS.
do $$
begin
  if to_regclass('public.teams') is not null then
    alter table public.teams enable row level security;
    execute 'drop policy if exists "public_read_teams" on public.teams';
    execute 'drop policy if exists "admin_write_teams" on public.teams';
    execute 'create policy "public_read_teams" on public.teams for select using (true)';
    execute 'create policy "admin_write_teams" on public.teams for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.players') is not null then
    alter table public.players enable row level security;
    execute 'drop policy if exists "public_read_players" on public.players';
    execute 'drop policy if exists "admin_write_players" on public.players';
    execute 'create policy "public_read_players" on public.players for select using (true)';
    execute 'create policy "admin_write_players" on public.players for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.matches') is not null then
    alter table public.matches enable row level security;
    execute 'drop policy if exists "public_read_matches" on public.matches';
    execute 'drop policy if exists "admin_write_matches" on public.matches';
    execute 'create policy "public_read_matches" on public.matches for select using (true)';
    execute 'create policy "admin_write_matches" on public.matches for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.match_boards') is not null then
    alter table public.match_boards enable row level security;
    execute 'drop policy if exists "public_read_boards" on public.match_boards';
    execute 'drop policy if exists "admin_write_boards" on public.match_boards';
    execute 'create policy "public_read_boards" on public.match_boards for select using (true)';
    execute 'create policy "admin_write_boards" on public.match_boards for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.board_windows') is not null then
    alter table public.board_windows enable row level security;
    execute 'drop policy if exists "public_read_windows" on public.board_windows';
    execute 'drop policy if exists "admin_write_windows" on public.board_windows';
    execute 'create policy "public_read_windows" on public.board_windows for select using (true)';
    execute 'create policy "admin_write_windows" on public.board_windows for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.games') is not null then
    alter table public.games enable row level security;
    execute 'drop policy if exists "public_read_games" on public.games';
    execute 'drop policy if exists "admin_write_games" on public.games';
    execute 'create policy "public_read_games" on public.games for select using (true)';
    execute 'create policy "admin_write_games" on public.games for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.captain_tiebreak_sets') is not null then
    alter table public.captain_tiebreak_sets enable row level security;
    execute 'drop policy if exists "public_read_tiebreak" on public.captain_tiebreak_sets';
    execute 'drop policy if exists "admin_write_tiebreak" on public.captain_tiebreak_sets';
    execute 'create policy "public_read_tiebreak" on public.captain_tiebreak_sets for select using (true)';
    execute 'create policy "admin_write_tiebreak" on public.captain_tiebreak_sets for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;
end $$;

-- 3) Ligues (script 004): rétrécir les policies permissives si les tables existent.
do $$
begin
  if to_regclass('public.saisons') is not null then
    alter table public.saisons enable row level security;
    execute 'drop policy if exists "Saisons write authenticated" on public.saisons';
    execute 'drop policy if exists "Saisons write admin" on public.saisons';
    execute 'create policy "Saisons write admin" on public.saisons for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.divisions') is not null then
    alter table public.divisions enable row level security;
    execute 'drop policy if exists "Divisions write authenticated" on public.divisions';
    execute 'drop policy if exists "Divisions write admin" on public.divisions';
    execute 'create policy "Divisions write admin" on public.divisions for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.participations_ligue') is not null then
    alter table public.participations_ligue enable row level security;
    execute 'drop policy if exists "Participation update authenticated" on public.participations_ligue';
    execute 'drop policy if exists "Participation update admin" on public.participations_ligue';
    execute 'create policy "Participation update admin" on public.participations_ligue for update using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;

  if to_regclass('public.matchs_ligue') is not null then
    alter table public.matchs_ligue enable row level security;
    execute 'drop policy if exists "Matchs write authenticated" on public.matchs_ligue';
    execute 'drop policy if exists "Matchs write admin" on public.matchs_ligue';
    execute 'create policy "Matchs write admin" on public.matchs_ligue for all using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')';
  end if;
end $$;

-- 4) Grants: garantir permissions SQL minimales pour PostgREST (idempotent).
grant usage on schema public to authenticated, anon;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['teams','players','matches','match_boards','board_windows','games','captain_tiebreak_sets']
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('grant select on public.%I to anon, authenticated', tbl);
      execute format('grant insert, update, delete on public.%I to authenticated', tbl);
    end if;
  end loop;
end $$;

-- Séquences identity: ne pas échouer si absentes.
do $$
declare
  seq_name text;
begin
  foreach seq_name in array array[
    'teams_id_seq','players_id_seq','matches_id_seq','match_boards_id_seq','board_windows_id_seq','games_id_seq','captain_tiebreak_sets_id_seq'
  ]
  loop
    if to_regclass('public.' || seq_name) is not null then
      execute format('grant usage, select on sequence public.%I to authenticated', seq_name);
    end if;
  end loop;
end $$;
