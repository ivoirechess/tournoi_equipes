import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase = createClient(
  'https://lxjxbmuspnqvetpdlubd.supabase.co',
  'sb_publishable_n8xNMYSowjMtKHeQdnnNuA_ZUIqH5m2',
);
const els = {
  standings: document.getElementById('standings'),
  matches: document.getElementById('matches'),
  bracket: document.getElementById('bracket'),
  teams: document.getElementById('teams'),
  teamShowcase: document.getElementById('team-showcase'),
  players: document.getElementById('players'),
  authForm: document.getElementById('auth-form'),
  authState: document.getElementById('auth-state'),
  adminLogout: document.getElementById('admin-logout'),
  teamForm: document.getElementById('team-form'),
  playerForm: document.getElementById('player-form'),
  rosterBox: document.getElementById('admin-rosters'),
  overrideForm: document.getElementById('override-form'),
  overrideMatch: document.getElementById('override-match'),
  playerTeam: document.getElementById('player-team'),
  drawGroups: document.getElementById('draw-groups'),
  generatePlayoffs: document.getElementById('generate-playoffs'),
  syncElo: document.getElementById('sync-elo'),
  refreshPublic: document.getElementById('refresh-public'),
  windowForm: document.getElementById('window-form'),
  windowMatch: document.getElementById('window-match'),
  syncGames: document.getElementById('sync-games'),
  adminGames: document.getElementById('admin-games'),
  swapRecommendations: document.getElementById('swap-recommendations'),
  playersTeamFilter: document.getElementById('players-team-filter'),
  playersSort: document.getElementById('players-sort'),
  teamDnd: document.getElementById('team-dnd'),
  playersSearch: document.getElementById('players-search'),
  themeToggle: document.getElementById('theme-toggle'),
  mobileMenuBtn: document.getElementById('mobile-menu-btn'),
  topNav: document.getElementById('top-nav'),
  toast: document.getElementById('toast'),
};
const state = {
  teams: [],
  players: [],
  chessCache: new Map(),
  adminSession: null,
};

for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
  });
}

const badge = (isCaptain) => (isCaptain ? '<span class="badge">👑 Capitaine</span>' : '');
const setAdminState = (message, isError = false) => {
  els.authState.textContent = message;
  els.authState.style.color = isError ? '#ff8a8a' : '';
  showToast(message, isError);
};

function showToast(message, isError = false) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.style.borderColor = isError ? '#ff7d7d88' : '';
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function applySavedTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  const theme = saved === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  if (els.themeToggle) {
    els.themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  }
}

function getSessionRole(session) {
  return session?.user?.app_metadata?.role || '';
}

function isAdminSession(session) {
  return getSessionRole(session) === 'admin';
}

function updateAdminUI(session) {
  state.adminSession = session || null;
  const isAdmin = isAdminSession(session);
  document.body.classList.toggle('admin-logged', Boolean(session));
  document.body.classList.toggle('admin-verified', isAdmin);
  if (els.authState) {
    if (!session) {
      els.authState.textContent = 'Non connecté';
      els.authState.style.color = '';
    } else if (isAdmin) {
      els.authState.textContent = `✅ Connecté comme admin (${session.user.email})`;
      els.authState.style.color = '';
    } else {
      els.authState.textContent = `⚠️ Connecté (${session.user.email}) mais sans rôle admin.`;
      els.authState.style.color = '#ffcd6b';
    }
  }
  if (els.authForm) {
    const shouldCollapse = Boolean(session) && isAdmin;
    els.authForm.classList.toggle('collapsed', shouldCollapse);
  }
}

async function requireAuthenticatedAdminAction() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAdminState(`❌ Session invalide: ${error.message}`, true);
    return false;
  }
  if (!data.session) {
    setAdminState('❌ Connecte-toi en admin avant de modifier les équipes/joueurs.', true);
    return false;
  }
  if (!isAdminSession(data.session)) {
    setAdminState('⚠️ Compte connecté sans claim admin: accès en mode éditeur authentifié.');
  }
  return true;
}

function computeFallbackStandings(teams, matches) {
  const doneMatches = (matches || []).filter((m) => m.phase === 'group' && ['finished', 'validated'].includes(m.status));
  const byPool = new Map();
  for (const team of teams || []) {
    const pool = team.pool || '—';
    if (!byPool.has(pool)) byPool.set(pool, []);
    byPool.get(pool).push({ pool, team_id: team.id, team_name: team.name, points: 0, goal_diff: 0 });
  }
  for (const match of doneMatches) {
    const teamA = [...byPool.values()].flat().find((t) => t.team_id === match.team_a_id);
    const teamB = [...byPool.values()].flat().find((t) => t.team_id === match.team_b_id);
    if (!teamA || !teamB) continue;
    const scoreA = Number(match.score_a ?? 0);
    const scoreB = Number(match.score_b ?? 0);
    if (scoreA > scoreB) teamA.points += 3;
    else if (scoreB > scoreA) teamB.points += 3;
    else {
      teamA.points += 1;
      teamB.points += 1;
    }
    teamA.goal_diff += Number(match.goal_diff_a ?? 0);
    teamB.goal_diff += Number(match.goal_diff_b ?? 0);
  }
  return [...byPool.entries()]
    .flatMap(([pool, rows]) =>
      rows
        .sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || a.team_name.localeCompare(b.team_name))
        .map((row, index) => ({ ...row, pool, rank_in_pool: index + 1 })),
    );
}

function computeFallbackTeamStrength(teams, players) {
  return (teams || []).map((team) => {
    const roster = (players || []).filter((player) => player.team_id === team.id);
    const avgPeakRapid = roster.reduce((sum, p) => sum + Number(p.peak_rapid ?? p.rapid_rating ?? 0), 0) / Math.max(roster.length, 1);
    const avgPeakBlitz = roster.reduce((sum, p) => sum + Number(p.peak_blitz ?? p.blitz_rating ?? 0), 0) / Math.max(roster.length, 1);
    const avgPeakBullet = roster.reduce((sum, p) => sum + Number(p.peak_bullet ?? p.bullet_rating ?? 0), 0) / Math.max(roster.length, 1);
    return {
      team_id: team.id,
      team_name: team.name,
      avg_peak_rapid: avgPeakRapid,
      sum_peak_global: roster.reduce((sum, p) => sum + Number(p.peak_global ?? p.peak_rapid ?? p.rapid_rating ?? 0), 0),
      strength_score: avgPeakRapid * 0.6 + avgPeakBlitz * 0.25 + avgPeakBullet * 0.15,
    };
  });
}

async function loadPublic() {
  const [{ data: standingsData, error: standingsError }, { data: matches, error: matchesError }, { data: teamsData, error: teamsError }, { data: players, error: playersError }, { data: rawTeams, error: rawTeamsError }] = await Promise.all([
    supabase.from('standings').select('*').order('pool').order('rank_in_pool'),
    supabase.from('matches').select('*,team_a:teams!matches_team_a_id_fkey(name),team_b:teams!matches_team_b_id_fkey(name)').order('scheduled_at'),
    supabase.from('team_strength').select('*').order('strength_score', { ascending: false }),
    supabase.from('players').select('id,display_name,chess_username,is_captain,team_id,rapid_rating,blitz_rating,bullet_rating,peak_rapid,peak_blitz,peak_bullet,peak_global,avatar_url,chess_title,country_code,teams(name)').order('display_name'),
    supabase.from('teams').select('id,name,pool').order('name'),
  ]);
  const firstError = matchesError || playersError || rawTeamsError;
  if (firstError) {
    setAdminState(`❌ Chargement impossible: ${firstError.message}`, true);
    return;
  }
  if (standingsError) showToast(`⚠️ Classement via vue indisponible (${standingsError.message}) → mode secours actif.`, true);
  if (teamsError) showToast(`⚠️ Force équipe via vue indisponible (${teamsError.message}) → mode secours actif.`, true);

  const standings = standingsError ? computeFallbackStandings(rawTeams || [], matches || []) : standingsData || [];
  const teams = teamsError ? computeFallbackTeamStrength(rawTeams || [], players || []) : teamsData || [];

  els.standings.classList.remove('skeleton');
  els.standings.innerHTML = !standings?.length
    ? '<p class="muted">Aucun classement disponible pour le moment.</p>'
    : `<table><thead><tr><th>Poule</th><th>Rang</th><th>Équipe</th><th>Pts</th><th>Diff</th></tr></thead><tbody>${(standings || [])
        .map((r) => `<tr><td>${r.pool}</td><td>${r.rank_in_pool}</td><td>${r.team_name}</td><td>${r.points}</td><td>${r.goal_diff}</td></tr>`)
        .join('')}</tbody></table>`;

  els.matches.classList.remove('skeleton');
  els.matches.innerHTML = !matches?.length
    ? '<p class="muted">Aucun match planifié.</p>'
    : `<table><thead><tr><th>Date</th><th>Phase</th><th>Match</th><th>Score</th><th>Statut</th></tr></thead><tbody>${(matches || [])
        .map((m) => `<tr><td>${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR') : '-'}</td><td>${m.phase}</td><td>${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</td><td>${m.score_a ?? '-'} - ${m.score_b ?? '-'}</td><td>${m.status}</td></tr>`)
        .join('')}</tbody></table>`;

  const semis = (matches || []).filter((m) => m.phase === 'semi');
  const final = (matches || []).find((m) => m.phase === 'final');
  els.bracket.classList.remove('skeleton');
  els.bracket.innerHTML = `<p>🏁 Demi 1: ${semis[0]?.team_a?.name || '?'} vs ${semis[0]?.team_b?.name || '?'}</p>
  <p>🏁 Demi 2: ${semis[1]?.team_a?.name || '?'} vs ${semis[1]?.team_b?.name || '?'}</p>
  <p>🏆 Finale: ${final?.team_a?.name || '?'} vs ${final?.team_b?.name || '?'}</p>`;

  els.teams.classList.remove('skeleton');
  const avgStrength = teams.reduce((s, t) => s + Number(t.strength_score || 0), 0) / Math.max(teams.length, 1);
  els.teams.innerHTML = (teams || [])
    .map(
      (t) => `<div class="team-card"><h3>${t.team_name}</h3><p>Force équipe: <b>${Math.round(t.strength_score || 0)}</b></p><p>Moy. peak rapid: ${Math.round(t.avg_peak_rapid || 0)}</p><p>Total peak global: ${Math.round(t.sum_peak_global || 0)}</p><p>Écart vs moyenne: ${(Number(t.strength_score || 0) - avgStrength).toFixed(1)}</p></div>`,
    )
    .join('');

  state.teams = teams || [];
  state.players = players || [];
  renderPlayersTable();
  enrichVisiblePlayersData(state.players);

  const teamFilterOptions = [`<option value="">Toutes les équipes</option>`, ...teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`)];
  els.playersTeamFilter.innerHTML = teamFilterOptions.join('');
  const options = [`<option value="">Pool joueurs disponibles (sans équipe)</option>`, ...teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`)].join('');
  els.playerTeam.innerHTML = options;
  const matchOptions = (matches || []).map((m) => `<option value="${m.id}">${m.phase} - ${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</option>`).join('');
  els.windowMatch.innerHTML = matchOptions;
  els.overrideMatch.innerHTML = matchOptions;
  renderTeamDnD(teams || [], players || []);
  renderAdminRosters(teams || [], players || []);
  renderSwapRecommendations(teams || [], players || []);
  renderTeamShowcase(teams || [], players || []);
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((part) => part[0]).join('').toUpperCase() : '♟️';
}

function avatarHTML(player, sizeClass = '') {
  if (player?.avatar_url) {
    return `<img class="avatar ${sizeClass}" src="${player.avatar_url}" alt="Photo de ${player.display_name}" loading="lazy" />`;
  }
  return `<span class="avatar fallback ${sizeClass}" aria-hidden="true">${initials(player?.display_name || '')}</span>`;
}

function effectivePeakGlobal(player) {
  return player.peak_global ?? Math.max(
    Number(player.peak_rapid ?? player.rapid_rating ?? 0),
    Number(player.peak_blitz ?? player.blitz_rating ?? 0),
    Number(player.peak_bullet ?? player.bullet_rating ?? 0),
  );
}

async function enrichVisiblePlayersData(players) {
  const missing = (players || []).filter((player) => !player.avatar_url || player.peak_global == null);
  if (!missing.length) return;
  const batch = missing.slice(0, 10);
  await Promise.all(
    batch.map(async (player) => {
      const username = player.chess_username?.trim();
      if (!username) return;
      if (state.chessCache.has(username)) {
        Object.assign(player, state.chessCache.get(username));
        return;
      }
      try {
        const [profileRes, statsRes] = await Promise.all([
          fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`),
          fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`),
        ]);
        if (!profileRes.ok && !statsRes.ok) return;
        const profile = profileRes.ok ? await profileRes.json() : {};
        const stats = statsRes.ok ? await statsRes.json() : {};
        const rapid = stats?.chess_rapid?.last?.rating ?? player.rapid_rating ?? null;
        const blitz = stats?.chess_blitz?.last?.rating ?? player.blitz_rating ?? null;
        const bullet = stats?.chess_bullet?.last?.rating ?? player.bullet_rating ?? null;
        const peakRapid = stats?.chess_rapid?.best?.rating ?? player.peak_rapid ?? rapid;
        const peakBlitz = stats?.chess_blitz?.best?.rating ?? player.peak_blitz ?? blitz;
        const peakBullet = stats?.chess_bullet?.best?.rating ?? player.peak_bullet ?? bullet;
        const merged = {
          avatar_url: player.avatar_url || profile?.avatar || null,
          country_code: player.country_code || profile?.country?.split('/').pop() || null,
          chess_title: player.chess_title || profile?.title || null,
          rapid_rating: rapid,
          blitz_rating: blitz,
          bullet_rating: bullet,
          peak_rapid: peakRapid,
          peak_blitz: peakBlitz,
          peak_bullet: peakBullet,
          peak_global: player.peak_global ?? Math.max(Number(peakRapid || 0), Number(peakBlitz || 0), Number(peakBullet || 0)),
        };
        state.chessCache.set(username, merged);
        Object.assign(player, merged);
      } catch {
        // ignore network errors (Chess.com rate limits etc.)
      }
    }),
  );
  renderPlayersTable();
  renderTeamShowcase(state.teams, state.players);
  renderTeamDnD(state.teams, state.players);
}

function renderTeamShowcase(teams, players) {
  if (!els.teamShowcase) return;
  els.teamShowcase.classList.remove('skeleton');
  if (!teams.length) {
    els.teamShowcase.innerHTML = '<p class="muted">Aucune équipe à afficher pour le moment.</p>';
    return;
  }
  const cards = teams.map((team) => {
    const roster = players.filter((p) => p.team_id === team.team_id);
    const captain = roster.find((p) => p.is_captain) || roster[0] || null;
    const topPlayers = [...roster]
      .sort((a, b) => Number(b.peak_global || b.peak_rapid || b.rapid_rating || 0) - Number(a.peak_global || a.peak_rapid || a.rapid_rating || 0))
      .slice(0, 3);
    const avgRapid = roster.reduce((sum, p) => sum + Number(p.rapid_rating || 0), 0) / Math.max(roster.length, 1);
    return `<article class="showcase-card">
      <div class="showcase-head">
        ${captain ? avatarHTML(captain) : '<span class="avatar fallback" aria-hidden="true">♟️</span>'}
        <div>
          <h3>${team.team_name}</h3>
          <p class="muted">Capitaine: ${captain?.display_name || 'Non défini'}</p>
        </div>
      </div>
      <p><b>Force équipe</b>: ${Math.round(team.strength_score || 0)}</p>
      <p><b>Moyenne rapid</b>: ${Math.round(avgRapid || 0)}</p>
      <p><b>Effectif</b>: ${roster.length} joueur(s)</p>
      <p class="muted">Top joueurs</p>
      <ul class="showcase-list">${topPlayers.map((player) => `<li>${player.display_name}${player.chess_title ? ` (${player.chess_title})` : ''} · peak ${player.peak_global ?? player.peak_rapid ?? '-'}</li>`).join('') || '<li>-</li>'}</ul>
    </article>`;
  });
  els.teamShowcase.innerHTML = cards.join('');
}

function renderTeamDnD(teams, players) {
  if (!els.teamDnd) return;
  const teamBlocks = [
    ...teams.map((team) => ({
      id: String(team.team_id),
      label: team.team_name,
      players: players.filter((player) => player.team_id === team.team_id),
    })),
    { id: 'substitutes', label: 'Substituts (sans équipe)', players: players.filter((player) => !player.team_id) },
  ];
  els.teamDnd.innerHTML = teamBlocks
    .map(
      (block) => `<section class="drop-zone" data-team-drop="${block.id}">
        <h4>${block.label}</h4>
        ${block.players
          .map(
            (player) => `<article class="dnd-player" draggable="true" data-player-id="${player.id}">
              <div class="dnd-player-head">${avatarHTML(player, 'small')} <span>${player.display_name} ${player.is_captain ? '👑' : ''}</span></div>
              <small>${player.chess_username} · peak ${effectivePeakGlobal(player) || '-'}</small>
            </article>`,
          )
          .join('')}
      </section>`,
    )
    .join('');

  for (const playerEl of els.teamDnd.querySelectorAll('[data-player-id]')) {
    playerEl.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/player-id', playerEl.dataset.playerId);
      event.dataTransfer.effectAllowed = 'move';
    });
  }
  for (const zone of els.teamDnd.querySelectorAll('[data-team-drop]')) {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async (event) => {
      event.preventDefault();
      zone.classList.remove('drag-over');
      const playerId = Number(event.dataTransfer?.getData('text/player-id'));
      const target = zone.dataset.teamDrop;
      if (!playerId || !target) return;
      const teamId = target === 'substitutes' ? null : Number(target);
      if (!(await requireAuthenticatedAdminAction())) return;
      const { error } = await supabase.from('players').update({ team_id: teamId }).eq('id', playerId);
      if (error) {
        setAdminState(`❌ Transfert impossible: ${error.message}`, true);
        return;
      }
      showToast('✅ Joueur transféré');
      await loadPublic();
    });
  }
}

function renderPlayersTable() {
  const selectedTeam = Number(els.playersTeamFilter?.value || 0);
  const sortKey = els.playersSort?.value || 'name_asc';
  const search = (els.playersSearch?.value || '').trim().toLowerCase();
  const filtered = [...state.players].filter((player) => {
    if (selectedTeam && player.team_id !== selectedTeam) return false;
    if (!search) return true;
    return player.display_name.toLowerCase().includes(search) || player.chess_username.toLowerCase().includes(search);
  });
  filtered.sort((a, b) => {
    if (sortKey === 'team_asc') {
      return (a.teams?.name || '').localeCompare(b.teams?.name || '') || a.display_name.localeCompare(b.display_name);
    }
    if (sortKey === 'rapid_desc') return Number(b.rapid_rating || 0) - Number(a.rapid_rating || 0);
    if (sortKey === 'rapid_asc') return Number(a.rapid_rating || 0) - Number(b.rapid_rating || 0);
    if (sortKey === 'peak_global_desc') return Number(b.peak_global || 0) - Number(a.peak_global || 0);
    if (sortKey === 'name_desc') return b.display_name.localeCompare(a.display_name);
    return a.display_name.localeCompare(b.display_name);
  });
  els.players.classList.remove('skeleton');
  if (!filtered.length) {
    els.players.innerHTML = '<p class="muted">Aucun joueur ne correspond aux filtres sélectionnés.</p>';
    return;
  }
  els.players.innerHTML = `<table><thead><tr><th>Joueur</th><th>Équipe</th><th>Rapid</th><th>Blitz</th><th>Bullet</th><th>Peak rapid</th><th>Peak blitz</th><th>Peak bullet</th><th>Peak global</th></tr></thead><tbody>${filtered
    .map(
      (p) => `<tr><td><div class="player-cell">${avatarHTML(p, 'small')}${p.display_name} ${badge(p.is_captain)}</div></td><td>${p.teams?.name || '-'}</td><td>${p.rapid_rating ?? '-'}</td><td>${p.blitz_rating ?? '-'}</td><td>${p.bullet_rating ?? '-'}</td><td>${p.peak_rapid ?? '-'}</td><td>${p.peak_blitz ?? '-'}</td><td>${p.peak_bullet ?? '-'}</td><td>${effectivePeakGlobal(p) || '-'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function playerStrengthValue(player) {
  const rapid = Number(player.peak_rapid ?? player.rapid_rating ?? 0);
  const blitz = Number(player.peak_blitz ?? player.blitz_rating ?? 0);
  const bullet = Number(player.peak_bullet ?? player.bullet_rating ?? 0);
  return rapid * 0.6 + blitz * 0.25 + bullet * 0.15;
}

function computeTeamStrengths(teams, players) {
  const totals = new Map();
  const counts = new Map();
  for (const team of teams) {
    totals.set(team.team_id, 0);
    counts.set(team.team_id, 0);
  }
  for (const player of players) {
    if (!player.team_id || !totals.has(player.team_id)) continue;
    totals.set(player.team_id, totals.get(player.team_id) + playerStrengthValue(player));
    counts.set(player.team_id, counts.get(player.team_id) + 1);
  }
  return new Map(
    teams.map((team) => {
      const count = counts.get(team.team_id) || 0;
      const score = count > 0 ? totals.get(team.team_id) / count : 0;
      return [team.team_id, score];
    }),
  );
}

function imbalanceScore(strengthByTeam) {
  const values = [...strengthByTeam.values()];
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return values.reduce((sum, value) => sum + Math.abs(value - avg), 0);
}

function renderSwapRecommendations(teams, players) {
  if (!els.swapRecommendations) return;
  const teamNameById = new Map(teams.map((team) => [team.team_id, team.team_name]));
  const byTeam = computeTeamStrengths(teams, players);
  const currentImbalance = imbalanceScore(byTeam);
  const movable = players.filter((player) => player.team_id && !player.is_captain);
  const recommendations = [];

  for (let i = 0; i < movable.length; i += 1) {
    for (let j = i + 1; j < movable.length; j += 1) {
      const a = movable[i];
      const b = movable[j];
      if (a.team_id === b.team_id) continue;
      const simulated = new Map(byTeam);
      const teamAPlayers = players.filter((p) => p.team_id === a.team_id).length || 1;
      const teamBPlayers = players.filter((p) => p.team_id === b.team_id).length || 1;
      const aValue = playerStrengthValue(a);
      const bValue = playerStrengthValue(b);
      simulated.set(a.team_id, simulated.get(a.team_id) + (bValue - aValue) / teamAPlayers);
      simulated.set(b.team_id, simulated.get(b.team_id) + (aValue - bValue) / teamBPlayers);
      const newImbalance = imbalanceScore(simulated);
      const improvement = currentImbalance - newImbalance;
      if (improvement <= 0) continue;
      recommendations.push({
        fromA: `${a.display_name} (${teamNameById.get(a.team_id)})`,
        fromB: `${b.display_name} (${teamNameById.get(b.team_id)})`,
        gain: improvement,
      });
    }
  }

  recommendations.sort((a, b) => b.gain - a.gain);
  const best = recommendations.slice(0, 8);

  if (!best.length) {
    els.swapRecommendations.innerHTML = '<p>Aucun swap recommandé: les équipes semblent déjà équilibrées.</p>';
    return;
  }
  els.swapRecommendations.innerHTML = `<table><thead><tr><th>Swap recommandé</th><th>Impact équilibre</th></tr></thead><tbody>${best
    .map((swap) => `<tr><td>${swap.fromA} ⇄ ${swap.fromB}</td><td>+${swap.gain.toFixed(2)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function renderAdminRosters(teams, players) {
  els.rosterBox.innerHTML = `<table><thead><tr><th>Équipe</th><th>Joueur</th><th>Cap.</th><th>Action</th></tr></thead><tbody>${
    players
      .map((p) => `<tr><td>${p.teams?.name || 'Sans équipe'}</td><td>${p.display_name} (${p.chess_username})</td><td>${p.is_captain ? 'Oui' : 'Non'}</td><td><button data-del-player="${p.id}">Supprimer joueur</button></td></tr>`)
      .join('')
  }${teams.map((t) => `<tr><td>${t.team_name}</td><td colspan="2">-</td><td><button data-del-team="${t.team_id}">Supprimer équipe</button></td></tr>`).join('')}</tbody></table>`;
  for (const b of els.rosterBox.querySelectorAll('[data-del-player]')) {
    b.onclick = async () => {
      if (!(await requireAuthenticatedAdminAction())) return;
      const { error } = await supabase.from('players').delete().eq('id', Number(b.dataset.delPlayer));
      if (error) return setAdminState(`❌ Suppression joueur impossible: ${error.message}`, true);
      await loadPublic();
    };
  }
  for (const b of els.rosterBox.querySelectorAll('[data-del-team]')) {
    b.onclick = async () => {
      if (!(await requireAuthenticatedAdminAction())) return;
      const { error } = await supabase.from('teams').delete().eq('id', Number(b.dataset.delTeam));
      if (error) return setAdminState(`❌ Suppression équipe impossible: ${error.message}`, true);
      await loadPublic();
    };
  }
}

async function loadAdminGames() {
  const { data, error } = await supabase.from('games').select('id,match_id,board_no,played_at,white_username,black_username,result,excluded,game_url').order('played_at', { ascending: false }).limit(30);
  if (error) {
    setAdminState(`❌ Impossible de charger les parties: ${error.message}`, true);
  }
  els.adminGames.innerHTML = `<table><thead><tr><th>Board</th><th>Partie</th><th>Résultat</th><th>Exclure</th></tr></thead><tbody>${(data || [])
    .map(
      (g) => `<tr><td>M${g.match_id} / #${g.board_no}</td><td><a href="${g.game_url}" target="_blank" rel="noreferrer">${g.white_username} vs ${g.black_username}</a></td><td>${g.result}</td><td><button data-exclude="${g.id}">${g.excluded ? 'Inclure' : 'Exclure'}</button></td></tr>`,
    )
    .join('')}</tbody></table>`;
  for (const b of els.adminGames.querySelectorAll('[data-exclude]')) {
    b.onclick = async () => {
      if (!(await requireAuthenticatedAdminAction())) return;
      const id = Number(b.dataset.exclude);
      const { data: game, error: gameError } = await supabase.from('games').select('excluded').eq('id', id).single();
      if (gameError) return setAdminState(`❌ Lecture partie impossible: ${gameError.message}`, true);
      const { error: updateError } = await supabase.from('games').update({ excluded: !game.excluded }).eq('id', id);
      if (updateError) return setAdminState(`❌ Mise à jour partie impossible: ${updateError.message}`, true);
      await loadAdminGames();
      await loadPublic();
    };
  }
}

els.authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return setAdminState(`❌ ${error.message}`, true);
  updateAdminUI(data.session);
  setAdminState(isAdminSession(data.session) ? '✅ Connecté' : '⚠️ Connecté, mais rôle admin manquant.');
  if (isAdminSession(data.session)) {
    e.target.classList.add('collapsed');
  }
});
els.adminLogout?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  updateAdminUI(null);
  setAdminState('Déconnecté.');
  els.authForm.classList.remove('collapsed');
});

els.teamForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await requireAuthenticatedAdminAction())) return;
  const { error } = await supabase.from('teams').insert({ name: document.getElementById('team-name').value.trim() });
  if (error) {
    setAdminState(`❌ Impossible d'ajouter l'équipe: ${error.message}`, true);
    return;
  }
  setAdminState('✅ Équipe ajoutée');
  e.target.reset();
  loadPublic();
});

els.playerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await requireAuthenticatedAdminAction())) return;
  const teamId = els.playerTeam.value ? Number(els.playerTeam.value) : null;
  const { error } = await supabase.from('players').insert({
    chess_username: document.getElementById('player-username').value,
    display_name: document.getElementById('player-name').value,
    team_id: teamId,
    is_captain: document.getElementById('player-captain').checked,
  });
  if (error) {
    setAdminState(`❌ Impossible d'ajouter le joueur: ${error.message}`, true);
    return;
  }
  setAdminState('✅ Joueur ajouté');
  e.target.reset();
  loadPublic();
});

els.drawGroups.onclick = async () => {
  if (!(await requireAuthenticatedAdminAction())) return;
  const { data: teams, error } = await supabase.from('teams').select('id');
  if (error) return setAdminState(`❌ Impossible de charger les équipes: ${error.message}`, true);
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const updates = shuffled.map((t, i) => supabase.from('teams').update({ pool: i < 3 ? 'A' : 'B' }).eq('id', t.id));
  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) return setAdminState(`❌ Tirage des poules échoué: ${firstError.message}`, true);
  alert('Poule A/B re-tirées');
  await loadPublic();
};

els.generatePlayoffs.onclick = async () => {
  if (!(await requireAuthenticatedAdminAction())) return;
  const { data, error } = await supabase.rpc('generate_playoff_matches');
  if (error) return setAdminState(`❌ Génération phase finale impossible: ${error.message}`, true);
  alert(data || 'Phases finales générées');
  await loadPublic();
};

els.syncElo.onclick = async () => {
  if (!(await requireAuthenticatedAdminAction())) return;
  const { error } = await supabase.functions.invoke('sync-player-stats');
  const message = error
    ? `Erreur sync ELO: ${error.message}. Vérifie que la fonction est bien déployée et que les CORS sont actifs.`
    : 'ELO Chess.com synchronisé';
  alert(message);
  loadPublic();
};

els.windowForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await requireAuthenticatedAdminAction())) return;
  const { error } = await supabase.from('board_windows').upsert({
    match_id: Number(els.windowMatch.value),
    board_no: Number(document.getElementById('window-board').value),
    start_at: new Date(document.getElementById('window-start').value).toISOString(),
    end_at: new Date(document.getElementById('window-end').value).toISOString(),
  });
  if (error) return setAdminState(`❌ Sauvegarde intervalle impossible: ${error.message}`, true);
  alert('Intervalle sauvegardé');
});

els.syncGames.onclick = async () => {
  if (!(await requireAuthenticatedAdminAction())) return;
  if (!els.windowMatch.value) {
    alert('Choisis un match avant de lancer la récupération des parties.');
    return;
  }
  const { error } = await supabase.functions.invoke('sync-chess-games', {
    body: { match_id: Number(els.windowMatch.value), max_games_per_board: 4 },
  });
  const message = error
    ? `Erreur import parties: ${error.message}. Si tu vois "Failed to send a request to the Edge Function", c'est souvent un problème de CORS ou de fonction non déployée.`
    : 'Parties rapides importées (max 4 par board)';
  alert(message);
  loadAdminGames();
  loadPublic();
};

els.overrideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await requireAuthenticatedAdminAction())) return;
  const { error } = await supabase
    .from('matches')
    .update({
      score_a: Number(document.getElementById('override-score-a').value),
      score_b: Number(document.getElementById('override-score-b').value),
      goal_diff_a: Number(document.getElementById('override-goal-a').value),
      goal_diff_b: Number(document.getElementById('override-goal-b').value),
      override_score: true,
      status: 'validated',
    })
    .eq('id', Number(els.overrideMatch.value));
  if (error) return setAdminState(`❌ Override impossible: ${error.message}`, true);
  alert('Override appliqué');
  await loadPublic();
});

els.refreshPublic.onclick = loadPublic;
els.playersTeamFilter?.addEventListener('change', renderPlayersTable);
els.playersSort?.addEventListener('change', renderPlayersTable);
els.playersSearch?.addEventListener('input', renderPlayersTable);
els.mobileMenuBtn?.addEventListener('click', () => {
  const expanded = els.mobileMenuBtn.getAttribute('aria-expanded') === 'true';
  els.mobileMenuBtn.setAttribute('aria-expanded', String(!expanded));
  els.topNav?.classList.toggle('open');
});
els.themeToggle?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  els.themeToggle.textContent = next === 'light' ? '☀️' : '🌙';
});

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) entry.target.classList.add('show');
  }
}, { threshold: 0.08 });
for (const block of document.querySelectorAll('.reveal')) observer.observe(block);

applySavedTheme();
const { data: authData } = await supabase.auth.getSession();
updateAdminUI(authData.session);
supabase.auth.onAuthStateChange((_event, session) => updateAdminUI(session));
setInterval(loadPublic, 60000);
await loadPublic();
await loadAdminGames();
