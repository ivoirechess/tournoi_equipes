-- Ajoute des champs de profil Chess.com de manière idempotente.
-- Compatible avec une base déjà provisionnée.

alter table if exists public.players
  add column if not exists avatar_url text,
  add column if not exists chess_title text,
  add column if not exists country_code text;

-- Optionnel: index pour recherches / tris par pays.
create index if not exists idx_players_country_code on public.players(country_code);
