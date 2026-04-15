import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { data: players, error } = await supabase
    .from('players')
    .select('id,chess_username');
  if (error) return new Response(error.message, { status: 400, headers: corsHeaders });

  for (const player of players ?? []) {
    const normalizedUsername = player.chess_username?.trim().toLowerCase();
    if (!normalizedUsername) continue;
    const candidates = [...new Set([player.chess_username?.trim(), normalizedUsername])].filter(Boolean) as string[];
    let profile: any = {};
    let stats: any = {};
    let canonicalUsername = normalizedUsername;

    for (const candidate of candidates) {
      const [statsRes, profileRes] = await Promise.all([
        fetch(`https://api.chess.com/pub/player/${encodeURIComponent(candidate)}/stats`),
        fetch(`https://api.chess.com/pub/player/${encodeURIComponent(candidate)}`),
      ]);
      if (!statsRes.ok && !profileRes.ok) continue;
      stats = statsRes.ok ? await statsRes.json() : {};
      profile = profileRes.ok ? await profileRes.json() : {};
      canonicalUsername = String(profile?.username || candidate).trim().toLowerCase();
      break;
    }
    if (!Object.keys(stats).length && !Object.keys(profile).length) continue;
    const rapid = stats?.chess_rapid?.last?.rating ?? null;
    const blitz = stats?.chess_blitz?.last?.rating ?? null;
    const bullet = stats?.chess_bullet?.last?.rating ?? null;
    const peakRapid = Math.max(Number(stats?.chess_rapid?.best?.rating ?? 0), Number(rapid ?? 0)) || null;
    const peakBlitz = Math.max(Number(stats?.chess_blitz?.best?.rating ?? 0), Number(blitz ?? 0)) || null;
    const peakBullet = Math.max(Number(stats?.chess_bullet?.best?.rating ?? 0), Number(bullet ?? 0)) || null;
    const peakGlobal = Math.max(
      Number(peakRapid ?? 0),
      Number(peakBlitz ?? 0),
      Number(peakBullet ?? 0),
      Number(rapid ?? 0),
      Number(blitz ?? 0),
      Number(bullet ?? 0),
    ) || null;

    await supabase
      .from('players')
      .update({
        rapid_rating: rapid,
        blitz_rating: blitz,
        bullet_rating: bullet,
        peak_rapid: peakRapid,
        peak_blitz: peakBlitz,
        peak_bullet: peakBullet,
        peak_global: peakGlobal,
        chess_username: canonicalUsername,
        avatar_url: profile?.avatar ?? null,
        chess_title: profile?.title ?? null,
        country_code: typeof profile?.country === 'string' ? profile.country.split('/').pop() ?? null : null,
      })
      .eq('id', player.id);
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
});
