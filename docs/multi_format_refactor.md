# IvoireChess multi-format refactor (audit + architecture)

## 1) Audit of team-only assumptions found

The legacy UI and state model were tightly bound to one team cup:

- Hero and public copy explicitly hardcoded around `Team Championship`, pools A/B and fixed 4 boards.
- Single global `matches` source rendered as team-vs-team only (no individual pairings abstraction).
- Admin flows tied to teams/boards (`window-match`, board number inputs) rather than selecting a fixture from a tournament calendar.
- Player table mixed global identity and tournament membership by using `team_id` directly, with no registration layer.
- Bracket and standings assumed pool->semi->final progression.

## 2) Target modular architecture

### Core global entities
- `players` (persistent player directory)
- `clubs`
- `teams`
- `tournaments`
- `tournament_formats`

### Tournament-scoped entities
- `tournament_registrations`
- `rounds`
- `fixtures`
- `pairings`
- `games`
- `standings_snapshots`
- `tie_break_values`

### UI architecture
- Tournament selector drives the whole page context.
- Public widgets become format-aware modules (standings, fixtures, teams, bracket).
- Admin widgets become tournament-centric modules:
  1. context summary
  2. registrations
  3. calendar manager
  4. chess.com fixture import

## 3) Format engine concept

The `FORMAT_REGISTRY` maps each `format_type` to declarative capabilities:

- `supportsTeams`
- `supportsBracket`
- `roundLabel`

Then each format can later attach specialized strategy functions:

- `generateRounds(registrations, settings)`
- `generatePairings(roundContext)`
- `computeStandings(results)`
- `applyProgression(state)`

## 4) Calendar-first Chess.com import workflow

Implemented workflow in UI:
1. Select tournament
2. Select round/matchday
3. Select exact fixture
4. Show expected players/boards
5. Pick search time window
6. Search candidate Chess.com games
7. Preview candidates
8. Confirm selected games
9. Persist in `games` linked to the selected fixture

## 5) Future extensibility path

To add a new format:
1. Add `format_type` and metadata in `FORMAT_REGISTRY`.
2. Create a rules module for pairing/standings/progression.
3. Register any public/admin widgets specific to that format.
4. Reuse shared registration/calendar/import infrastructure.

