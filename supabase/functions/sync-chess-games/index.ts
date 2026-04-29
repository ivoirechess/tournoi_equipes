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

function toScore(result: string): number {
  if (result === 'win') return 1;
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(result)) return 0.5;
  return 0;
}

function monthPath(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= limit) {
    months.push(monthPath(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    let payload: { match_id?: number; board_no?: number; max_games?: number; time_class?: 'rapid' | 'blitz' | 'bullet' } = {};
    try {
      payload = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'Corps JSON invalide' }, { status: 400, headers: corsHeaders });
    }

    const matchId = Number(payload.match_id);
    const boardNo = Number(payload.board_no);
    const maxGames = Math.max(1, Math.min(10, Number(payload.max_games ?? 4)));
    const timeClass = ['rapid', 'blitz', 'bullet'].includes(payload.time_class || '') ? payload.time_class! : 'rapid';

    if (!Number.isFinite(matchId) || matchId <= 0) {
      return Response.json({ ok: false, error: 'match_id manquant ou invalide' }, { status: 400, headers: corsHeaders });
    }
    if (!Number.isInteger(boardNo) || boardNo < 1 || boardNo > 5) {
      return Response.json({ ok: false, error: 'board_no manquant ou invalide (1..5)' }, { status: 400, headers: corsHeaders });
    }

    const { data: board, error: boardError } = await supabase
      .from('match_boards')
      .select('board_no,player_a_id,player_b_id,player_a:players!match_boards_player_a_id_fkey(chess_username),player_b:players!match_boards_player_b_id_fkey(chess_username)')
      .eq('match_id', matchId)
      .eq('board_no', boardNo)
      .single();

    if (boardError || !board) {
      return Response.json({ ok: false, error: boardError?.message || `Échiquier ${boardNo} introuvable` }, { status: 400, headers: corsHeaders });
    }

    const u1 = board?.player_a?.chess_username?.trim().toLowerCase();
    const u2 = board?.player_b?.chess_username?.trim().toLowerCase();
    if (!board.player_a_id || !board.player_b_id || !u1 || !u2) {
      return Response.json(
        { ok: false, error: `Appariement incomplet sur l'échiquier ${boardNo}: ${u1 || '?'} vs ${u2 || '?'}. Définis les deux joueurs avant l'import.` },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id,scheduled_at,match_started_at,match_ended_at')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      return Response.json({ ok: false, error: matchError?.message || `Match ${matchId} introuvable` }, { status: 400, headers: corsHeaders });
    }

    const scheduledAt = match.scheduled_at ? new Date(match.scheduled_at) : null;
    const matchStartedAt = match.match_started_at ? new Date(match.match_started_at) : null;
    const matchEndedAt = match.match_ended_at ? new Date(match.match_ended_at) : null;

    if (!matchStartedAt && !scheduledAt) {
      return Response.json({ ok: false, error: "Le match n'a ni match_started_at ni scheduled_at. Planifie le match avant import." }, { status: 400, headers: corsHeaders });
    }

    const anchor = matchStartedAt || scheduledAt!;
    const windowStart = matchStartedAt || new Date(anchor.getTime() - 60 * 60 * 1000);
    const windowEnd = matchEndedAt || new Date(anchor.getTime() + 12 * 60 * 60 * 1000);

    const monthPaths = monthsBetween(windowStart, windowEnd);
    const archiveGames: any[] = [];
    const seenFetchKeys = new Set<string>();

    for (const path of monthPaths) {
      for (const username of [u1, u2]) {
        const fetchKey = `${username}/${path}`;
        if (seenFetchKeys.has(fetchKey)) continue;
        seenFetchKeys.add(fetchKey);
        const r = await fetch(`https://api.chess.com/pub/player/${username}/games/${path}`);
        if (!r.ok) continue;
        const archive = await r.json();
        archiveGames.push(...(archive.games || []));
      }
    }

    const dedupedGames = Array.from(new Map((archiveGames || []).map((g: any) => [String(g?.url || ''), g])).values());
    const windowStartSec = Math.floor(windowStart.getTime() / 1000);
    const windowEndSec = Math.floor(windowEnd.getTime() / 1000);

    const selectedGames = dedupedGames
      .filter((g: any) => g?.time_class === timeClass)
      .filter((g: any) => {
        const white = String(g?.white?.username || '').toLowerCase();
        const black = String(g?.black?.username || '').toLowerCase();
        return (white === u1 && black === u2) || (white === u2 && black === u1);
      })
      .filter((g: any) => Number(g?.end_time) >= windowStartSec && Number(g?.end_time) <= windowEndSec)
      .sort((a: any, b: any) => Number(b.end_time) - Number(a.end_time))
      .slice(0, maxGames)
      .sort((a: any, b: any) => Number(a.end_time) - Number(b.end_time));

    for (const g of selectedGames) {
      const white = String(g?.white?.username || '');
      const black = String(g?.black?.username || '');
      if (!white || !black || !g?.url) continue;
      const whiteScore = toScore(String(g?.white?.result || ''));
      const blackScore = toScore(String(g?.black?.result || ''));

      const { error: upsertError } = await supabase.from('games').upsert({
        match_id: matchId,
        board_no: boardNo,
        played_at: new Date(Number(g.end_time) * 1000).toISOString(),
        white_username: white,
        black_username: black,
        white_result: g?.white?.result,
        black_result: g?.black?.result,
        result: `${whiteScore}-${blackScore}`,
        pgn: g?.pgn || null,
        game_url: g?.url,
        source_json: g,
      }, { onConflict: 'match_id,board_no,game_url' });

      if (upsertError) {
        return Response.json({ ok: false, error: `Erreur upsert game: ${upsertError.message}` }, { status: 400, headers: corsHeaders });
      }
    }

    const { error: recomputeError } = await supabase.rpc('recompute_match_scores', { p_match_id: matchId });
    if (recomputeError) {
      return Response.json({ ok: false, error: `Erreur recompute_match_scores: ${recomputeError.message}` }, { status: 400, headers: corsHeaders });
    }

    return Response.json({
      ok: true,
      match_id: matchId,
      board_no: boardNo,
      imported_games: selectedGames.length,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      players: { a: u1, b: u2 },
      time_class: timeClass,
    }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: `Erreur interne sync-chess-games: ${message}` }, { status: 500, headers: corsHeaders });
  }
});
