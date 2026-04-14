-- Corrige les droits SQL manquants pour les opérations d'admin via PostgREST.
-- Sans ces grants, PostgreSQL renvoie "permission denied for table teams"
-- avant même l'évaluation des politiques RLS.

grant usage on schema public to authenticated, anon;

grant select on public.teams to anon, authenticated;
grant insert, update, delete on public.teams to authenticated;

grant select on public.players to anon, authenticated;
grant insert, update, delete on public.players to authenticated;

grant select on public.matches to anon, authenticated;
grant insert, update, delete on public.matches to authenticated;

grant select on public.match_boards to anon, authenticated;
grant insert, update, delete on public.match_boards to authenticated;

grant select on public.board_windows to anon, authenticated;
grant insert, update, delete on public.board_windows to authenticated;

grant select on public.games to anon, authenticated;
grant insert, update, delete on public.games to authenticated;

grant select on public.captain_tiebreak_sets to anon, authenticated;
grant insert, update, delete on public.captain_tiebreak_sets to authenticated;

-- Les colonnes identity utilisent des séquences: il faut aussi USAGE/SELECT.
grant usage, select on sequence public.teams_id_seq to authenticated;
grant usage, select on sequence public.players_id_seq to authenticated;
grant usage, select on sequence public.matches_id_seq to authenticated;
grant usage, select on sequence public.match_boards_id_seq to authenticated;
grant usage, select on sequence public.board_windows_id_seq to authenticated;
grant usage, select on sequence public.games_id_seq to authenticated;
grant usage, select on sequence public.captain_tiebreak_sets_id_seq to authenticated;
