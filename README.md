# IvoireChess Team Championship 2026 — Frontend statique

Refonte UI/UX premium du manager de tournoi avec logique complète de score sur **5 échiquiers** (échiquier 1 = 2 pts, échiquiers 2-5 = 1 pt, nul = 0.5 / 0.5), tie-breaker GD, et import Chess.com des 4 dernières parties d'un duel.

## Structure

- `index.html` : layout principal (hero, classement, affiches, équipes, joueurs, panneau admin caché).
- `styles.css` : direction artistique premium (palette or/orange, Bebas/Oswald/Inter, cartes, halos, motif damier, drawer mobile-friendly).
- `src/app.js` : logique applicative (render, scoring, import API Chess.com, cache local, override, export JSON).
- `data/tournament.json` : **source de vérité figée** (équipes, joueurs, rounds, matchups board-by-board).
- `data/results.json` : base des résultats dynamiques.

## Données et persistance

1. Le planning + rosters vivent uniquement dans `data/tournament.json`.
2. Les résultats sont initialisés depuis `data/results.json`.
3. En runtime, les modifications admin sont persistées en local via:
   - `localStorage[ivoirechess.results.v2]` pour les scores,
   - `localStorage[ivoirechess.chesscom.archives.v1]` pour le cache d'archives API Chess.com,
   - `localStorage[ivoirechess.override.log.v1]` pour le journal d'override.
4. Le bouton **Exporter results.json** permet de sauvegarder les résultats modifiés.

## Workflow admin

1. Activer le **Mode admin** (code local par défaut: `ivoire2026`, à remplacer dans `src/app.js`).
2. Cliquer un match, puis un échiquier.
3. Définir la fenêtre (début/fin) puis cliquer **Importer les 4 dernières parties**.
4. Vérifier les 4 pastilles W/L/D puis valider le board.
5. En cas d'API indisponible, utiliser l'override manuel (points + GD), traçable dans le journal.

## API Chess.com utilisée

- `GET https://api.chess.com/pub/player/{username}/games/archives`
- `GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`

Le moteur filtre les parties `A vs B` (insensible à la casse), limite aux 4 plus récentes dans la plage, et calcule automatiquement gagnant board + GD.
