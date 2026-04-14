# Tournoi d'échecs par équipes (GitHub Pages + Supabase)

Application statique premium pour gérer un tournoi d'échecs par équipes : interface publique + console admin, stockage dans Supabase, import automatique des parties Chess.com et synchronisation ELO.

## Stack
- Frontend statique: HTML/CSS/JS (module ES + supabase-js CDN).
- Backend data: Supabase PostgreSQL + RLS.
- Intégrations: API Chess.com + Supabase Edge Functions.

## Déploiement rapide
1. Créer un projet Supabase.
2. Exécuter les migrations dans l'ordre:
   - `001_init.sql`
   - `002_seed_matches.sql`
   - `003_scoring_recompute.sql`
   - `005_fix_admin_table_permissions.sql`
   - `006_hardening_idempotent.sql`
   - `007_players_chesscom_profile_fields.sql`
   > `004_supabase_complet_v2.sql` est optionnelle et concerne les tables "ligue" avancées.
3. Déployer les edge functions:
   - `supabase functions deploy sync-player-stats`
   - `supabase functions deploy sync-chess-games`
4. Définir les secrets edge functions:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Créer un utilisateur admin Supabase Auth puis lui attribuer `app_metadata.role = admin`.
6. Adapter les constantes Supabase dans `src/app.js` si URL/clé changent.
7. Publier ce dépôt sur GitHub et activer GitHub Pages (branche principale / root).

## Fonctionnalités clés
- Gestion complète des équipes, joueurs, poules, scores, exclusions manuelles.
- Classements poules: points + différence de buts.
- Génération demi-finales/finale selon classement.
- Support départage capitaines via table `captain_tiebreak_sets`.
- Import des 4 parties rapides/échiquier depuis Chess.com sur plage horaire admin.
- Profil joueurs avec rapid/blitz/bullet + pics ELO.
- Récupération Chess.com enrichie: avatars, titre et pays des joueurs.
- Force d'équipe via vue `team_strength`.

## Sécurité
- RLS activé sur toutes les tables d'écriture.
- Lecture publique autorisée.
- Écriture réservée aux comptes avec `app_metadata.role = admin`.

## Notes produit
- Le frontend est compatible mobile (tables scrollables, cartes responsives).
- Pour le replay PGN avancé, brancher un viewer (ex: chessground/chessboard.js) dans la section parties.
- Pour le suivi live avec Stockfish, prévoir un worker WASM côté client pour éviter blocage UI.
