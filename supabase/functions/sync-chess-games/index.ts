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

function toScore(result: string) {
  if (result === 'win') return 1;
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(result)) return 0.5;
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { match_id?: number; max_games_per_board?: number } = {};
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Corps JSON invalide' }, { status: 400, headers: corsHeaders });
  }

  const match_id = Number(payload.match_id);
  const maxGamesPerBoard = Math.max(1, Math.min(10, Number(payload.max_games_per_board ?? 4)));
  if (!Number.isFinite(match_id) || match_id <= 0) {
    return Response.json({ ok: false, error: 'match_id manquant ou invalide' }, { status: 400, headers: corsHeaders });
  }

  const { data: windows } = await supabase.from('board_windows').select('*').eq('match_id', match_id);
  const { data: boards } = await supabase
    .from('match_boards')
    .select('board_no,player_a:players!match_boards_player_a_id_fkey(chess_username),player_b:players!match_boards_player_b_id_fkey(chess_username)')
    .eq('match_id', match_id);

  for (const w of windows ?? []) {
    const b = boards?.find((x) => x.board_no === w.board_no);
    const u1 = b?.player_a?.chess_username;
    const u2 = b?.player_b?.chess_username;
    if (!u1 || !u2) continue;

    const start = new Date(w.start_at);
    const end = new Date(w.end_at);
    const monthPaths: string[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      monthPaths.push(`${cursor.getUTCFullYear()}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const archives: any[] = [];
    for (const monthPath of monthPaths) {
      const r = await fetch(`https://api.chess.com/pub/player/${u1.toLowerCase()}/games/${monthPath}`);
      if (!r.ok) continue;
      const archive = await r.json();
      archives.push(...(archive.games || []));
    }

    const games = archives
      .filter((g: any) => g.time_class === 'rapid')
      .filter((g: any) => {
        const ts = new Date(g.end_time * 1000);
        const white = g.white?.username?.toLowerCase();
        const black = g.black?.username?.toLowerCase();
        const inPair =
          (white === u1.toLowerCase() && black === u2.toLowerCase()) ||
          (white === u2.toLowerCase() && black === u1.toLowerCase());
        return inPair && ts >= new Date(w.start_at) && ts <= new Date(w.end_at);
      })
      .sort((a: any, b: any) => a.end_time - b.end_time)
      .slice(0, maxGamesPerBoard);

    let gpA = 0;
    let gpB = 0;

    for (const g of games) {
      const white = g.white.username;
      const black = g.black.username;
      const whiteScore = toScore(g.white.result);
      const blackScore = toScore(g.black.result);
      const aIsWhite = white.toLowerCase() === u1.toLowerCase();
      gpA += aIsWhite ? whiteScore : blackScore;
      gpB += aIsWhite ? blackScore : whiteScore;

      const { error: upsertError } = await supabase.from('games').upsert({
        match_id,
        board_no: w.board_no,
        played_at: new Date(g.end_time * 1000).toISOString(),
        white_username: white,
        black_username: black,
        white_result: g.white.result,
        black_result: g.black.result,
        result: `${whiteScore}-${blackScore}`,
        pgn: g.pgn,
        game_url: g.url,
        source_json: g,
      }, { onConflict: 'match_id,board_no,game_url' });
      if (upsertError) {
        return Response.json({ ok: false, error: `Erreur upsert game: ${upsertError.message}` }, { status: 400, headers: corsHeaders });
      }
    }

    await supabase
      .from('match_boards')
      .update({
        game_points_a: gpA,
        game_points_b: gpB,
        board_points_a: gpA > gpB ? 1 : gpA === gpB ? 0.5 : 0,
        board_points_b: gpB > gpA ? 1 : gpA === gpB ? 0.5 : 0,
      })
      .eq('match_id', match_id)
      .eq('board_no', w.board_no);
  }

  await supabase.rpc('recompute_match_scores', { p_match_id: match_id });

  return Response.json({ ok: true }, { headers: corsHeaders });
});
