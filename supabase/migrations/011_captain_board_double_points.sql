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
  with board_scores as (
    select
      mb.match_id,
      mb.board_no,
      coalesce(sum(
        case
          when lower(g.white_username)=lower(pa.chess_username) then
            case g.white_result when 'win' then 1 when 'agreed' then 0.5 when 'repetition' then 0.5 when 'stalemate' then 0.5 when 'insufficient' then 0.5 when '50move' then 0.5 when 'timevsinsufficient' then 0.5 else 0 end
          else
            case g.black_result when 'win' then 1 when 'agreed' then 0.5 when 'repetition' then 0.5 when 'stalemate' then 0.5 when 'insufficient' then 0.5 when '50move' then 0.5 when 'timevsinsufficient' then 0.5 else 0 end
        end
      ),0) as gp_a,
      coalesce(sum(
        case
          when lower(g.white_username)=lower(pa.chess_username) then
            case g.black_result when 'win' then 1 when 'agreed' then 0.5 when 'repetition' then 0.5 when 'stalemate' then 0.5 when 'insufficient' then 0.5 when '50move' then 0.5 when 'timevsinsufficient' then 0.5 else 0 end
          else
            case g.white_result when 'win' then 1 when 'agreed' then 0.5 when 'repetition' then 0.5 when 'stalemate' then 0.5 when 'insufficient' then 0.5 when '50move' then 0.5 when 'timevsinsufficient' then 0.5 else 0 end
        end
      ),0) as gp_b
    from public.match_boards mb
    join public.matches m on m.id=mb.match_id
    left join public.players pa on pa.id=mb.player_a_id
    left join public.games g on g.match_id=mb.match_id and g.board_no=mb.board_no and g.excluded=false
    where mb.match_id=p_match_id
    group by mb.match_id,mb.board_no
  )
  update public.match_boards mb
  set game_points_a = bs.gp_a,
      game_points_b = bs.gp_b,
      board_points_a = case
        when bs.gp_a > bs.gp_b then case when mb.board_no = 1 then 2 else 1 end
        when bs.gp_a = bs.gp_b and bs.gp_a > 0 then case when mb.board_no = 1 then 1 else 0.5 end
        else 0
      end,
      board_points_b = case
        when bs.gp_b > bs.gp_a then case when mb.board_no = 1 then 2 else 1 end
        when bs.gp_a = bs.gp_b and bs.gp_a > 0 then case when mb.board_no = 1 then 1 else 0.5 end
        else 0
      end
  from board_scores bs
  where mb.match_id=bs.match_id and mb.board_no=bs.board_no;

  select coalesce(sum(board_points_a),0), coalesce(sum(board_points_b),0),
         round(coalesce(sum(game_points_a-game_points_b),0))::int,
         round(coalesce(sum(game_points_b-game_points_a),0))::int
    into v_score_a, v_score_b, v_goal_a, v_goal_b
  from public.match_boards
  where match_id=p_match_id;

  update public.matches
  set score_a=v_score_a,
      score_b=v_score_b,
      goal_diff_a=v_goal_a,
      goal_diff_b=v_goal_b,
      status=case when status='scheduled' then 'finished' else status end,
      updated_at=now()
  where id=p_match_id;
end;
$$;
