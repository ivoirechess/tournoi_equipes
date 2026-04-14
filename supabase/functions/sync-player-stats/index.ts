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
    const [statsRes, profileRes] = await Promise.all([
      fetch(`https://api.chess.com/pub/player/${normalizedUsername}/stats`),
      fetch(`https://api.chess.com/pub/player/${normalizedUsername}`),
    ]);
    if (!statsRes.ok) continue;
    const stats = await statsRes.json();
    const profile = profileRes.ok ? await profileRes.json() : {};
    const rapid = stats?.chess_rapid?.last?.rating ?? null;
    const blitz = stats?.chess_blitz?.last?.rating ?? null;
    const bullet = stats?.chess_bullet?.last?.rating ?? null;
    const peakRapid = stats?.chess_rapid?.best?.rating ?? rapid;
    const peakBlitz = stats?.chess_blitz?.best?.rating ?? blitz;
    const peakBullet = stats?.chess_bullet?.best?.rating ?? bullet;
    const peakGlobal = Math.max(peakRapid || 0, peakBlitz || 0, peakBullet || 0) || null;

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
        avatar_url: profile?.avatar ?? null,
        chess_title: profile?.title ?? null,
        country_code: typeof profile?.country === 'string' ? profile.country.split('/').pop() ?? null : null,
      })
      .eq('id', player.id);
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
});
