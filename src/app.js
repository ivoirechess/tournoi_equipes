const els = {
  summaryGrid: document.getElementById('summary-grid'),
  standings: document.getElementById('standings'),
  matchesGrid: document.getElementById('matches-grid'),
  teamsGrid: document.getElementById('teams-grid'),
  playersGrid: document.getElementById('players-grid'),
  livePill: document.getElementById('live-pill'),
  weekendState: document.getElementById('weekend-state'),
  matchFilters: document.getElementById('match-filters'),
  playerTeamFilter: document.getElementById('player-team-filter'),
  playerSort: document.getElementById('player-sort'),
  playerSearch: document.getElementById('player-search'),
  adminAccess: document.getElementById('admin-access'),
  adminPanel: document.getElementById('admin-panel'),
  adminMatches: document.getElementById('admin-matches'),
  adminBoards: document.getElementById('admin-boards'),
  boardDrawer: document.getElementById('board-drawer'),
  drawerTitle: document.getElementById('drawer-title'),
  drawerSubtitle: document.getElementById('drawer-subtitle'),
  drawerClose: document.getElementById('drawer-close'),
  rangeStart: document.getElementById('range-start'),
  rangeEnd: document.getElementById('range-end'),
  importGames: document.getElementById('import-games'),
  importFeedback: document.getElementById('import-feedback'),
  duelPills: document.getElementById('duel-pills'),
  manualA: document.getElementById('manual-a'),
  manualB: document.getElementById('manual-b'),
  manualGdA: document.getElementById('manual-gd-a'),
  manualGdB: document.getElementById('manual-gd-b'),
  applyOverride: document.getElementById('apply-override'),
  validateBoard: document.getElementById('validate-board'),
  overrideLog: document.getElementById('override-log'),
  exportResults: document.getElementById('export-results'),
  toast: document.getElementById('toast'),
};

const state = {
  tournament: null,
  results: null,
  matchFilter: 'all',
  playerFilterTeam: '',
  playerSort: 'elo_desc',
  playerSearch: '',
  adminUnlocked: false,
  selectedMatchId: null,
  selectedBoard: null,
  pollingTimer: null,
};

const STORAGE_RESULTS_KEY = 'ivoirechess.results.v2';
const STORAGE_ARCHIVE_KEY = 'ivoirechess.chesscom.archives.v1';
const STORAGE_LOG_KEY = 'ivoirechess.override.log.v1';

init();

async function init() {
  const [tournament, baseResults] = await Promise.all([
    fetch('./data/tournament.json').then((r) => r.json()),
    fetch('./data/results.json').then((r) => r.json()),
  ]);
  state.tournament = tournament;
  state.results = hydrateResults(baseResults);
  wireEvents();
  populatePlayerFilter();
  renderAll();
  startConditionalPolling();
}

function hydrateResults(baseResults) {
  const local = readJSON(STORAGE_RESULTS_KEY);
  const merged = structuredClone(baseResults);
  if (local?.matches) {
    for (const [matchId, matchData] of Object.entries(local.matches)) {
      merged.matches[matchId] = { ...(merged.matches[matchId] || {}), ...matchData };
    }
  }
  merged.overrideLog = readJSON(STORAGE_LOG_KEY) || [];
  return merged;
}

function wireEvents() {
  els.matchFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    state.matchFilter = btn.dataset.filter;
    [...els.matchFilters.querySelectorAll('.seg')].forEach((el) => el.classList.toggle('active', el === btn));
    renderMatches();
  });
  els.playerTeamFilter.addEventListener('change', () => {
    state.playerFilterTeam = els.playerTeamFilter.value;
    renderPlayers();
  });
  els.playerSort.addEventListener('change', () => {
    state.playerSort = els.playerSort.value;
    renderPlayers();
  });
  els.playerSearch.addEventListener('input', () => {
    state.playerSearch = els.playerSearch.value.trim().toLowerCase();
    renderPlayers();
  });
  els.adminAccess.addEventListener('click', unlockAdmin);
  els.drawerClose.addEventListener('click', closeDrawer);
  els.importGames.addEventListener('click', importBoardGames);
  els.applyOverride.addEventListener('click', applyManualOverride);
  els.validateBoard.addEventListener('click', validateBoard);
  els.exportResults.addEventListener('click', exportResultsJSON);
}

function renderAll() {
  renderHeroState();
  renderSummary();
  renderStandings();
  renderMatches();
  renderTeams();
  renderPlayers();
  renderAdminMatches();
  renderOverrideLog();
}

function renderHeroState() {
  const now = new Date();
  const live = isLiveWindow(now);
  els.livePill.textContent = live ? 'LIVE' : 'PROCHAIN MATCH';
  els.livePill.classList.toggle('live', live);
  const week = getCurrentWeekendDescriptor(now);
  els.weekendState.textContent = week;
}

function getCurrentWeekendDescriptor(now) {
  const rounds = state.tournament.rounds;
  const current = rounds.find((r) => now >= new Date(r.start) && now <= new Date(r.end));
  if (current) return `🔴 WEEK-END ${current.weekend} EN COURS`;
  const next = rounds.find((r) => now < new Date(r.start));
  if (!next) return 'Tournoi terminé';
  const diffDays = Math.ceil((new Date(next.start) - now) / 86400000);
  return `PROCHAIN MATCH DANS ${Math.max(diffDays, 0)}J`;
}

function renderSummary() {
  const nextMatch = [...state.tournament.matches]
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .find((m) => new Date(m.kickoff) > new Date());
  const leaders = computeStandingsByPool();
  const summary = [
    { label: 'Prochain match', value: nextMatch ? `${teamById(nextMatch.teamA).name} vs ${teamById(nextMatch.teamB).name}` : 'Terminé' },
    { label: 'Semaine actuelle', value: getCurrentWeekendDescriptor(new Date()).replace('🔴 ', '') },
    { label: 'Leaders poules', value: `A: ${leaders.A?.[0]?.name || '—'} · B: ${leaders.B?.[0]?.name || '—'}` },
  ];
  els.summaryGrid.innerHTML = summary.map((item) => `<article class="summary-tile"><p>${item.label}</p><b>${item.value}</b></article>`).join('');
}

function renderStandings() {
  const byPool = computeStandingsByPool();
  els.standings.innerHTML = ['A', 'B'].map((pool) => renderPoolTable(pool, byPool[pool] || [])).join('');
}

function renderPoolTable(pool, rows) {
  const body = rows.map((row, idx) => `
    <tr class="${idx < 2 ? 'qualif' : ''}">
      <td class="rank">#${idx + 1}${idx === 0 ? ' 🏅' : ''}</td>
      <td>${avatarHTML(row.name)} ${row.name}</td>
      <td>${row.j}</td><td>${row.v}</td><td>${row.d}</td>
      <td class="pts">${row.pts.toFixed(1)}</td>
      <td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
    </tr>`).join('');
  return `<div class="pool-table"><table><thead><tr><th colspan="7">Poule ${pool}</th></tr><tr><th>Rang</th><th>Équipe</th><th>J</th><th>V</th><th>D</th><th>Pts</th><th>GD</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function computeStandingsByPool() {
  const map = { A: [], B: [] };
  for (const team of state.tournament.teams) {
    map[team.pool].push({ id: team.id, name: team.name, j: 0, v: 0, d: 0, pts: 0, gd: 0 });
  }
  for (const match of state.tournament.matches) {
    const score = computeMatchScore(match.id);
    if (!score.played) continue;
    const teamA = map[match.pool].find((t) => t.id === match.teamA);
    const teamB = map[match.pool].find((t) => t.id === match.teamB);
    teamA.j += 1; teamB.j += 1;
    teamA.pts += score.pointsA; teamB.pts += score.pointsB;
    teamA.gd += score.gdA; teamB.gd += score.gdB;
    if (score.pointsA > score.pointsB) { teamA.v += 1; teamB.d += 1; }
    else if (score.pointsB > score.pointsA) { teamB.v += 1; teamA.d += 1; }
  }
  for (const pool of ['A', 'B']) {
    map[pool].sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.name.localeCompare(b.name));
  }
  return map;
}

function renderMatches() {
  const filtered = state.tournament.matches.filter((m) => state.matchFilter === 'all' || state.matchFilter === matchStatus(m));
  els.matchesGrid.innerHTML = filtered.map((match) => renderMatchCard(match, false)).join('');
  els.matchesGrid.querySelectorAll('[data-match-id]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedMatchId = node.dataset.matchId;
      if (state.adminUnlocked) renderBoardsForSelectedMatch();
    });
  });
}

function renderMatchCard(match, forAdmin) {
  const score = computeMatchScore(match.id);
  const teamA = teamById(match.teamA);
  const teamB = teamById(match.teamB);
  const status = matchStatus(match);
  const label = status === 'upcoming' ? 'À VENIR' : status === 'live' ? 'LIVE' : 'TERMINÉ';
  const statusClass = status === 'live' ? 'status-pill live' : 'status-pill';
  const scoreText = status === 'upcoming' ? `WEEK-END ${match.weekend} · SAM/DIM 19H00` : `${score.pointsA.toFixed(1)} — ${score.pointsB.toFixed(1)} · GD ${score.gdA > 0 ? '+' : ''}${score.gdA}`;
  return `<article class="match-card" data-match-id="${match.id}">
    <div><span class="${statusClass}">${label}</span> <small class="muted">Poule ${match.pool} · ${new Date(match.kickoff).toLocaleDateString('fr-FR')}</small></div>
    <h3>${teamA.name} <span class="vs">VS</span> ${teamB.name}</h3>
    <div class="score">${scoreText}</div>
    ${forAdmin ? '<small class="muted">Cliquer pour gérer les 5 échiquiers</small>' : ''}
  </article>`;
}

function renderTeams() {
  els.teamsGrid.innerHTML = state.tournament.teams.map((team) => {
    const roster = playersByTeam(team.id);
    const total = roster.reduce((sum, p) => sum + p.eloRapid, 0);
    const captain = roster.find((p) => p.captain);
    return `<article class="team-card"><div class="avatar-ring"><span>${initials(captain?.name || team.name)}</span></div>
      <h3>${team.name}</h3><p class="muted">Poule ${team.pool}</p>
      <ol class="player-list">${roster.map((p) => `<li>${p.name} · ${p.eloRapid}${p.captain ? ' ★' : ''}</li>`).join('')}</ol>
      <b>Total ELO: ${total}</b></article>`;
  }).join('');
}

function populatePlayerFilter() {
  els.playerTeamFilter.innerHTML = `<option value="">Toutes les équipes</option>${state.tournament.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}`;
}

function renderPlayers() {
  let list = [...state.tournament.players];
  if (state.playerFilterTeam) list = list.filter((p) => p.teamId === state.playerFilterTeam);
  if (state.playerSearch) list = list.filter((p) => `${p.name} ${p.chesscom}`.toLowerCase().includes(state.playerSearch));
  if (state.playerSort === 'elo_desc') list.sort((a, b) => b.eloRapid - a.eloRapid);
  if (state.playerSort === 'name_asc') list.sort((a, b) => a.name.localeCompare(b.name));
  if (state.playerSort === 'team_asc') list.sort((a, b) => teamById(a.teamId).name.localeCompare(teamById(b.teamId).name));
  els.playersGrid.innerHTML = list.map((p) => `<article class="player-card"><div class="avatar-ring"><span>${initials(p.name)}</span></div><h4>${p.name}${p.captain ? ' ★' : ''}</h4><p>ELO ${p.eloRapid}</p><small class="muted">${teamById(p.teamId).name}</small></article>`).join('');
}

function unlockAdmin() {
  const pass = prompt('Code admin');
  if (pass !== 'ivoire2026') {
    toast('Code invalide.');
    return;
  }
  state.adminUnlocked = true;
  els.adminPanel.classList.remove('hidden');
  renderAdminMatches();
}

function renderAdminMatches() {
  if (!state.adminUnlocked) return;
  els.adminMatches.innerHTML = state.tournament.matches.map((m) => renderMatchCard(m, true)).join('');
  els.adminMatches.querySelectorAll('[data-match-id]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedMatchId = node.dataset.matchId;
      renderBoardsForSelectedMatch();
    });
  });
  renderBoardsForSelectedMatch();
}

function renderBoardsForSelectedMatch() {
  if (!state.selectedMatchId) {
    els.adminBoards.innerHTML = '<p class="muted">Sélectionnez un match.</p>';
    return;
  }
  const match = matchById(state.selectedMatchId);
  const result = state.results.matches[match.id] || { boards: {} };
  els.adminBoards.innerHTML = match.boards.map((board) => {
    const boardResult = result.boards[board.board] || {};
    const dots = [0, 1, 2, 3].map((i) => `<span class="pill-result ${boardResult.games?.[i]?.resultClass || 'd'}">${boardResult.games?.[i]?.short || '·'}</span>`).join('');
    return `<article class="board-card" data-board="${board.board}"><h4>ÉCHIQUIER ${board.board}</h4>
      <p>${playerById(board.playerA).name} <span class="vs">VS</span> ${playerById(board.playerB).name}</p>
      <p><b>${board.board === 1 ? '2 PTS' : '1 PT'}</b> · ${matchStatus(match).toUpperCase()}</p>
      <div class="duel-pills">${dots}</div></article>`;
  }).join('');
  els.adminBoards.querySelectorAll('[data-board]').forEach((node) => {
    node.addEventListener('click', () => openBoardDrawer(match.id, Number(node.dataset.board)));
  });
}

function openBoardDrawer(matchId, boardNo) {
  const match = matchById(matchId);
  const board = match.boards.find((b) => b.board === boardNo);
  state.selectedBoard = { matchId, boardNo };
  els.drawerTitle.textContent = `Échiquier ${boardNo}`;
  els.drawerSubtitle.textContent = `${playerById(board.playerA).name} (${playerById(board.playerA).eloRapid}) vs ${playerById(board.playerB).name} (${playerById(board.playerB).eloRapid})`;
  const defaults = match.window || { start: match.kickoff.slice(0, 10), end: match.kickoff.slice(0, 10) };
  els.rangeStart.value = defaults.start;
  els.rangeEnd.value = defaults.end;
  fillBoardDrawerData(matchId, boardNo);
  els.boardDrawer.classList.add('open');
  els.boardDrawer.setAttribute('aria-hidden', 'false');
}

function fillBoardDrawerData(matchId, boardNo) {
  const boardResult = state.results.matches?.[matchId]?.boards?.[boardNo];
  els.duelPills.innerHTML = (boardResult?.games || []).map((g) => `<a class="pill-result ${g.resultClass}" href="${g.url}" target="_blank" rel="noreferrer">${g.short} · ${g.date}</a>`).join('');
  els.manualA.value = boardResult?.pointsA ?? '';
  els.manualB.value = boardResult?.pointsB ?? '';
  els.manualGdA.value = boardResult?.gdA ?? '';
  els.manualGdB.value = boardResult?.gdB ?? '';
}

function closeDrawer() {
  els.boardDrawer.classList.remove('open');
  els.boardDrawer.setAttribute('aria-hidden', 'true');
}

async function importBoardGames() {
  if (!state.selectedBoard) return;
  const { matchId, boardNo } = state.selectedBoard;
  const match = matchById(matchId);
  const board = match.boards.find((b) => b.board === boardNo);
  const playerA = playerById(board.playerA);
  const playerB = playerById(board.playerB);
  els.importFeedback.textContent = 'Import en cours…';
  try {
    const games = await fetchHeadToHeadGames(playerA.chesscom, playerB.chesscom, els.rangeStart.value, els.rangeEnd.value);
    const payload = evaluateGames(games, playerA.chesscom);
    upsertBoardResult(matchId, boardNo, payload, false);
    els.importFeedback.textContent = `${games.length} parties importées.`;
    fillBoardDrawerData(matchId, boardNo);
    persistResults();
    renderAll();
  } catch (error) {
    els.importFeedback.textContent = 'Parties non disponibles — saisie manuelle';
    toast(`Import impossible: ${error.message}`);
  }
}

function evaluateGames(games, playerAUsername) {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  const mapped = games.map((g) => {
    const asWhite = g.white.username.toLowerCase() === playerAUsername.toLowerCase();
    const aResult = asWhite ? g.white.result : g.black.result;
    const bResult = asWhite ? g.black.result : g.white.result;
    const normalized = outcomeFromResultStrings(aResult, bResult);
    if (normalized === 'W') winsA += 1;
    if (normalized === 'L') winsB += 1;
    if (normalized === 'D') draws += 1;
    return {
      date: new Date(g.end_time * 1000).toLocaleDateString('fr-FR'),
      timeControl: g.time_control,
      url: g.url,
      short: normalized,
      resultClass: normalized.toLowerCase(),
    };
  });
  const winner = winsA > winsB ? 'A' : winsB > winsA ? 'B' : 'draw';
  return { games: mapped, winsA, winsB, draws, winner };
}

function outcomeFromResultStrings(aResult, bResult) {
  const winningMarkers = new Set(['win']);
  if (winningMarkers.has(aResult)) return 'W';
  if (winningMarkers.has(bResult)) return 'L';
  return 'D';
}

function upsertBoardResult(matchId, boardNo, payload, manual = false) {
  if (!state.results.matches[matchId]) state.results.matches[matchId] = { boards: {} };
  if (!state.results.matches[matchId].boards) state.results.matches[matchId].boards = {};
  const boardWeight = boardNo === 1 ? 2 : 1;
  let pointsA = 0;
  let pointsB = 0;
  if (payload.winner === 'A') pointsA = boardWeight;
  else if (payload.winner === 'B') pointsB = boardWeight;
  else {
    pointsA = 0.5;
    pointsB = 0.5;
  }
  state.results.matches[matchId].boards[boardNo] = {
    ...payload,
    pointsA,
    pointsB,
    gdA: payload.winsA - payload.winsB,
    gdB: payload.winsB - payload.winsA,
    manual,
    updatedAt: new Date().toISOString(),
  };
}

function validateBoard() {
  toast('Board validé.');
  persistResults();
  renderAll();
}

function applyManualOverride() {
  if (!state.selectedBoard) return;
  const { matchId, boardNo } = state.selectedBoard;
  const oldValue = state.results.matches?.[matchId]?.boards?.[boardNo] || null;
  const payload = {
    games: oldValue?.games || [],
    winsA: Number(oldValue?.winsA || 0),
    winsB: Number(oldValue?.winsB || 0),
    draws: Number(oldValue?.draws || 0),
    winner: Number(els.manualA.value) > Number(els.manualB.value) ? 'A' : Number(els.manualB.value) > Number(els.manualA.value) ? 'B' : 'draw',
    pointsA: Number(els.manualA.value || 0),
    pointsB: Number(els.manualB.value || 0),
    gdA: Number(els.manualGdA.value || 0),
    gdB: Number(els.manualGdB.value || 0),
    manual: true,
    updatedAt: new Date().toISOString(),
  };
  if (!state.results.matches[matchId]) state.results.matches[matchId] = { boards: {} };
  state.results.matches[matchId].boards[boardNo] = payload;
  logOverride({ matchId, boardNo, oldValue, newValue: payload, admin: 'local-admin' });
  persistResults();
  fillBoardDrawerData(matchId, boardNo);
  renderAll();
  toast('Override appliqué.');
}

function logOverride(entry) {
  state.results.overrideLog.unshift({ timestamp: new Date().toISOString(), ...entry });
  state.results.overrideLog = state.results.overrideLog.slice(0, 200);
  localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(state.results.overrideLog));
}

function renderOverrideLog() {
  if (!state.adminUnlocked) return;
  const logs = state.results.overrideLog || [];
  els.overrideLog.innerHTML = logs.length
    ? logs.map((log) => `<article class="match-card"><strong>${new Date(log.timestamp).toLocaleString('fr-FR')}</strong><p>Match ${log.matchId} · Board ${log.boardNo} · ${log.admin}</p><p class="muted">${JSON.stringify(log.oldValue)} → ${JSON.stringify(log.newValue)}</p></article>`).join('')
    : '<p class="muted">Aucun override enregistré.</p>';
}

function computeMatchScore(matchId) {
  const boards = state.results.matches?.[matchId]?.boards || {};
  const values = Object.values(boards);
  const pointsA = values.reduce((sum, b) => sum + Number(b.pointsA || 0), 0);
  const pointsB = values.reduce((sum, b) => sum + Number(b.pointsB || 0), 0);
  const gdA = values.reduce((sum, b) => sum + Number(b.gdA || 0), 0);
  const gdB = values.reduce((sum, b) => sum + Number(b.gdB || 0), 0);
  return { pointsA, pointsB, gdA, gdB, played: values.length > 0 };
}

function matchStatus(match) {
  const now = new Date();
  const start = new Date(match.kickoff);
  const end = new Date(match.end);
  const hasData = computeMatchScore(match.id).played;
  if (now >= start && now <= end) return 'live';
  if (hasData || now > end) return 'completed';
  return 'upcoming';
}

function isLiveWindow(now) {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return (day === 6 || day === 0) && hour >= 19 && hour < 22;
}

function startConditionalPolling() {
  if (!isLiveWindow(new Date())) return;
  state.pollingTimer = setInterval(async () => {
    if (!state.selectedBoard) return;
    await importBoardGames();
  }, 60000);
}

async function fetchHeadToHeadGames(playerA, playerB, startDate, endDate) {
  const archives = await getArchivesCached(playerA);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = archives
    .map((url) => {
      const parts = url.split('/').slice(-2);
      return { url, year: Number(parts[0]), month: Number(parts[1]) };
    })
    .filter((m) => {
      const first = new Date(Date.UTC(m.year, m.month - 1, 1));
      const last = new Date(Date.UTC(m.year, m.month, 0));
      return last >= start && first <= end;
    });

  const monthlyGames = await Promise.all(months.map((m) => fetchJSON(m.url)));
  const allGames = monthlyGames.flatMap((m) => m.games || []);
  const filtered = allGames.filter((g) => {
    const white = g.white.username.toLowerCase();
    const black = g.black.username.toLowerCase();
    const isOpposition = (white === playerA.toLowerCase() && black === playerB.toLowerCase()) || (white === playerB.toLowerCase() && black === playerA.toLowerCase());
    const date = new Date(g.end_time * 1000);
    return isOpposition && date >= start && date <= end;
  });
  filtered.sort((a, b) => b.end_time - a.end_time);
  return filtered.slice(0, 4);
}

async function getArchivesCached(username) {
  const cache = readJSON(STORAGE_ARCHIVE_KEY) || {};
  const key = username.toLowerCase();
  const recent = cache[key];
  const ttlMs = 6 * 60 * 60 * 1000;
  if (recent && Date.now() - recent.savedAt < ttlMs) return recent.archives;
  const response = await fetchJSON(`https://api.chess.com/pub/player/${username}/games/archives`);
  if (!response?.archives) throw new Error('archives indisponibles');
  cache[key] = { savedAt: Date.now(), archives: response.archives };
  localStorage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(cache));
  return response.archives;
}

async function fetchJSON(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 403 || response.status === 404) throw new Error('compte indisponible');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function exportResultsJSON() {
  const blob = new Blob([JSON.stringify(state.results, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'results.export.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function persistResults() {
  localStorage.setItem(STORAGE_RESULTS_KEY, JSON.stringify({ matches: state.results.matches }));
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function teamById(id) { return state.tournament.teams.find((t) => t.id === id); }
function playersByTeam(teamId) { return state.tournament.players.filter((p) => p.teamId === teamId); }
function playerById(id) { return state.tournament.players.find((p) => p.id === id); }
function matchById(id) { return state.tournament.matches.find((m) => m.id === id); }
function initials(name) { return name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function avatarHTML(name) { return `<span class="avatar-ring"><span>${initials(name)}</span></span>`; }
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove('show'), 2400);
}
