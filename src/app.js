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
      playerTeam: document.getElementById('player-team'),
  drawGroups: document.getElementById('draw-groups'),
  generatePlayoffs: document.getElementById('generate-playoffs'),
  syncElo: document.getElementById('sync-elo'),
  refreshPublic: document.getElementById('refresh-public'),
          scheduleWindowStart: document.getElementById('schedule-window-start'),
  scheduleWindowEnd: document.getElementById('schedule-window-end'),
  createMatchForm: document.getElementById('create-match-form'),
  createMatchPhase: document.getElementById('create-match-phase'),
  createMatchTeamA: document.getElementById('create-match-team-a'),
  createMatchTeamB: document.getElementById('create-match-team-b'),
  createMatchAt: document.getElementById('create-match-at'),
  bulkCreatePoolMatches: document.getElementById('bulk-create-pool-matches'),
        playersTeamFilter: document.getElementById('players-team-filter'),
  playersSort: document.getElementById('players-sort'),
  tournamentCadence: document.getElementById('tournament-cadence'),
  teamDnd: document.getElementById('team-dnd'),
  playersSearch: document.getElementById('players-search'),
  resultsMatch: document.getElementById('results-match'),
  resultsScheduledAt: document.getElementById('results-scheduled-at'),
  resultsStatus: document.getElementById('results-status'),
  resultsBoards: document.getElementById('results-boards'),
  resultsSummary: document.getElementById('results-summary'),
  resultsSave: document.getElementById('results-save'),
  resultsReset: document.getElementById('results-reset'),
  resultsPairingWarning: document.getElementById('results-pairing-warning'),
  summaryTeamAName: document.getElementById('summary-team-a-name'),
  summaryTeamBName: document.getElementById('summary-team-b-name'),
  summaryScoreA: document.getElementById('summary-score-a'),
  summaryScoreB: document.getElementById('summary-score-b'),
  summaryDiffA: document.getElementById('summary-diff-a'),
  summaryDiffB: document.getElementById('summary-diff-b'),
  summaryProgress: document.getElementById('summary-progress'),
  heroStatus: document.getElementById('hero-status'),
  heroTitle: document.getElementById('hero-title'),
  heroFormatSummary: document.getElementById('hero-format-summary'),
  heroNextMatch: document.getElementById('hero-next-match'),
  heroNextTimer: document.getElementById('hero-next-timer'),
  summaryDashboard: document.getElementById('summary-dashboard'),
  featuredMatch: document.getElementById('featured-match'),
  matchesTabs: document.getElementById('matches-tabs'),
  themeToggle: document.getElementById('theme-toggle'),
  mobileMenuBtn: document.getElementById('mobile-menu-btn'),
  topNav: document.getElementById('top-nav'),
  toast: document.getElementById('toast'),
  clubLogo: document.getElementById('club-logo'),
  clubLogoFallback: document.getElementById('club-logo-fallback'),
};
const state = {
  teams: [],
  players: [],
  chessCache: new Map(),
  pendingCache: new Set(),
  adminSession: null,
  tournamentCadence: 'rapid',
  matchFilter: 'all',
  matches: [],
  rawTeams: [],
  sharedAdminUnlocked: false,
  selectedMatchId: null,
  matchBoards: [],
  resultsContext: null,
};

for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
  });
}

for (const btn of document.querySelectorAll('[data-tab-link]')) {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tabLink;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `${tab}-tab`));
  });
}

const badge = (isCaptain) => (isCaptain ? '<span class="badge">👑 Capitaine</span>' : '');
const CADENCE_LABELS = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' };
const SHARED_ADMIN_PASSWORD = 'ADMIN1234';

function selectedCadence() {
  const value = els.tournamentCadence?.value || state.tournamentCadence || 'rapid';
  if (!['rapid', 'blitz', 'bullet'].includes(value)) return 'rapid';
  return value;
}

function ratingField(cadence) {
  return `${cadence}_rating`;
}

function peakField(cadence) {
  return `peak_${cadence}`;
}

function cadenceRating(player, cadence = selectedCadence()) {
  return player?.[ratingField(cadence)] ?? null;
}

function cadencePeak(player, cadence = selectedCadence()) {
  const peakValue = player?.[peakField(cadence)];
  const currentValue = cadenceRating(player, cadence);
  return Math.max(Number(peakValue ?? 0), Number(currentValue ?? 0)) || null;
}

/**
 * Calcule l'appariement attendu pour un match donné.
 * Retourne { boards: [{board_no, player_a_id, player_b_id}], errors: [string] }.
 * Si errors non vide, l'appariement n'est PAS valide pour import.
 */
function computeAutoPairing(teamAPlayers, teamBPlayers, cadence) {
  const errors = [];

  function rosterFor(label, players) {
    const captain = players.find((p) => p.is_captain);
    if (!captain) {
      errors.push(`Équipe ${label}: aucun capitaine désigné.`);
      return null;
    }
    if (players.length < 5) {
      errors.push(`Équipe ${label}: ${players.length} joueur(s), 5 minimum requis.`);
      return null;
    }
    const others = players
      .filter((p) => p.id !== captain.id)
      .slice()
      .sort((a, b) => {
        const pa = Number(cadencePeak(a, cadence) || 0);
        const pb = Number(cadencePeak(b, cadence) || 0);
        if (pb !== pa) return pb - pa;
        return (a.display_name || '').localeCompare(b.display_name || '');
      })
      .slice(0, 4);
    return [captain, ...others];
  }

  const lineupA = rosterFor('A', teamAPlayers);
  const lineupB = rosterFor('B', teamBPlayers);
  if (errors.length) return { boards: [], errors };

  const boards = [1, 2, 3, 4, 5].map((boardNo, i) => ({
    board_no: boardNo,
    player_a_id: lineupA[i].id,
    player_b_id: lineupB[i].id,
    player_a: lineupA[i],
    player_b: lineupB[i],
  }));
  return { boards, errors: [] };
}

function updatePlayersSortLabels() {
  const label = CADENCE_LABELS[selectedCadence()];
  if (!els.playersSort) return;
  const desc = els.playersSort.querySelector('option[value="rapid_desc"]');
  const asc = els.playersSort.querySelector('option[value="rapid_asc"]');
  const peak = els.playersSort.querySelector('option[value="peak_global_desc"]');
  if (desc) desc.textContent = `ELO ${label} ↓`;
  if (asc) asc.textContent = `ELO ${label} ↑`;
  if (peak) peak.textContent = `Peak ${label.toLowerCase()} ↓`;
}

function populateMatchSelectors(matches = []) {
  const hasMatches = matches.length > 0;
  const options = hasMatches
    ? matches.map((m) => `<option value="${m.id}">${m.phase} - ${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</option>`)
    : ['<option value="">Aucun match disponible (crée/génère les matchs d’abord)</option>'];
  const markup = options.join('');

  if (els.resultsMatch) {
    els.resultsMatch.innerHTML = markup;
    els.resultsMatch.disabled = !hasMatches;
    if (hasMatches) loadResultsForMatch(String(matches[0].id));
  }
}

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
  const sharedAdmin = Boolean(state.sharedAdminUnlocked);
  const isAdmin = sharedAdmin || isAdminSession(session);
  document.body.classList.toggle('admin-logged', Boolean(session) || sharedAdmin);
  document.body.classList.toggle('admin-verified', isAdmin);
  if (els.authState) {
    if (sharedAdmin) {
      els.authState.textContent = '✅ Connecté en mode admin partagé';
      els.authState.style.color = '#7ef2b8';
    } else if (!session) {
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
    const shouldCollapse = (Boolean(session) || sharedAdmin) && isAdmin;
    els.authForm.classList.toggle('collapsed', shouldCollapse);
  }
}

async function requireAuthenticatedAdminAction() {
  if (state.sharedAdminUnlocked) return true;
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
    const sumPeakGlobal = roster.reduce((sum, p) => sum + Number(p.peak_global ?? p.peak_rapid ?? p.rapid_rating ?? 0), 0);
    const avgPeakRapid = roster.reduce((sum, p) => sum + Number(p.peak_rapid ?? p.rapid_rating ?? 0), 0) / Math.max(roster.length, 1);
    return {
      team_id: team.id,
      team_name: team.name,
      avg_peak_rapid: avgPeakRapid,
      sum_peak_global: sumPeakGlobal,
      strength_score: sumPeakGlobal,
    };
  });
}

function splitPoolsForDisplay(standings) {
  const grouped = new Map();
  for (const row of standings || []) {
    const pool = row.pool || '—';
    if (!grouped.has(pool)) grouped.set(pool, []);
    grouped.get(pool).push(row);
  }
  return grouped;
}

function matchStatusCategory(match) {
  const status = (match?.status || '').toLowerCase();
  if (status === 'live' || status === 'playing') return 'live';
  if (status === 'finished' || status === 'validated') return 'completed';
  return 'upcoming';
}

function matchStatusLabel(match) {
  const category = matchStatusCategory(match);
  if (category === 'live') return 'En cours';
  if (category === 'completed') return 'Terminé';
  return 'À venir';
}

function formatMatchDate(dateValue) {
  if (!dateValue) return 'Date à confirmer';
  return new Date(dateValue).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function findNextFeaturedMatch(matches) {
  const now = Date.now();
  const sorted = [...(matches || [])].sort((a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime());
  const live = sorted.find((match) => matchStatusCategory(match) === 'live');
  if (live) return live;
  const upcoming = sorted.find((match) => {
    const timestamp = new Date(match.scheduled_at || 0).getTime();
    return timestamp >= now && matchStatusCategory(match) === 'upcoming';
  });
  if (upcoming) return upcoming;
  return null;
}

function renderHeroAndSummary(standings, matches, teams) {
  const totalTeams = teams?.length || 0;
  const pools = new Set((teams || []).map((team) => team.pool).filter(Boolean));
  const boards = 5;
  const featured = findNextFeaturedMatch(matches);
  const featuredTeams = featured ? `${featured.team_a?.name || '?'} vs ${featured.team_b?.name || '?'}` : 'Aucun match à venir';
  const featuredDate = featured ? formatMatchDate(featured.scheduled_at) : 'Calendrier terminé';
  const hasLive = (matches || []).some((match) => matchStatusCategory(match) === 'live');
  const hasUpcoming = (matches || []).some((match) => matchStatusCategory(match) === 'upcoming');
  const status = hasLive ? 'live' : hasUpcoming ? 'scheduled' : 'finished';
  const leadersByPool = new Map();
  for (const row of standings || []) {
    if (!leadersByPool.has(row.pool) || Number(row.rank_in_pool) === 1) leadersByPool.set(row.pool, row);
  }
  const leaderA = leadersByPool.get('A');
  const leaderB = leadersByPool.get('B');

  if (els.heroStatus) {
    els.heroStatus.className = `status-badge status-${status}`;
    els.heroStatus.textContent = status === 'live' ? 'EN COURS' : status === 'scheduled' ? 'À VENIR' : 'TERMINÉ';
  }
  if (els.heroFormatSummary) {
    els.heroFormatSummary.textContent = `Format: ${totalTeams} équipes · ${Math.max(pools.size, 2)} poules · ${boards} échiquiers par match (5-4-3 samedi 19h, 2-1 dimanche 19h).`;
  }
  if (els.heroNextMatch) {
    els.heroNextMatch.classList.remove('skeleton');
    els.heroNextMatch.innerHTML = `<article class="match-feature-card">
      <h4>Match en lumière</h4>
      <p class="teams">${featuredTeams}</p>
      <p class="muted">${featuredDate} · ${featured ? matchStatusLabel(featured) : 'Aucun match à venir'}</p>
    </article>`;
  }
  if (els.heroNextTimer) {
    els.heroNextTimer.textContent = featured ? formatMatchDate(featured.scheduled_at) : 'Calendrier terminé';
  }
  if (els.summaryDashboard) {
    els.summaryDashboard.classList.remove('skeleton');
    els.summaryDashboard.innerHTML = `
      <article class="stat-tile"><p class="stat-label">Leader Poule A</p><p class="stat-value">${leaderA?.team_name || '—'}</p><p class="stat-context">${leaderA ? `${leaderA.points} pts · diff ${leaderA.goal_diff}` : 'Aucun score'}</p></article>
      <article class="stat-tile"><p class="stat-label">Leader Poule B</p><p class="stat-value">${leaderB?.team_name || '—'}</p><p class="stat-context">${leaderB ? `${leaderB.points} pts · diff ${leaderB.goal_diff}` : 'Aucun score'}</p></article>
      <article class="stat-tile"><p class="stat-label">Prochain match</p><p class="stat-value">${featuredTeams}</p><p class="stat-context">${featuredDate}</p></article>
      <article class="stat-tile"><p class="stat-label">Champion en titre</p><p class="stat-value">yoann565</p><p class="stat-context">Référence de la saison précédente</p></article>
    `;
  }
  if (els.featuredMatch) {
    els.featuredMatch.classList.remove('skeleton');
    els.featuredMatch.innerHTML = `<article class="match-feature-card">
      <h4>Match en lumière</h4>
      <p class="teams">${featuredTeams}</p>
      <p class="muted">${featuredDate} · ${featured ? matchStatusLabel(featured) : 'À venir'}</p>
    </article>`;
  }
}

function renderMatchesByFilter(matches) {
  const filter = state.matchFilter || 'all';
  const visibleMatches = (matches || []).filter((match) => (filter === 'all' ? true : matchStatusCategory(match) === filter));
  els.matches.classList.remove('skeleton');
  els.matches.innerHTML = !visibleMatches.length
    ? '<div class="empty-state"><p class="empty-icon">♟️</p><p>Aucun match dans ce filtre.</p></div>'
    : `<table><thead><tr><th>Date</th><th>Phase</th><th>Match</th><th>Score</th><th>Statut</th></tr></thead><tbody>${visibleMatches
      .map((m) => `<tr><td>${formatMatchDate(m.scheduled_at)}</td><td>${m.phase}</td><td>${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</td><td>${m.score_a ?? '-'} - ${m.score_b ?? '-'}</td><td><span class="status-pill status-${matchStatusCategory(m)}">${matchStatusLabel(m)}</span></td></tr>`)
      .join('')}</tbody></table>`;
}

function attachDnDHandlers(container) {
  if (!container) return;
  for (const playerEl of container.querySelectorAll('[data-player-id]')) {
    playerEl.addEventListener('dragstart', (event) => {
      playerEl.classList.add('dragging');
      event.dataTransfer?.setData('text/player-id', playerEl.dataset.playerId);
      event.dataTransfer.effectAllowed = 'move';
    });
    playerEl.addEventListener('dragend', () => playerEl.classList.remove('dragging'));
  }
  for (const zone of container.querySelectorAll('[data-team-drop]')) {
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

async function loadPublic() {
  const [{ data: standingsData, error: standingsError }, { data: matches, error: matchesError }, { data: teamsData, error: teamsError }, { data: players, error: playersError }, { data: rawTeams, error: rawTeamsError }] = await Promise.all([
    supabase.from('standings').select('*').order('pool').order('rank_in_pool'),
    supabase.from('matches').select('*,team_a:teams!matches_team_a_id_fkey(name),team_b:teams!matches_team_b_id_fkey(name)').order('scheduled_at'),
    supabase.from('team_strength').select('*').order('strength_score', { ascending: false }),
    supabase.from('players').select('id,display_name,chess_username,is_captain,team_id,rapid_rating,blitz_rating,bullet_rating,peak_rapid,peak_blitz,peak_bullet,peak_global,avatar_url,chess_title,country_code,teams(name)').order('display_name'),
    supabase.from('teams').select('id,name,pool').order('name'),
  ]);
  const firstError = matchesError || rawTeamsError;
  if (firstError) {
    setAdminState(`❌ Chargement impossible: ${firstError.message}`, true);
    return;
  }
  if (playersError) {
    showToast(`⚠️ Données joueurs indisponibles (${playersError.message})`, true);
  }
  if (standingsError) showToast(`⚠️ Classement via vue indisponible (${standingsError.message}) → mode secours actif.`, true);
  if (teamsError) showToast(`⚠️ Force équipe via vue indisponible (${teamsError.message}) → mode secours actif.`, true);

  const standings = standingsError ? computeFallbackStandings(rawTeams || [], matches || []) : standingsData || [];
  const teamsBase = teamsError ? computeFallbackTeamStrength(rawTeams || [], players || []) : teamsData || [];
  const poolByTeamId = new Map((rawTeams || []).map((team) => [team.id, team.pool]));
  const teams = teamsBase.map((team) => ({
    ...team,
    pool: team.pool || poolByTeamId.get(team.team_id) || '—',
  }));
  renderHeroAndSummary(standings, matches || [], rawTeams || []);

  els.standings.classList.remove('skeleton');
  if (!standings?.length) {
    els.standings.innerHTML = '<p class="muted">Aucun classement disponible pour le moment.</p>';
  } else {
    const grouped = splitPoolsForDisplay(standings);
    const preferredPools = ['A', 'B'];
    const orderedPools = [...preferredPools.filter((pool) => grouped.has(pool)), ...[...grouped.keys()].filter((pool) => !preferredPools.includes(pool))];
    els.standings.innerHTML = `<div class="standings-split">${orderedPools
      .map((pool) => {
        const rows = grouped.get(pool) || [];
        return `<section class="standings-pool">
          <h3>Poule ${pool}</h3>
          <table><thead><tr><th>Rang</th><th>Équipe</th><th>Pts</th><th>Diff</th></tr></thead><tbody>${rows
            .map((r) => `<tr><td>${r.rank_in_pool}</td><td>${r.team_name}</td><td>${r.points}</td><td>${r.goal_diff}</td></tr>`)
            .join('')}</tbody></table>
        </section>`;
      })
      .join('')}</div>`;
  }

  renderMatchesByFilter(matches || []);

  const semis = (matches || []).filter((m) => m.phase === 'semi');
  const final = (matches || []).find((m) => m.phase === 'final');
  els.bracket.classList.remove('skeleton');
  els.bracket.innerHTML = `<p>🏁 Demi 1: ${semis[0]?.team_a?.name || '?'} vs ${semis[0]?.team_b?.name || '?'}</p>
  <p>🏁 Demi 2: ${semis[1]?.team_a?.name || '?'} vs ${semis[1]?.team_b?.name || '?'}</p>
  <p>🏆 Finale: ${final?.team_a?.name || '?'} vs ${final?.team_b?.name || '?'}</p>`;

  state.teams = teams || [];
  state.players = players || [];
  state.matches = matches || [];
  renderPlayersTable();
  enrichVisiblePlayersData(state.players);

  const teamFilterOptions = [`<option value="">Toutes les équipes</option>`, ...teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`)];
  els.playersTeamFilter.innerHTML = teamFilterOptions.join('');
  const options = [`<option value="">Pool joueurs disponibles (sans équipe)</option>`, ...teams.map((t) => `<option value="${t.team_id}">${t.team_name}</option>`)].join('');
  els.playerTeam.innerHTML = options;
  state.rawTeams = rawTeams || [];
  const teamSelectOptions = ['<option value="">— Choisir —</option>', ...(rawTeams || []).map((t) => `<option value="${t.id}">${t.name}${t.pool ? ` (Poule ${t.pool})` : ''}</option>`)].join('');
  if (els.createMatchTeamA) els.createMatchTeamA.innerHTML = teamSelectOptions;
  if (els.createMatchTeamB) els.createMatchTeamB.innerHTML = teamSelectOptions;
  populateMatchSelectors(matches || []);

  renderTeamDnD(teams || [], players || []);
  renderAdminRosters(teams || [], players || []);
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
  return Math.max(
    Number(player?.peak_global ?? 0),
    Number(player.peak_rapid ?? player.rapid_rating ?? 0),
    Number(player.peak_blitz ?? player.blitz_rating ?? 0),
    Number(player.peak_bullet ?? player.bullet_rating ?? 0),
  );
}

function effectivePeakRapid(player) {
  return Math.max(Number(player?.peak_rapid ?? 0), Number(player?.rapid_rating ?? 0));
}

function shouldRefreshPlayerStats(player) {
  return (
    !player?.avatar_url
    || player?.rapid_rating == null
    || player?.blitz_rating == null
    || player?.bullet_rating == null
    || player?.peak_rapid == null
    || player?.peak_blitz == null
    || player?.peak_bullet == null
    || Number(player?.peak_global ?? 0) < Math.max(
      Number(player?.rapid_rating ?? 0),
      Number(player?.blitz_rating ?? 0),
      Number(player?.bullet_rating ?? 0),
    )
    || Number(player?.peak_rapid ?? 0) < Number(player?.rapid_rating ?? 0)
    || Number(player?.peak_blitz ?? 0) < Number(player?.blitz_rating ?? 0)
    || Number(player?.peak_bullet ?? 0) < Number(player?.bullet_rating ?? 0)
  );
}

function sanitizeChessUsername(rawValue) {
  return String(rawValue || '').trim().toLowerCase();
}

async function fetchChessProfile(rawUsername) {
  const normalized = sanitizeChessUsername(rawUsername);
  if (!normalized) return null;
  if (state.chessCache.has(normalized)) return state.chessCache.get(normalized);
  if (state.pendingCache.has(normalized)) return null;
  state.pendingCache.add(normalized);

  try {
    const rawTrimmed = String(rawUsername || '').trim();
    const usernamesToTry = [...new Set([rawTrimmed, normalized])].filter(Boolean);
    let profile = {};
    let stats = {};
    let successfulUsername = normalized;

    for (const candidate of usernamesToTry) {
      const encoded = encodeURIComponent(candidate);
      const [profileRes, statsRes] = await Promise.all([
        fetch(`https://api.chess.com/pub/player/${encoded}`),
        fetch(`https://api.chess.com/pub/player/${encoded}/stats`),
      ]);
      if (!profileRes.ok && !statsRes.ok) continue;
      profile = profileRes.ok ? await profileRes.json() : {};
      stats = statsRes.ok ? await statsRes.json() : {};
      successfulUsername = sanitizeChessUsername(profile?.username || candidate);
      break;
    }

    const canonicalUsername = sanitizeChessUsername(profile?.username || successfulUsername || normalized);
    const rapid = stats?.chess_rapid?.last?.rating ?? null;
    const blitz = stats?.chess_blitz?.last?.rating ?? null;
    const bullet = stats?.chess_bullet?.last?.rating ?? null;
    const peakRapid = Math.max(Number(stats?.chess_rapid?.best?.rating ?? 0), Number(rapid ?? 0)) || null;
    const peakBlitz = Math.max(Number(stats?.chess_blitz?.best?.rating ?? 0), Number(blitz ?? 0)) || null;
    const peakBullet = Math.max(Number(stats?.chess_bullet?.best?.rating ?? 0), Number(bullet ?? 0)) || null;

    const data = {
      canonical_username: canonicalUsername,
      avatar_url: profile?.avatar ?? null,
      country_code: typeof profile?.country === 'string' ? profile.country.split('/').pop() ?? null : null,
      chess_title: profile?.title ?? null,
      rapid_rating: rapid,
      blitz_rating: blitz,
      bullet_rating: bullet,
      peak_rapid: peakRapid,
      peak_blitz: peakBlitz,
      peak_bullet: peakBullet,
      peak_global: Math.max(Number(peakRapid || 0), Number(peakBlitz || 0), Number(peakBullet || 0)) || null,
    };

    state.chessCache.set(normalized, data);
    if (canonicalUsername) state.chessCache.set(canonicalUsername, data);
    state.pendingCache.delete(normalized);
    return data;
  } catch {
    state.pendingCache.delete(normalized);
    return null;
  }
}

async function verifyChessComUsernameExists(username) {
  const normalized = sanitizeChessUsername(username);
  if (!normalized) return { ok: false, message: 'Le user_name Chess.com ne peut pas être vide.' };

  try {
    const rawTrimmed = String(username || '').trim();
    const usernamesToTry = [...new Set([rawTrimmed, normalized])].filter(Boolean);
    let response = null;
    for (const candidate of usernamesToTry) {
      const candidateRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(candidate)}`);
      if (candidateRes.ok) {
        response = candidateRes;
        break;
      }
      if (candidateRes.status !== 404) {
        response = candidateRes;
        break;
      }
    }
    if (!response || response.status === 404) {
      return { ok: false, message: `Aucun profil Chess.com trouvé pour "${rawTrimmed || normalized}".` };
    }
    if (!response.ok) {
      return { ok: false, message: `Chess.com a répondu ${response.status}. Réessaie plus tard.` };
    }
    const profile = await response.json();
    const canonical = sanitizeChessUsername(profile?.username || normalized);
    return { ok: true, username: canonical };
  } catch (error) {
    return { ok: false, message: `Vérification Chess.com impossible: ${error.message}` };
  }
}

async function enrichVisiblePlayersData(players) {
  const missing = (players || []).filter((player) => player.chess_username && shouldRefreshPlayerStats(player));
  if (!missing.length) return;
  const batchSize = 8;
  for (let index = 0; index < missing.length; index += batchSize) {
    const batch = missing.slice(index, index + batchSize);
    await Promise.allSettled(
      batch.map(async (player) => {
        const merged = await fetchChessProfile(player.chess_username);
        if (!merged) return;
        if (merged.avatar_url) player.avatar_url = merged.avatar_url;
        if (merged.country_code) player.country_code = merged.country_code;
        if (merged.chess_title) player.chess_title = merged.chess_title;
        if (merged.rapid_rating != null) player.rapid_rating = merged.rapid_rating;
        if (merged.blitz_rating != null) player.blitz_rating = merged.blitz_rating;
        if (merged.bullet_rating != null) player.bullet_rating = merged.bullet_rating;
        if (merged.peak_rapid != null) player.peak_rapid = merged.peak_rapid;
        if (merged.peak_blitz != null) player.peak_blitz = merged.peak_blitz;
        if (merged.peak_bullet != null) player.peak_bullet = merged.peak_bullet;
        player.peak_global = effectivePeakGlobal(player);
      }),
    );
  }
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
  const cadence = selectedCadence();
  const cadenceLabel = CADENCE_LABELS[cadence];
  const rosterByTeam = new Map(teams.map((team) => [team.team_id, players.filter((p) => p.team_id === team.team_id)]));
  const strengthByTeam = new Map(
    teams.map((team) => {
      const roster = rosterByTeam.get(team.team_id) || [];
      const strength = roster.reduce((sum, player) => sum + Number(cadencePeak(player, cadence) || 0), 0);
      return [team.team_id, strength];
    }),
  );
  const avgStrength = [...strengthByTeam.values()].reduce((sum, value) => sum + value, 0) / Math.max(strengthByTeam.size, 1);
  const maxStrength = Math.max(...strengthByTeam.values(), 1);
  const teamCards = teams.map((team) => {
    const roster = [...(rosterByTeam.get(team.team_id) || [])].sort((a, b) => Number(cadencePeak(b, cadence) || 0) - Number(cadencePeak(a, cadence) || 0));
    const teamStrength = strengthByTeam.get(team.team_id) || 0;
    const captain = roster.find((p) => p.is_captain) || roster[0] || null;
    const avgCadence = roster.reduce((sum, p) => sum + Number(cadenceRating(p, cadence) || 0), 0) / Math.max(roster.length, 1);
    return `<article class="showcase-card drop-zone" data-team-drop="${team.team_id}">
      <div class="showcase-head">
        ${captain ? avatarHTML(captain) : '<span class="avatar fallback" aria-hidden="true">♟️</span>'}
        <div>
          <h3>${team.team_name}</h3>
          <p class="muted">Poule ${team.pool || '—'} · Capitaine: ${captain?.display_name || 'Non défini'}</p>
        </div>
      </div>
      <div class="showcase-stats">
        <div class="stat-row"><span>Force équipe (${cadenceLabel})</span><b>${Math.round(teamStrength)} ELO</b></div>
        <div class="strength-bar"><div class="strength-bar-fill" style="width:${Math.min(100, (teamStrength / maxStrength) * 100)}%"></div></div>
        <div class="stat-row"><span>Moyenne ${cadenceLabel.toLowerCase()}</span><b>${Math.round(avgCadence || 0)}</b></div>
        <div class="stat-row"><span>Total peak ${cadenceLabel.toLowerCase()}</span><b>${Math.round(roster.reduce((sum, p) => sum + Number(cadencePeak(p, cadence) || 0), 0))}</b></div>
        <div class="stat-row"><span>Écart vs moyenne</span><b>${(teamStrength - avgStrength).toFixed(1)}</b></div>
      </div>
      <p class="muted showcase-all-players">Tous les joueurs (${roster.length})</p>
      <div class="showcase-roster">${roster
        .map(
          (player) => `<article class="dnd-player" draggable="true" data-player-id="${player.id}">
            <div class="dnd-player-head">${avatarHTML(player, 'small')} <span>${player.display_name}${player.is_captain ? ' 👑' : ''}</span><span class="drag-grip" aria-hidden="true">⋮⋮</span></div>
            <small>${player.chess_username} · ${cadenceLabel} ${cadenceRating(player, cadence) ?? '-'} · Peak ${cadenceLabel} ${cadencePeak(player, cadence) ?? '-'}</small>
          </article>`,
        )
        .join('') || '<p class="muted">Aucun joueur dans cette équipe.</p>'}</div>
    </article>`;
  });
  const substitutes = players.filter((player) => !player.team_id).sort((a, b) => Number(cadencePeak(b, cadence) || 0) - Number(cadencePeak(a, cadence) || 0));
  const substituteCard = `<article class="showcase-card drop-zone substitutes-zone" data-team-drop="substitutes">
    <div class="showcase-head">
      <span class="avatar fallback" aria-hidden="true">🧩</span>
      <div><h3>Joueurs disponibles</h3><p class="muted">Sans équipe assignée</p></div>
    </div>
    <p class="muted showcase-all-players">Pool de remplacement (${substitutes.length})</p>
    <div class="showcase-roster">${substitutes
      .map(
        (player) => `<article class="dnd-player" draggable="true" data-player-id="${player.id}">
          <div class="dnd-player-head">${avatarHTML(player, 'small')} <span>${player.display_name}</span><span class="drag-grip" aria-hidden="true">⋮⋮</span></div>
          <small>${player.chess_username} · ${cadenceLabel} ${cadenceRating(player, cadence) ?? '-'} · Peak ${cadenceLabel} ${cadencePeak(player, cadence) ?? '-'}</small>
        </article>`,
      )
      .join('') || '<p class="muted">Aucun joueur disponible.</p>'}</div>
  </article>`;
  els.teamShowcase.innerHTML = [...teamCards, substituteCard].join('');
  attachDnDHandlers(els.teamShowcase);
}

function renderTeamDnD(teams, players) {
  if (!els.teamDnd) return;
  const cadence = selectedCadence();
  const cadenceLabel = CADENCE_LABELS[cadence];
  const teamBlocks = [
    ...teams.map((team) => ({
      id: String(team.team_id),
      label: team.team_name,
      players: players.filter((player) => player.team_id === team.team_id).sort((a, b) => Number(cadencePeak(b, cadence) || 0) - Number(cadencePeak(a, cadence) || 0)),
    })),
    { id: 'substitutes', label: 'Substituts (sans équipe)', players: players.filter((player) => !player.team_id).sort((a, b) => Number(cadencePeak(b, cadence) || 0) - Number(cadencePeak(a, cadence) || 0)) },
  ];
  els.teamDnd.innerHTML = teamBlocks
    .map(
      (block) => `<section class="drop-zone ${block.id === 'substitutes' ? 'substitutes-zone' : ''}" data-team-drop="${block.id}">
        <h4>${block.label}</h4>
        <p class="drop-zone-meta">${block.players.length} joueur(s) · Peak ${cadenceLabel} total ${Math.round(block.players.reduce((sum, p) => sum + Number(cadencePeak(p, cadence) || 0), 0))}</p>
        ${block.players
          .map(
            (player) => `<article class="dnd-player" draggable="true" data-player-id="${player.id}">
              <div class="dnd-player-head">${avatarHTML(player, 'small')} <span>${player.display_name} ${player.is_captain ? '👑' : ''}</span><span class="drag-grip" aria-hidden="true">⋮⋮</span></div>
              <small>${player.chess_username} · ${cadenceLabel} ${cadenceRating(player, cadence) ?? '-'} · Peak ${cadenceLabel} ${cadencePeak(player, cadence) ?? '-'}</small>
            </article>`,
          )
          .join('')}
      </section>`,
    )
    .join('');

  attachDnDHandlers(els.teamDnd);
}

function renderPlayersTable() {
  const cadence = selectedCadence();
  const cadenceLabel = CADENCE_LABELS[cadence];
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
    if (sortKey === 'rapid_desc') return Number(cadenceRating(b, cadence) || 0) - Number(cadenceRating(a, cadence) || 0);
    if (sortKey === 'rapid_asc') return Number(cadenceRating(a, cadence) || 0) - Number(cadenceRating(b, cadence) || 0);
    if (sortKey === 'peak_global_desc') return Number(cadencePeak(b, cadence) || 0) - Number(cadencePeak(a, cadence) || 0);
    if (sortKey === 'name_desc') return b.display_name.localeCompare(a.display_name);
    return a.display_name.localeCompare(b.display_name);
  });
  els.players.classList.remove('skeleton');
  if (!filtered.length) {
    els.players.innerHTML = '<p class="muted">Aucun joueur ne correspond aux filtres sélectionnés.</p>';
    return;
  }
  els.players.innerHTML = `<table><thead><tr><th>Joueur</th><th>Équipe</th><th>${cadenceLabel}</th><th>Peak ${cadenceLabel.toLowerCase()}</th></tr></thead><tbody>${filtered
    .map(
      (p) => `<tr><td><div class="player-cell">${avatarHTML(p, 'small')}${p.display_name} ${badge(p.is_captain)}</div></td><td>${p.teams?.name || '-'}</td><td>${cadenceRating(p, cadence) ?? '-'}</td><td>${cadencePeak(p, cadence) ?? '-'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function playerStrengthValue(player) {
  return Number(cadencePeak(player, selectedCadence()) || 0);
}

async function loadClubIdentity() {
  if (!els.clubLogo) return;
  if (els.clubLogo.complete && els.clubLogo.naturalWidth > 0) {
    els.clubLogo.hidden = false;
    if (els.clubLogoFallback) els.clubLogoFallback.hidden = true;
    return;
  }
  els.clubLogo.addEventListener(
    'load',
    () => {
      els.clubLogo.hidden = false;
      if (els.clubLogoFallback) els.clubLogoFallback.hidden = true;
    },
    { once: true },
  );
  els.clubLogo.addEventListener(
    'error',
    () => {
      els.clubLogo.hidden = true;
      if (els.clubLogoFallback) els.clubLogoFallback.hidden = false;
    },
    { once: true },
  );
}

function renderAdminRosters(teams, players) {
  els.rosterBox.innerHTML = `<table><thead><tr><th>Équipe</th><th>Joueur</th><th>Cap.</th><th>Action</th></tr></thead><tbody>${
    [...players]
      .sort((a, b) => Number(effectivePeakRapid(b) || 0) - Number(effectivePeakRapid(a) || 0) || a.display_name.localeCompare(b.display_name))
      .map(
        (p) =>
          `<tr><td>${p.teams?.name || 'Sans équipe'}</td><td>${p.display_name} (${p.chess_username})</td><td>${p.is_captain ? 'Oui' : 'Non'}</td><td><div class="row-actions"><button data-edit-player-username="${p.id}" data-current-username="${p.chess_username}">Modifier user_name</button> <button data-del-player="${p.id}">Supprimer joueur</button></div></td></tr>`,
      )
      .join('')
  }${teams.map((t) => `<tr><td>${t.team_name}</td><td colspan="2">-</td><td><button data-del-team="${t.team_id}">Supprimer équipe</button></td></tr>`).join('')}</tbody></table>`;
  for (const b of els.rosterBox.querySelectorAll('[data-edit-player-username]')) {
    b.onclick = async () => {
      if (!(await requireAuthenticatedAdminAction())) return;
      const playerId = Number(b.dataset.editPlayerUsername);
      const currentUsername = b.dataset.currentUsername || '';
      const proposed = window.prompt('Nouveau user_name Chess.com pour ce joueur :', currentUsername);
      if (proposed == null) return;

      const validated = await verifyChessComUsernameExists(proposed);
      if (!validated.ok) {
        setAdminState(`❌ ${validated.message}`, true);
        return;
      }

      const { error } = await supabase.from('players').update({ chess_username: validated.username }).eq('id', playerId);
      if (error) return setAdminState(`❌ Mise à jour user_name impossible: ${error.message}`, true);

      setAdminState(`✅ user_name Chess.com mis à jour (${validated.username})`);
      await loadPublic();
    };
  }
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


function computeBoardLive(score, boardNo) { const a=score.game_points_a; const b=score.game_points_b; if(a==null||b==null||(a===0&&b===0)) return {status:'pending',a:null,b:null,label:'En attente'}; if(a>b) return {status:'win-a',a:boardNo===1?2:1,b:0,label:'Victoire A'}; if(b>a) return {status:'win-b',a:0,b:boardNo===1?2:1,label:'Victoire B'}; const d=boardNo===1?1:0.5; return {status:'draw',a:d,b:d,label:'Nul'}; }
async function loadResultsForMatch(matchId){ if(!matchId){els.resultsBoards.innerHTML='<p class="muted">Sélectionne un match pour saisir les résultats.</p>'; els.resultsSummary.hidden=true; state.resultsContext=null; return;} const {data:match}=await supabase.from('matches').select('id,team_a_id,team_b_id,scheduled_at,status,team_a:teams!matches_team_a_id_fkey(name),team_b:teams!matches_team_b_id_fkey(name)').eq('id',matchId).single(); const {data:boards}=await supabase.from('match_boards').select('board_no,player_a_id,player_b_id,game_points_a,game_points_b').eq('match_id',matchId).order('board_no'); const {data:roster}=await supabase.from('players').select('id,display_name,team_id,is_captain,rapid_rating,blitz_rating,bullet_rating,peak_rapid,peak_blitz,peak_bullet').in('team_id',[match.team_a_id,match.team_b_id]); const byTeam=new Map([[match.team_a_id,[]],[match.team_b_id,[]]]); (roster||[]).forEach(p=>byTeam.get(p.team_id)?.push(p)); const auto=computeAutoPairing(byTeam.get(match.team_a_id)||[],byTeam.get(match.team_b_id)||[],selectedCadence()); const bmap=new Map((boards||[]).map(b=>[b.board_no,b])); const pairing=[1,2,3,4,5].map(n=>{const a=auto.boards.find(x=>x.board_no===n);const d=bmap.get(n)||{}; return {board_no:n,player_a_id:d.player_a_id||a?.player_a_id||null,player_b_id:d.player_b_id||a?.player_b_id||null};}); state.resultsContext={match,pairing,scores:[1,2,3,4,5].map(n=>({board_no:n,game_points_a:bmap.get(n)?.game_points_a??null,game_points_b:bmap.get(n)?.game_points_b??null})),playersById:new Map((roster||[]).map(p=>[p.id,p]))}; els.resultsScheduledAt.value=match.scheduled_at?new Date(match.scheduled_at).toISOString().slice(0,16):''; els.resultsStatus.value=match.status||'scheduled'; els.resultsSummary.hidden=false; els.summaryTeamAName.textContent=match.team_a?.name||'A'; els.summaryTeamBName.textContent=match.team_b?.name||'B'; renderResultsBoards(); }
function renderResultsBoards(){const ctx=state.resultsContext; if(!ctx) return; let sa=0,sb=0,d=0,c=0; els.resultsBoards.innerHTML=ctx.pairing.map(p=>{const s=ctx.scores.find(x=>x.board_no===p.board_no); const l=computeBoardLive(s,p.board_no); sa+=Number(l.a||0); sb+=Number(l.b||0); if(s.game_points_a!=null&&s.game_points_b!=null){d+=s.game_points_a-s.game_points_b;c++;} const pa=ctx.playersById.get(p.player_a_id); const pb=ctx.playersById.get(p.player_b_id); return `<article class="result-board-card ${l.status}"><div class="rb-head"><h5>ÉCHIQUIER ${p.board_no}</h5></div><div class="rb-pairing"><div class="rb-side rb-side-a"><strong>${pa?.display_name||'—'}</strong></div><div class="rb-vs">VS</div><div class="rb-side rb-side-b"><strong>${pb?.display_name||'—'}</strong></div></div><div class="rb-scores"><label>A<input data-a="${p.board_no}" type="number" step="0.5" min="0" max="4" value="${s.game_points_a??''}"></label><span class="rb-score-sep">:</span><label>B<input data-b="${p.board_no}" type="number" step="0.5" min="0" max="4" value="${s.game_points_b??''}"></label></div><div class="rb-result ${l.status}">${l.label}</div></article>`;}).join(''); els.summaryScoreA.textContent=String(sa); els.summaryScoreB.textContent=String(sb); els.summaryDiffA.textContent=String(Math.round(d)); els.summaryDiffB.textContent=String(-Math.round(d)); els.summaryProgress.textContent=`${c}/5`;}
els.resultsBoards?.addEventListener('input',(e)=>{const t=e.target; if(!(t instanceof HTMLInputElement)||!state.resultsContext)return; const n=Number(t.dataset.a||t.dataset.b); const s=state.resultsContext.scores.find(x=>x.board_no===n); if(!s)return; const v=t.value===''?null:Number(t.value); if(t.dataset.a)s.game_points_a=Number.isNaN(v)?null:v; if(t.dataset.b)s.game_points_b=Number.isNaN(v)?null:v; renderResultsBoards();});
els.resultsMatch?.addEventListener('change',(e)=>loadResultsForMatch(String(e.target.value || '')));
els.resultsSave?.addEventListener('click', async()=>{if(!(await requireAuthenticatedAdminAction()))return; const ctx=state.resultsContext; if(!ctx)return; for(const p of ctx.pairing){await supabase.from('match_boards').update({player_a_id:p.player_a_id,player_b_id:p.player_b_id}).eq('match_id',ctx.match.id).eq('board_no',p.board_no);} for(const s of ctx.scores){await supabase.from('match_boards').update({game_points_a:s.game_points_a,game_points_b:s.game_points_b}).eq('match_id',ctx.match.id).eq('board_no',s.board_no);} await supabase.from('matches').update({scheduled_at:els.resultsScheduledAt.value?new Date(els.resultsScheduledAt.value).toISOString():null,status:els.resultsStatus.value||'validated'}).eq('id',ctx.match.id); await supabase.rpc('recompute_match_scores',{p_match_id:ctx.match.id}); showToast('✅ Résultats enregistrés'); await loadPublic();});
if (els.refreshPublic) els.refreshPublic.onclick = loadPublic;
els.matchesTabs?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-match-filter]');
  if (!button) return;
  state.matchFilter = button.dataset.matchFilter || 'all';
  for (const tab of els.matchesTabs.querySelectorAll('[data-match-filter]')) {
    const isActive = tab === button;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  }
  renderMatchesByFilter(state.matches);
});
els.playersTeamFilter?.addEventListener('change', renderPlayersTable);
els.playersSort?.addEventListener('change', renderPlayersTable);
els.playersSearch?.addEventListener('input', renderPlayersTable);
els.tournamentCadence?.addEventListener('change', async () => {
  state.tournamentCadence = selectedCadence();
  updatePlayersSortLabels();
  renderPlayersTable();
  renderTeamShowcase(state.teams, state.players);
  renderTeamDnD(state.teams, state.players);

});
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
state.tournamentCadence = selectedCadence();
updatePlayersSortLabels();
const { data: authData } = await supabase.auth.getSession();
updateAdminUI(authData.session);
supabase.auth.onAuthStateChange((_event, session) => updateAdminUI(session));
setInterval(loadPublic, 60000);
await loadPublic();
await loadClubIdentity();
