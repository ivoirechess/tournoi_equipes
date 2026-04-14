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
  players: document.getElementById('players'),
  authForm: document.getElementById('auth-form'),
  authState: document.getElementById('auth-state'),
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
};

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
  return true;
}

async function loadPublic() {
  const [{ data: standings }, { data: matches }, { data: teams }, { data: players }] = await Promise.all([
    supabase.from('standings').select('*').order('pool').order('rank_in_pool'),
    supabase.from('matches').select('*,team_a:teams!matches_team_a_id_fkey(name),team_b:teams!matches_team_b_id_fkey(name)').order('scheduled_at'),
    supabase.from('team_strength').select('*').order('strength_score', { ascending: false }),
    supabase.from('players').select('id,display_name,chess_username,is_captain,team_id,rapid_rating,blitz_rating,bullet_rating,peak_rapid,peak_blitz,peak_bullet,peak_global,teams(name)').order('display_name'),
  ]);

  els.standings.classList.remove('skeleton');
  els.standings.innerHTML = `<table><thead><tr><th>Poule</th><th>Rang</th><th>Équipe</th><th>Pts</th><th>Diff</th></tr></thead><tbody>${(standings || [])
    .map((r) => `<tr><td>${r.pool}</td><td>${r.rank_in_pool}</td><td>${r.team_name}</td><td>${r.points}</td><td>${r.goal_diff}</td></tr>`)
    .join('')}</tbody></table>`;

  els.matches.classList.remove('skeleton');
  els.matches.innerHTML = `<table><thead><tr><th>Date</th><th>Phase</th><th>Match</th><th>Score</th><th>Statut</th></tr></thead><tbody>${(matches || [])
    .map((m) => `<tr><td>${m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR') : '-'}</td><td>${m.phase}</td><td>${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</td><td>${m.score_a ?? '-'} - ${m.score_b ?? '-'}</td><td>${m.status}</td></tr>`)
    .join('')}</tbody></table>`;

  const semis = (matches || []).filter((m) => m.phase === 'semi');
  const final = (matches || []).find((m) => m.phase === 'final');
  els.bracket.classList.remove('skeleton');
  els.bracket.innerHTML = `<p>🏁 Demi 1: ${semis[0]?.team_a?.name || '?'} vs ${semis[0]?.team_b?.name || '?'}</p>
  <p>🏁 Demi 2: ${semis[1]?.team_a?.name || '?'} vs ${semis[1]?.team_b?.name || '?'}</p>
  <p>🏆 Finale: ${final?.team_a?.name || '?'} vs ${final?.team_b?.name || '?'}</p>`;

  els.teams.classList.remove('skeleton');
  const avgStrength = (teams || []).reduce((s, t) => s + Number(t.strength_score || 0), 0) / Math.max((teams || []).length, 1);
  els.teams.innerHTML = (teams || [])
    .map(
      (t) => `<div class="team-card"><h3>${t.team_name}</h3><p>Force équipe: <b>${Math.round(t.strength_score || 0)}</b></p><p>Moy. peak rapid: ${Math.round(t.avg_peak_rapid || 0)}</p><p>Total peak global: ${Math.round(t.sum_peak_global || 0)}</p><p>Écart vs moyenne: ${(Number(t.strength_score || 0) - avgStrength).toFixed(1)}</p></div>`,
    )
    .join('');

  els.players.classList.remove('skeleton');
  els.players.innerHTML = `<table><thead><tr><th>Joueur</th><th>Équipe</th><th>Rapid</th><th>Blitz</th><th>Bullet</th><th>Peak rapid</th><th>Peak blitz</th><th>Peak bullet</th><th>Peak global</th></tr></thead><tbody>${(players || [])
    .map(
      (p) => `<tr><td>${p.display_name} ${badge(p.is_captain)}</td><td>${p.teams?.name || '-'}</td><td>${p.rapid_rating ?? '-'}</td><td>${p.blitz_rating ?? '-'}</td><td>${p.bullet_rating ?? '-'}</td><td>${p.peak_rapid ?? '-'}</td><td>${p.peak_blitz ?? '-'}</td><td>${p.peak_bullet ?? '-'}</td><td>${p.peak_global ?? '-'}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const options = (teams || []).map((t) => `<option value="${t.team_id}">${t.team_name}</option>`).join('');
  els.playerTeam.innerHTML = options;
  const matchOptions = (matches || []).map((m) => `<option value="${m.id}">${m.phase} - ${m.team_a?.name || '?'} vs ${m.team_b?.name || '?'}</option>`).join('');
  els.windowMatch.innerHTML = matchOptions;
  els.overrideMatch.innerHTML = matchOptions;
  renderAdminRosters(teams || [], players || []);
}

function renderAdminRosters(teams, players) {
  els.rosterBox.innerHTML = `<table><thead><tr><th>Équipe</th><th>Joueur</th><th>Cap.</th><th>Action</th></tr></thead><tbody>${
    players
      .map((p) => `<tr><td>${p.teams?.name || 'Sans équipe'}</td><td>${p.display_name} (${p.chess_username})</td><td>${p.is_captain ? 'Oui' : 'Non'}</td><td><button data-del-player="${p.id}">Supprimer joueur</button></td></tr>`)
      .join('')
  }${teams.map((t) => `<tr><td>${t.team_name}</td><td colspan="2">-</td><td><button data-del-team="${t.team_id}">Supprimer équipe</button></td></tr>`).join('')}</tbody></table>`;
  for (const b of els.rosterBox.querySelectorAll('[data-del-player]')) {
    b.onclick = async () => {
      await supabase.from('players').delete().eq('id', Number(b.dataset.delPlayer));
      loadPublic();
    };
  }
  for (const b of els.rosterBox.querySelectorAll('[data-del-team]')) {
    b.onclick = async () => {
      await supabase.from('teams').delete().eq('id', Number(b.dataset.delTeam));
      loadPublic();
    };
  }
}

async function loadAdminGames() {
  const { data } = await supabase.from('games').select('id,match_id,board_no,played_at,white_username,black_username,result,excluded,game_url').order('played_at', { ascending: false }).limit(30);
  els.adminGames.innerHTML = `<table><thead><tr><th>Board</th><th>Partie</th><th>Résultat</th><th>Exclure</th></tr></thead><tbody>${(data || [])
    .map(
      (g) => `<tr><td>M${g.match_id} / #${g.board_no}</td><td><a href="${g.game_url}" target="_blank" rel="noreferrer">${g.white_username} vs ${g.black_username}</a></td><td>${g.result}</td><td><button data-exclude="${g.id}">${g.excluded ? 'Inclure' : 'Exclure'}</button></td></tr>`,
    )
    .join('')}</tbody></table>`;
  for (const b of els.adminGames.querySelectorAll('[data-exclude]')) {
    b.onclick = async () => {
      const id = Number(b.dataset.exclude);
      const { data: game } = await supabase.from('games').select('excluded').eq('id', id).single();
      await supabase.from('games').update({ excluded: !game.excluded }).eq('id', id);
      loadAdminGames();
      loadPublic();
    };
  }
}

els.authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setAdminState(error ? `❌ ${error.message}` : '✅ Connecté');
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
  if (!els.playerTeam.value) {
    setAdminState("❌ Ajoute d'abord au moins une équipe.", true);
    return;
  }
  const { error } = await supabase.from('players').insert({
    chess_username: document.getElementById('player-username').value,
    display_name: document.getElementById('player-name').value,
    team_id: Number(els.playerTeam.value),
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
  const { data: teams } = await supabase.from('teams').select('id');
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const updates = shuffled.map((t, i) => supabase.from('teams').update({ pool: i < 3 ? 'A' : 'B' }).eq('id', t.id));
  await Promise.all(updates);
  alert('Poule A/B re-tirées');
  loadPublic();
};

els.generatePlayoffs.onclick = async () => {
  const { data } = await supabase.rpc('generate_playoff_matches');
  alert(data || 'Phases finales générées');
  loadPublic();
};

els.syncElo.onclick = async () => {
  const { error } = await supabase.functions.invoke('sync-player-stats');
  alert(error ? error.message : 'ELO synchronisé');
  loadPublic();
};

els.windowForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await supabase.from('board_windows').upsert({
    match_id: Number(els.windowMatch.value),
    board_no: Number(document.getElementById('window-board').value),
    start_at: new Date(document.getElementById('window-start').value).toISOString(),
    end_at: new Date(document.getElementById('window-end').value).toISOString(),
  });
  alert('Intervalle sauvegardé');
});

els.syncGames.onclick = async () => {
  const { error } = await supabase.functions.invoke('sync-chess-games', { body: { match_id: Number(els.windowMatch.value) } });
  alert(error ? error.message : 'Parties importées');
  loadAdminGames();
  loadPublic();
};

els.overrideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await supabase
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
  alert('Override appliqué');
  loadPublic();
});

els.refreshPublic.onclick = loadPublic;

setInterval(loadPublic, 60000);
await loadPublic();
await loadAdminGames();
