-- Corrige les erreurs "permission denied for view standings/team_strength"
-- et simplifie l'écriture admin via comptes authentifiés.

grant select on public.standings to anon, authenticated;
grant select on public.team_strength to anon, authenticated;
grant execute on function public.generate_playoff_matches() to authenticated;

do $$
begin
  if to_regclass('public.teams') is not null then
    execute 'drop policy if exists "admin_write_teams" on public.teams';
    execute 'drop policy if exists "authenticated_write_teams" on public.teams';
    execute 'create policy "authenticated_write_teams" on public.teams for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.players') is not null then
    execute 'drop policy if exists "admin_write_players" on public.players';
    execute 'drop policy if exists "authenticated_write_players" on public.players';
    execute 'create policy "authenticated_write_players" on public.players for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.matches') is not null then
    execute 'drop policy if exists "admin_write_matches" on public.matches';
    execute 'drop policy if exists "authenticated_write_matches" on public.matches';
    execute 'create policy "authenticated_write_matches" on public.matches for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.match_boards') is not null then
    execute 'drop policy if exists "admin_write_boards" on public.match_boards';
    execute 'drop policy if exists "authenticated_write_boards" on public.match_boards';
    execute 'create policy "authenticated_write_boards" on public.match_boards for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.board_windows') is not null then
    execute 'drop policy if exists "admin_write_windows" on public.board_windows';
    execute 'drop policy if exists "authenticated_write_windows" on public.board_windows';
    execute 'create policy "authenticated_write_windows" on public.board_windows for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.games') is not null then
    execute 'drop policy if exists "admin_write_games" on public.games';
    execute 'drop policy if exists "authenticated_write_games" on public.games';
    execute 'create policy "authenticated_write_games" on public.games for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
  if to_regclass('public.captain_tiebreak_sets') is not null then
    execute 'drop policy if exists "admin_write_tiebreak" on public.captain_tiebreak_sets';
    execute 'drop policy if exists "authenticated_write_tiebreak" on public.captain_tiebreak_sets';
    execute 'create policy "authenticated_write_tiebreak" on public.captain_tiebreak_sets for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')';
  end if;
end $$;
