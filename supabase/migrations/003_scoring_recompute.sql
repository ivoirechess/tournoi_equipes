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
         coalesce(sum(game_points_a-game_points_b),0)::int, coalesce(sum(game_points_b-game_points_a),0)::int
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

create or replace function public.games_recompute_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.recompute_match_scores(coalesce(new.match_id, old.match_id));
  return coalesce(new,old);
end $$;

drop trigger if exists trg_recompute_on_games on public.games;
create trigger trg_recompute_on_games
after insert or update or delete on public.games
for each row execute procedure public.games_recompute_trigger();
