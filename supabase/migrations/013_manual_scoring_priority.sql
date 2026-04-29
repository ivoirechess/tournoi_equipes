alter table public.matches add column if not exists updated_at timestamptz default now();

create or replace function public.recompute_match_scores(p_match_id bigint)
returns void
language plpgsql
security definer
as $$
declare
  v_score_a numeric;
  v_score_b numeric;
  v_goal_a int;
  v_goal_b int;
begin
  update public.match_boards mb
  set
    board_points_a = case
      when game_points_a is null or game_points_b is null then null
      when game_points_a > game_points_b then case when board_no = 1 then 2 else 1 end
      when game_points_a = game_points_b and game_points_a > 0 then case when board_no = 1 then 1 else 0.5 end
      else 0
    end,
    board_points_b = case
      when game_points_a is null or game_points_b is null then null
      when game_points_b > game_points_a then case when board_no = 1 then 2 else 1 end
      when game_points_a = game_points_b and game_points_a > 0 then case when board_no = 1 then 1 else 0.5 end
      else 0
    end
  where mb.match_id = p_match_id;

  select coalesce(sum(board_points_a),0), coalesce(sum(board_points_b),0), round(coalesce(sum(game_points_a-game_points_b),0))::int, round(coalesce(sum(game_points_b-game_points_a),0))::int
  into v_score_a, v_score_b, v_goal_a, v_goal_b
  from public.match_boards where match_id=p_match_id;

  update public.matches
  set score_a=v_score_a, score_b=v_score_b, goal_diff_a=v_goal_a, goal_diff_b=v_goal_b, updated_at=now()
  where id=p_match_id;
end;
$$;
