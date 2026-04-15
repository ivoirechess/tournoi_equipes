import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://lxjxbmuspnqvetpdlubd.supabase.co',
  'sb_publishable_n8xNMYSowjMtKHeQdnnNuA_ZUIqH5m2',
);

const FORMAT_REGISTRY = {
  swiss_individual: { label: 'Swiss Individuel', supportsTeams: false, supportsBracket: false, roundLabel: 'Round' },
  swiss_team: { label: 'Swiss Équipes', supportsTeams: true, supportsBracket: false, roundLabel: 'Round' },
  knockout_individual: { label: 'Knockout Individuel', supportsTeams: false, supportsBracket: true, roundLabel: 'Tour' },
  knockout_team: { label: 'Knockout Équipes', supportsTeams: true, supportsBracket: true, roundLabel: 'Tour' },
  league_divisions: { label: 'League Divisions', supportsTeams: true, supportsBracket: false, roundLabel: 'Journée' },
  round_robin_individual: { label: 'Round Robin Individuel', supportsTeams: false, supportsBracket: false, roundLabel: 'Ronde' },
  round_robin_team: { label: 'Round Robin Équipes', supportsTeams: true, supportsBracket: false, roundLabel: 'Journée' },
};

const state = {
  authSession: null,
  tables: {
    tournaments: false,
    registrations: false,
    fixtures: false,
    rounds: false,
    clubs: false,
  },
  tournaments: [],
  selectedTournamentId: null,
  globalPlayers: [],
  teams: [],
  fixtures: [],
  standings: [],
  registrations: [],
  chessImportCandidates: [],
};

const el = {
  heroTitle: document.getElementById('hero-title'),
  heroFormatSummary: document.getElementById('hero-format-summary'),
  heroStatus: document.getElementById('hero-status'),
  heroNextMatch: document.getElementById('hero-next-match'),
  heroNextTimer: document.getElementById('hero-next-timer'),
  summaryDashboard: document.getElementById('summary-dashboard'),
  standings: document.getElementById('standings'),
  matches: document.getElementById('matches'),
  bracket: document.getElementById('bracket'),
  teamShowcase: document.getElementById('team-showcase'),
  players: document.getElementById('players'),
  tournamentSwitcher: document.getElementById('tournament-switcher'),
  tournamentMeta: document.getElementById('tournament-meta'),
  adminTournamentSelect: document.getElementById('admin-tournament-select'),
  adminTournamentSummary: document.getElementById('admin-tournament-summary'),
  registrationTournamentSelect: document.getElementById('registration-tournament-select'),
  registrationPlayerSelect: document.getElementById('registration-player-select'),
  registrationTeamSelect: document.getElementById('registration-team-select'),
  registrationForm: document.getElementById('registration-form'),
  registrationTable: document.getElementById('registration-table'),
  fixtureRoundSelect: document.getElementById('fixture-round-select'),
  fixtureTable: document.getElementById('fixture-table'),
  fixtureForm: document.getElementById('fixture-form'),
  fixtureDate: document.getElementById('fixture-date'),
  fixtureStatus: document.getElementById('fixture-status'),
  fixtureVenue: document.getElementById('fixture-venue'),
  chessTournamentSelect: document.getElementById('chess-import-tournament'),
  chessRoundSelect: document.getElementById('chess-import-round'),
  chessFixtureSelect: document.getElementById('chess-import-fixture'),
  chessExpectedGames: document.getElementById('chess-expected-games'),
  chessWindowStart: document.getElementById('chess-window-start'),
  chessWindowEnd: document.getElementById('chess-window-end'),
  chessCandidates: document.getElementById('chess-candidates'),
  chessSearchBtn: document.getElementById('chess-search-candidates'),
  chessImportBtn: document.getElementById('chess-import-selected'),
  authForm: document.getElementById('auth-form'),
  authState: document.getElementById('auth-state'),
  adminLogout: document.getElementById('admin-logout'),
  toast: document.getElementById('toast'),
};

function showToast(message, error = false) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.style.borderColor = error ? '#ff7d7d88' : '';
  el.toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => el.toast.classList.remove('show'), 3200);
}

function adminMessage(message, error = false) {
  if (el.authState) {
    el.authState.textContent = message;
    el.authState.style.color = error ? '#ff8a8a' : '';
  }
  showToast(message, error);
}

function currentTournament() {
  return state.tournaments.find((t) => String(t.id) === String(state.selectedTournamentId)) || null;
}

function formatMeta(formatType) {
  return FORMAT_REGISTRY[formatType] || { label: formatType || 'Format inconnu', supportsTeams: true, supportsBracket: false, roundLabel: 'Round' };
}

function mapTournament(row) {
  return {
    id: row.id,
    title: row.title || row.name,
    season: row.season || '2026',
    status: row.status || 'scheduled',
    format_type: row.format_type || 'swiss_team',
    hero: row.hero_subtitle || 'Compétition IvoireChess',
  };
}

async function detectTables() {
  const checks = [
    ['tournaments', 'id'],
    ['tournament_registrations', 'id'],
    ['fixtures', 'id'],
    ['rounds', 'id'],
    ['clubs', 'id'],
  ];
  for (const [table, column] of checks) {
    const { error } = await supabase.from(table).select(column).limit(1);
    state.tables[table === 'tournament_registrations' ? 'registrations' : table] = !error;
  }
}

async function loadTournaments() {
  if (state.tables.tournaments) {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (data?.length) {
      state.tournaments = data.map(mapTournament);
      return;
    }
  }

  state.tournaments = [
    { id: 'legacy-team-cup', title: 'IvoireChess Team Cup', season: '2026', status: 'live', format_type: 'swiss_team', hero: 'Compétition historique par équipes' },
    { id: 'swiss-open-rapid', title: 'IvoireChess Swiss Open Rapid', season: '2026', status: 'scheduled', format_type: 'swiss_individual', hero: 'Open individuel cadence rapid' },
    { id: 'division-league', title: 'IvoireChess Club League', season: '2026', status: 'scheduled', format_type: 'league_divisions', hero: 'Ligues avec promotion et relégation' },
  ];
}

async function loadCoreData() {
  const [playersRes, teamsRes, matchesRes, standingsRes] = await Promise.all([
    supabase.from('players').select('id,display_name,chess_username,lichess_username,club_id,country_code,rapid_rating,blitz_rating,bullet_rating,team_id,is_captain,teams(name)').order('display_name'),
    supabase.from('teams').select('id,name,pool,club_id').order('name'),
    supabase.from('matches').select('id,phase,status,scheduled_at,venue,team_a_id,team_b_id,score_a,score_b,team_a:teams!matches_team_a_id_fkey(id,name),team_b:teams!matches_team_b_id_fkey(id,name)').order('scheduled_at'),
    supabase.from('standings').select('*').order('pool').order('rank_in_pool'),
  ]);

  state.globalPlayers = playersRes.data || [];
  state.teams = teamsRes.data || [];
  state.fixtures = (matchesRes.data || []).map((m) => ({
    id: m.id,
    tournament_id: state.selectedTournamentId,
    round_key: m.phase || 'round-1',
    status: m.status || 'scheduled',
    scheduled_at: m.scheduled_at,
    venue: m.venue || null,
    team_a: m.team_a,
    team_b: m.team_b,
    score_a: m.score_a,
    score_b: m.score_b,
  }));
  state.standings = standingsRes.data || [];

  if (state.tables.registrations) {
    const { data } = await supabase.from('tournament_registrations').select('*').eq('tournament_id', state.selectedTournamentId);
    state.registrations = data || [];
  } else {
    state.registrations = state.globalPlayers.map((p) => ({
      id: `legacy-${p.id}`,
      tournament_id: state.selectedTournamentId,
      player_id: p.id,
      team_id: p.team_id,
      captain_for_tournament: Boolean(p.is_captain),
      status: 'active',
    }));
  }
}

function playerById(id) {
  return state.globalPlayers.find((p) => Number(p.id) === Number(id));
}

function teamById(id) {
  return state.teams.find((t) => Number(t.id) === Number(id));
}

function renderTournamentSelectors() {
  const options = state.tournaments.map((t) => `<option value="${t.id}">${t.title} · ${formatMeta(t.format_type).label}</option>`).join('');
  [el.tournamentSwitcher, el.adminTournamentSelect, el.registrationTournamentSelect, el.chessTournamentSelect].forEach((select) => {
    if (!select) return;
    select.innerHTML = options;
    select.value = state.selectedTournamentId;
  });
}

function renderHero() {
  const tournament = currentTournament();
  if (!tournament) return;
  const format = formatMeta(tournament.format_type);
  const nextFixture = [...state.fixtures].find((f) => ['scheduled', 'upcoming', 'playing', 'live'].includes((f.status || '').toLowerCase()));

  if (el.heroTitle) el.heroTitle.textContent = `${tournament.title} — ${tournament.season}`;
  if (el.heroFormatSummary) el.heroFormatSummary.textContent = `${format.label} · ${state.registrations.length} inscriptions · calendrier centralisé`;
  if (el.heroStatus) {
    const status = (tournament.status || 'scheduled').toLowerCase();
    el.heroStatus.className = `status-badge status-${status === 'live' ? 'live' : status === 'finished' ? 'completed' : 'scheduled'}`;
    el.heroStatus.textContent = status.toUpperCase();
  }
  if (el.tournamentMeta) el.tournamentMeta.textContent = `${tournament.hero} · Format engine: ${tournament.format_type}`;
  if (el.heroNextMatch) {
    el.heroNextMatch.innerHTML = nextFixture
      ? `<article class="match-feature-card"><h4>Prochain rendez-vous</h4><p class="teams">${nextFixture.team_a?.name || '?'} vs ${nextFixture.team_b?.name || '?'}</p><p class="muted">${new Date(nextFixture.scheduled_at || Date.now()).toLocaleString('fr-FR')}</p></article>`
      : '<article class="match-feature-card"><h4>Calendrier</h4><p class="muted">Aucune affiche planifiée.</p></article>';
  }
  if (el.heroNextTimer) el.heroNextTimer.textContent = nextFixture?.scheduled_at ? new Date(nextFixture.scheduled_at).toLocaleDateString('fr-FR') : 'À planifier';
}

function renderSummary() {
  if (!el.summaryDashboard) return;
  const t = currentTournament();
  const fmt = formatMeta(t?.format_type);
  const completed = state.fixtures.filter((f) => ['finished', 'validated', 'completed'].includes((f.status || '').toLowerCase())).length;
  const live = state.fixtures.filter((f) => ['live', 'playing'].includes((f.status || '').toLowerCase())).length;
  const scheduled = state.fixtures.length - completed - live;
  el.summaryDashboard.innerHTML = `
    <article class="stat-tile"><p class="stat-label">Tournoi</p><p class="stat-value">${t?.title || '-'}</p><p class="stat-context">${fmt.label}</p></article>
    <article class="stat-tile"><p class="stat-label">Inscriptions</p><p class="stat-value">${state.registrations.length}</p><p class="stat-context">Base joueurs globale séparée</p></article>
    <article class="stat-tile"><p class="stat-label">Live</p><p class="stat-value">${live}</p><p class="stat-context">Fixtures en cours</p></article>
    <article class="stat-tile"><p class="stat-label">Calendrier</p><p class="stat-value">${completed}/${state.fixtures.length}</p><p class="stat-context">Complétés / total</p></article>
    <article class="stat-tile"><p class="stat-label">À venir</p><p class="stat-value">${scheduled}</p><p class="stat-context">Programmés</p></article>
  `;
}

function renderStandings() {
  if (!el.standings) return;
  if (!state.standings.length) {
    el.standings.innerHTML = '<div class="empty-state"><p>Classements en attente.</p></div>';
    return;
  }
  el.standings.innerHTML = `<table><thead><tr><th>Rang</th><th>Participant</th><th>Pts</th><th>Tie-break</th></tr></thead><tbody>${state.standings
    .map((row) => `<tr><td>${row.rank_in_pool || row.rank || '-'}</td><td>${row.team_name || row.player_name || '-'}</td><td>${row.points ?? '-'}</td><td>${row.goal_diff ?? row.tie_break ?? '-'}</td></tr>`)
    .join('')}</tbody></table>`;
}

function renderFixtures() {
  if (!el.matches) return;
  const fmt = formatMeta(currentTournament()?.format_type);
  if (!state.fixtures.length) {
    el.matches.innerHTML = '<div class="empty-state"><p>Aucun fixture dans le calendrier.</p></div>';
    return;
  }
  el.matches.innerHTML = `<table><thead><tr><th>${fmt.roundLabel}</th><th>Date</th><th>Affiche</th><th>Status</th><th>Score</th><th>Lieu</th></tr></thead><tbody>${state.fixtures
    .map((f) => `<tr><td>${f.round_key}</td><td>${f.scheduled_at ? new Date(f.scheduled_at).toLocaleString('fr-FR') : '-'}</td><td>${f.team_a?.name || '?'} vs ${f.team_b?.name || '?'}</td><td>${f.status || '-'}</td><td>${f.score_a ?? '-'} - ${f.score_b ?? '-'}</td><td>${f.venue || 'Online/TBD'}</td></tr>`)
    .join('')}</tbody></table>`;
}

function renderBracket() {
  if (!el.bracket) return;
  const fmt = formatMeta(currentTournament()?.format_type);
  if (!fmt.supportsBracket) {
    el.bracket.innerHTML = '<p class="muted">Ce format n’utilise pas de bracket éliminatoire.</p>';
    return;
  }
  const rounds = [...new Set(state.fixtures.map((f) => f.round_key))];
  el.bracket.innerHTML = rounds.map((round) => `<p>🏁 ${round}: ${state.fixtures.filter((f) => f.round_key === round).length} match(es)</p>`).join('');
}

function renderTeamsIfRelevant() {
  if (!el.teamShowcase) return;
  if (!formatMeta(currentTournament()?.format_type).supportsTeams) {
    el.teamShowcase.innerHTML = '<p class="muted">Tournoi individuel: pas de vue équipes.</p>';
    return;
  }
  el.teamShowcase.innerHTML = state.teams
    .map((team) => {
      const roster = state.registrations.filter((r) => Number(r.team_id) === Number(team.id)).map((r) => playerById(r.player_id)).filter(Boolean);
      return `<article class="showcase-card"><h3>${team.name}</h3><p class="muted">${roster.length} joueur(s) inscrit(s)</p><ul>${roster.map((p) => `<li>${p.display_name} (${p.chess_username})</li>`).join('') || '<li>Roster vide</li>'}</ul></article>`;
    })
    .join('');
}

function renderGlobalPlayers() {
  if (!el.players) return;
  el.players.innerHTML = `<table><thead><tr><th>Joueur global</th><th>Chess.com</th><th>Lichess</th><th>Club</th><th>Rápid</th><th>Inscrit</th></tr></thead><tbody>${state.globalPlayers
    .map((p) => {
      const isRegistered = state.registrations.some((r) => Number(r.player_id) === Number(p.id));
      return `<tr><td>${p.display_name}</td><td>${p.chess_username || '-'}</td><td>${p.lichess_username || '-'}</td><td>${p.teams?.name || '-'}</td><td>${p.rapid_rating ?? '-'}</td><td>${isRegistered ? '✅' : '—'}</td></tr>`;
    })
    .join('')}</tbody></table>`;
}

function renderAdminSummary() {
  if (!el.adminTournamentSummary) return;
  const t = currentTournament();
  const fmt = formatMeta(t?.format_type);
  el.adminTournamentSummary.innerHTML = `<strong>${t?.title || '-'}</strong><p class="muted">Format: ${fmt.label} · Status: ${t?.status || '-'} · Phase active: ${state.fixtures[0]?.round_key || 'N/A'}</p>`;
}

function renderRegistrationAdmin() {
  if (el.registrationPlayerSelect) {
    el.registrationPlayerSelect.innerHTML = state.globalPlayers.map((p) => `<option value="${p.id}">${p.display_name} (${p.chess_username || 'sans username'})</option>`).join('');
  }
  if (el.registrationTeamSelect) {
    const optionalTeam = formatMeta(currentTournament()?.format_type).supportsTeams;
    el.registrationTeamSelect.innerHTML = `<option value="">${optionalTeam ? 'Sans équipe' : 'N/A (individuel)'}</option>${state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}`;
    el.registrationTeamSelect.disabled = !optionalTeam;
  }
  if (el.registrationTable) {
    el.registrationTable.innerHTML = `<table><thead><tr><th>Joueur</th><th>Équipe</th><th>Statut</th><th>Capitaine (tournoi)</th></tr></thead><tbody>${state.registrations
      .map((r) => `<tr><td>${playerById(r.player_id)?.display_name || r.player_id}</td><td>${teamById(r.team_id)?.name || '-'}</td><td>${r.status || 'active'}</td><td>${r.captain_for_tournament ? '👑' : '—'}</td></tr>`)
      .join('')}</tbody></table>`;
  }
}

function uniqueRoundKeys() {
  return [...new Set(state.fixtures.map((f) => f.round_key || 'round-1'))];
}

function renderFixtureAdmin() {
  if (el.fixtureRoundSelect) {
    const keys = uniqueRoundKeys();
    el.fixtureRoundSelect.innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join('');
  }
  if (el.fixtureTable) {
    el.fixtureTable.innerHTML = `<table><thead><tr><th>Round/Matchday</th><th>Affiche</th><th>Date</th><th>Status</th><th>Lieu</th></tr></thead><tbody>${state.fixtures
      .map((f) => `<tr><td>${f.round_key}</td><td>${f.team_a?.name || '?'} vs ${f.team_b?.name || '?'}</td><td>${f.scheduled_at ? new Date(f.scheduled_at).toLocaleString('fr-FR') : '-'}</td><td>${f.status}</td><td>${f.venue || '-'}</td></tr>`)
      .join('')}</tbody></table>`;
  }
}

function expectedGamesForFixture(fixture) {
  if (!fixture) return [];
  const teamAPlayers = state.registrations.filter((r) => Number(r.team_id) === Number(fixture.team_a?.id)).map((r) => playerById(r.player_id)).filter(Boolean);
  const teamBPlayers = state.registrations.filter((r) => Number(r.team_id) === Number(fixture.team_b?.id)).map((r) => playerById(r.player_id)).filter(Boolean);
  const boardCount = Math.min(teamAPlayers.length, teamBPlayers.length, 4);
  const out = [];
  for (let i = 0; i < boardCount; i += 1) {
    out.push({ board_no: i + 1, white: teamAPlayers[i], black: teamBPlayers[i] });
  }
  return out;
}

function renderChessImportAdmin() {
  if (!el.chessRoundSelect || !el.chessFixtureSelect) return;
  const rounds = uniqueRoundKeys();
  el.chessRoundSelect.innerHTML = rounds.map((r) => `<option value="${r}">${r}</option>`).join('');

  const selectedRound = el.chessRoundSelect.value || rounds[0];
  const roundFixtures = state.fixtures.filter((f) => f.round_key === selectedRound);
  el.chessFixtureSelect.innerHTML = roundFixtures.map((f) => `<option value="${f.id}">${f.team_a?.name || '?'} vs ${f.team_b?.name || '?'} (${f.status})</option>`).join('');

  const fixture = roundFixtures.find((f) => String(f.id) === String(el.chessFixtureSelect.value)) || roundFixtures[0];
  const expected = expectedGamesForFixture(fixture);
  if (el.chessExpectedGames) {
    el.chessExpectedGames.innerHTML = expected.length
      ? `<table><thead><tr><th>Board</th><th>Blanc attendu</th><th>Noir attendu</th></tr></thead><tbody>${expected.map((g) => `<tr><td>#${g.board_no}</td><td>${g.white?.display_name || '-'}</td><td>${g.black?.display_name || '-'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Aucune paire attendue détectée automatiquement (mode manuel disponible).</p>';
  }
}

async function searchChessGamesForFixture() {
  const fixtureId = el.chessFixtureSelect?.value;
  const fixture = state.fixtures.find((f) => String(f.id) === String(fixtureId));
  if (!fixture) return;
  const expectedGames = expectedGamesForFixture(fixture);
  if (!expectedGames.length) {
    showToast('⚠️ Aucun joueur attendu pour ce fixture.', true);
    return;
  }

  const startAt = new Date(el.chessWindowStart?.value || fixture.scheduled_at || Date.now() - 6 * 3600 * 1000);
  const endAt = new Date(el.chessWindowEnd?.value || Date.now() + 6 * 3600 * 1000);
  const monthPath = `${startAt.getUTCFullYear()}/${String(startAt.getUTCMonth() + 1).padStart(2, '0')}`;

  const candidates = [];
  for (const expected of expectedGames) {
    const white = expected.white?.chess_username;
    if (!white) continue;
    const resp = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(white)}/games/${monthPath}`);
    if (!resp.ok) continue;
    const payload = await resp.json();
    for (const game of payload.games || []) {
      const ts = new Date((game.end_time || 0) * 1000);
      const whiteUser = String(game.white?.username || '').toLowerCase();
      const blackUser = String(game.black?.username || '').toLowerCase();
      const expectedWhite = String(expected.white?.chess_username || '').toLowerCase();
      const expectedBlack = String(expected.black?.chess_username || '').toLowerCase();
      const validWindow = ts >= startAt && ts <= endAt;
      const validPair = (whiteUser === expectedWhite && blackUser === expectedBlack) || (whiteUser === expectedBlack && blackUser === expectedWhite);
      if (validWindow && validPair) {
        candidates.push({ fixture_id: fixture.id, board_no: expected.board_no, played_at: ts.toISOString(), white_username: game.white?.username, black_username: game.black?.username, result: game.white?.result || 'unknown', game_url: game.url, pgn: game.pgn });
      }
    }
  }

  state.chessImportCandidates = candidates;
  if (!el.chessCandidates) return;
  el.chessCandidates.innerHTML = candidates.length
    ? `<table><thead><tr><th></th><th>Board</th><th>Partie</th><th>Date</th><th>Résultat</th></tr></thead><tbody>${candidates
      .map((c, idx) => `<tr><td><input type="checkbox" data-candidate-index="${idx}" checked /></td><td>#${c.board_no}</td><td><a href="${c.game_url}" target="_blank" rel="noreferrer">${c.white_username} vs ${c.black_username}</a></td><td>${new Date(c.played_at).toLocaleString('fr-FR')}</td><td>${c.result}</td></tr>`)
      .join('')}</tbody></table>`
    : '<p class="muted">Aucune partie candidate trouvée dans la fenêtre choisie.</p>';
}

async function importSelectedCandidates() {
  const selectedIdx = [...document.querySelectorAll('[data-candidate-index]:checked')].map((input) => Number(input.dataset.candidateIndex));
  const payload = selectedIdx.map((i) => state.chessImportCandidates[i]).filter(Boolean);
  if (!payload.length) {
    showToast('⚠️ Sélectionne au moins une partie candidate.', true);
    return;
  }

  const rows = payload.map((g) => ({
    match_id: g.fixture_id,
    board_no: g.board_no,
    played_at: g.played_at,
    white_username: g.white_username,
    black_username: g.black_username,
    result: g.result,
    game_url: g.game_url,
    pgn: g.pgn,
    excluded: false,
  }));

  const { error } = await supabase.from('games').upsert(rows, { onConflict: 'match_id,board_no,game_url' });
  if (error) {
    adminMessage(`❌ Import impossible: ${error.message}`, true);
    return;
  }
  showToast(`✅ ${rows.length} partie(s) importée(s) et liées au fixture exact.`);
}

async function requireAdmin() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    adminMessage('❌ Connexion admin requise.', true);
    return false;
  }
  state.authSession = data.session;
  return true;
}

async function submitRegistration(event) {
  event.preventDefault();
  if (!(await requireAdmin())) return;
  const payload = {
    tournament_id: el.registrationTournamentSelect?.value,
    player_id: Number(el.registrationPlayerSelect?.value),
    team_id: el.registrationTeamSelect?.value ? Number(el.registrationTeamSelect.value) : null,
    captain_for_tournament: false,
    status: 'active',
  };

  if (state.tables.registrations) {
    const { error } = await supabase.from('tournament_registrations').upsert(payload, { onConflict: 'tournament_id,player_id' });
    if (error) return adminMessage(`❌ Inscription impossible: ${error.message}`, true);
  } else {
    showToast('⚠️ Table tournament_registrations absente: mode simulation local.', true);
    state.registrations.push({ id: `local-${payload.player_id}`, ...payload });
  }
  await refreshTournamentData();
}

async function submitFixtureUpdate(event) {
  event.preventDefault();
  if (!(await requireAdmin())) return;
  const selectedRound = el.fixtureRoundSelect?.value;
  const fixture = state.fixtures.find((f) => f.round_key === selectedRound);
  if (!fixture) return;

  const updates = {
    scheduled_at: el.fixtureDate?.value ? new Date(el.fixtureDate.value).toISOString() : fixture.scheduled_at,
    status: el.fixtureStatus?.value || fixture.status,
    venue: el.fixtureVenue?.value || fixture.venue,
  };

  const { error } = await supabase.from('matches').update(updates).eq('id', fixture.id);
  if (error) return adminMessage(`❌ Mise à jour calendrier impossible: ${error.message}`, true);
  showToast('✅ Calendrier mis à jour pour le fixture sélectionné.');
  await refreshTournamentData();
}

function wireEvents() {
  el.tournamentSwitcher?.addEventListener('change', async () => {
    state.selectedTournamentId = el.tournamentSwitcher.value;
    await refreshTournamentData();
  });
  el.adminTournamentSelect?.addEventListener('change', async () => {
    state.selectedTournamentId = el.adminTournamentSelect.value;
    await refreshTournamentData();
  });
  el.registrationForm?.addEventListener('submit', submitRegistration);
  el.fixtureForm?.addEventListener('submit', submitFixtureUpdate);
  el.chessSearchBtn?.addEventListener('click', searchChessGamesForFixture);
  el.chessImportBtn?.addEventListener('click', async () => {
    if (!(await requireAdmin())) return;
    await importSelectedCandidates();
  });
  el.chessRoundSelect?.addEventListener('change', renderChessImportAdmin);
  el.chessFixtureSelect?.addEventListener('change', renderChessImportAdmin);

  el.authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('admin-email')?.value;
    const password = document.getElementById('admin-password')?.value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return adminMessage(`❌ ${error.message}`, true);
    state.authSession = data.session;
    adminMessage(`✅ Connecté (${data.session.user.email})`);
  });

  el.adminLogout?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    state.authSession = null;
    adminMessage('Déconnecté.');
  });
}

function renderAll() {
  renderTournamentSelectors();
  renderHero();
  renderSummary();
  renderStandings();
  renderFixtures();
  renderBracket();
  renderTeamsIfRelevant();
  renderGlobalPlayers();
  renderAdminSummary();
  renderRegistrationAdmin();
  renderFixtureAdmin();
  renderChessImportAdmin();
}

async function refreshTournamentData() {
  await loadCoreData();
  renderAll();
}

await detectTables();
await loadTournaments();
state.selectedTournamentId = state.tournaments[0]?.id;
wireEvents();
await refreshTournamentData();
setInterval(refreshTournamentData, 90000);
