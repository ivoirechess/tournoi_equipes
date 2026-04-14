-- Force d'équipe = somme des ELO (peak_global fallback peak_rapid/rapid)
create or replace view public.team_strength as
select
  t.id as team_id,
  t.name as team_name,
  avg(coalesce(p.peak_rapid,p.rapid_rating,0)) as avg_peak_rapid,
  sum(coalesce(p.peak_global,p.peak_rapid,p.rapid_rating,0)) as sum_peak_global,
  sum(coalesce(p.peak_global,p.peak_rapid,p.rapid_rating,0))::numeric as strength_score
from public.teams t
left join public.players p on p.team_id=t.id
group by t.id,t.name;

grant select on public.team_strength to anon, authenticated;
