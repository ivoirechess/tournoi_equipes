-- 012: fenêtre temporelle pour matchs + support 5 échiquiers + index utiles.

-- 1) Étendre la contrainte board_no à [1..5] (au lieu de [1..4]).
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'match_boards'
      and constraint_type = 'CHECK' and constraint_name = 'match_boards_board_no_check'
  ) then
    execute 'alter table public.match_boards drop constraint match_boards_board_no_check';
  end if;
  execute 'alter table public.match_boards add constraint match_boards_board_no_check check (board_no between 1 and 5)';

  if to_regclass('public.board_windows') is not null then
    if exists (
      select 1 from information_schema.table_constraints
      where table_schema = 'public' and table_name = 'board_windows'
        and constraint_type = 'CHECK' and constraint_name = 'board_windows_board_no_check'
    ) then
      execute 'alter table public.board_windows drop constraint board_windows_board_no_check';
    end if;
    execute 'alter table public.board_windows add constraint board_windows_board_no_check check (board_no between 1 and 5)';
  end if;
end $$;

-- 2) Fenêtre temporelle pour les matchs.
alter table if exists public.matches
  add column if not exists match_started_at timestamptz,
  add column if not exists match_ended_at timestamptz;

-- 3) Compléter à 5 échiquiers les matchs existants qui n'en ont que 4.
insert into public.match_boards (match_id, board_no)
select m.id, n.board_no
from public.matches m
cross join (values (1),(2),(3),(4),(5)) as n(board_no)
left join public.match_boards mb on mb.match_id = m.id and mb.board_no = n.board_no
where mb.id is null
on conflict do nothing;

-- 4) Index utiles.
create index if not exists idx_games_match_board on public.games (match_id, board_no);
create index if not exists idx_match_boards_match on public.match_boards (match_id);
create index if not exists idx_matches_window on public.matches (match_started_at, match_ended_at);
