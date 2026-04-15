-- Ensure stored peak ratings are always at least current ratings.
update public.players
set
  peak_rapid = case
    when peak_rapid is null and rapid_rating is null then null
    else greatest(coalesce(peak_rapid, 0), coalesce(rapid_rating, 0))
  end,
  peak_blitz = case
    when peak_blitz is null and blitz_rating is null then null
    else greatest(coalesce(peak_blitz, 0), coalesce(blitz_rating, 0))
  end,
  peak_bullet = case
    when peak_bullet is null and bullet_rating is null then null
    else greatest(coalesce(peak_bullet, 0), coalesce(bullet_rating, 0))
  end,
  peak_global = case
    when peak_global is null
      and peak_rapid is null and rapid_rating is null
      and peak_blitz is null and blitz_rating is null
      and peak_bullet is null and bullet_rating is null
    then null
    else greatest(
      coalesce(peak_global, 0),
      coalesce(peak_rapid, 0), coalesce(rapid_rating, 0),
      coalesce(peak_blitz, 0), coalesce(blitz_rating, 0),
      coalesce(peak_bullet, 0), coalesce(bullet_rating, 0)
    )
  end;
