with t as (select id,name,pool from public.teams)
insert into public.matches(phase,pool,round_no,team_a_id,team_b_id,status)
select 'group','A',1,a.id,b.id,'scheduled' from t a join t b on a.pool='A' and b.pool='A' and a.id<b.id
union all
select 'group','B',1,a.id,b.id,'scheduled' from t a join t b on a.pool='B' and b.pool='B' and a.id<b.id;

insert into public.match_boards(match_id,board_no)
select m.id, gs.board_no
from public.matches m
cross join (values (1),(2),(3),(4)) as gs(board_no)
on conflict do nothing;
