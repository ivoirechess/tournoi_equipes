-- =========================================================
-- SCRIPT SUPABASE COMPLET - VERSION CORRIGÉE v2
-- Corrections : trigger auto-profil, colonnes manquantes,
--               politiques RLS cohérentes
-- =========================================================

-- 1) Extensions
create extension if not exists "uuid-ossp";

-- =========================================================
-- 2) TABLE PROFILES
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  full_name text,
  lichess_username text unique,
  chesscom_username text unique,
  elo_fide integer,
  elo_fide_verified boolean not null default false,
  elo_lichess integer,
  elo_chesscom integer,
  elo_chesscom_rapid integer,
  elo_lichess_rapid integer,
  avatar_url text,
  bio text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
on public.profiles for select using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Admins peuvent modifier tous les profils (pour valider elos, etc.)
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
on public.profiles for update
using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- =========================================================
-- 3) TRIGGER AUTO-CRÉATION PROFIL À L'INSCRIPTION
-- (C'était le bug principal : sans ce trigger, aucun profil
--  n'est créé quand un utilisateur s'inscrit via Supabase Auth)
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, is_admin)
  values (
    new.id,
    -- Username par défaut = partie avant @ de l'email, rendu unique avec suffix
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)
    ),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    (new.id = 'd9edbeba-10fb-42c9-ab4d-1977852d7623'::uuid)
  )
  on conflict (id) do update
  set is_admin = excluded.is_admin or public.profiles.is_admin;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bootstrap admin existant (si le profil est déjà présent)
update public.profiles
set is_admin = true
where id = 'd9edbeba-10fb-42c9-ab4d-1977852d7623'::uuid;

-- =========================================================
-- 4) ENUMS LIGUE
-- =========================================================
do $$ begin
  create type public.saison_statut as enum ('inscriptions', 'en_cours', 'terminee');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_resultat as enum ('blanc', 'nul', 'noir');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_statut as enum ('en_attente', 'valide', 'rejete');
exception when duplicate_object then null;
end $$;

-- =========================================================
-- 5) TABLES LIGUE
-- =========================================================
create table if not exists public.saisons (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  date_debut date not null,
  date_fin date not null,
  statut public.saison_statut not null default 'inscriptions',
  max_joueurs_par_division integer not null default 8,
  nb_montes integer not null default 1,
  nb_descentes integer not null default 1,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.divisions (
  id uuid primary key default uuid_generate_v4(),
  saison_id uuid not null references public.saisons (id) on delete cascade,
  nom text not null,
  ordre integer not null check (ordre > 0),
  created_at timestamptz not null default now(),
  unique (saison_id, ordre)
);

create table if not exists public.participations_ligue (
  id uuid primary key default uuid_generate_v4(),
  joueur_id uuid not null references public.profiles (id) on delete cascade,
  saison_id uuid not null references public.saisons (id) on delete cascade,
  division_id uuid references public.divisions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (joueur_id, saison_id)
);

create table if not exists public.matchs_ligue (
  id uuid primary key default uuid_generate_v4(),
  saison_id uuid not null references public.saisons (id) on delete cascade,
  division_id uuid not null references public.divisions (id) on delete cascade,
  joueur_blanc_id uuid not null references public.profiles (id) on delete cascade,
  joueur_noir_id uuid not null references public.profiles (id) on delete cascade,
  resultat public.match_resultat,
  statut public.match_statut not null default 'en_attente',
  round integer,
  lien_partie text,
  note_admin text,
  modifie_par_admin boolean not null default false,
  created_at timestamptz not null default now(),
  check (joueur_blanc_id <> joueur_noir_id)
);

create table if not exists public.match_results_pending (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matchs_ligue(id) on delete cascade,
  soumis_par uuid not null references public.profiles(id) on delete cascade,
  resultat_propose public.match_resultat not null,
  lien_partie text,
  created_at timestamptz not null default now(),
  unique(match_id)
);

-- =========================================================
-- 6) INDEXES LIGUE
-- =========================================================
create index if not exists idx_saisons_statut on public.saisons (statut);
create index if not exists idx_divisions_saison on public.divisions (saison_id, ordre);
create index if not exists idx_participations_saison_division on public.participations_ligue (saison_id, division_id);
create index if not exists idx_matchs_division_statut on public.matchs_ligue (division_id, statut);

-- =========================================================
-- 7) RLS LIGUE
-- =========================================================
alter table public.saisons enable row level security;
alter table public.divisions enable row level security;
alter table public.participations_ligue enable row level security;
alter table public.matchs_ligue enable row level security;
alter table public.match_results_pending enable row level security;

-- Lecture publique
drop policy if exists "Saisons lisibles" on public.saisons;
create policy "Saisons lisibles" on public.saisons for select using (true);

drop policy if exists "Divisions lisibles" on public.divisions;
create policy "Divisions lisibles" on public.divisions for select using (true);

drop policy if exists "Participations lisibles" on public.participations_ligue;
create policy "Participations lisibles" on public.participations_ligue for select using (true);

drop policy if exists "Matchs lisibles" on public.matchs_ligue;
create policy "Matchs lisibles" on public.matchs_ligue for select using (true);

-- Écriture : authenticated (l'app vérifie is_admin côté serveur)
drop policy if exists "Saisons write authenticated" on public.saisons;
create policy "Saisons write authenticated" on public.saisons
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Divisions write authenticated" on public.divisions;
create policy "Divisions write authenticated" on public.divisions
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Participation insert par joueur" on public.participations_ligue;
create policy "Participation insert par joueur" on public.participations_ligue
for insert with check (auth.uid() = joueur_id);

drop policy if exists "Participation update authenticated" on public.participations_ligue;
create policy "Participation update authenticated" on public.participations_ligue
for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Matchs write authenticated" on public.matchs_ligue;
create policy "Matchs write authenticated" on public.matchs_ligue
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Pending results
drop policy if exists "Pending insert joueur" on public.match_results_pending;
create policy "Pending insert joueur" on public.match_results_pending
for insert with check (auth.uid() = soumis_par);

drop policy if exists "Pending lisible joueur ou admin" on public.match_results_pending;
create policy "Pending lisible joueur ou admin" on public.match_results_pending
for select using (
  auth.uid() = soumis_par
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Pending delete admin" on public.match_results_pending;
create policy "Pending delete admin" on public.match_results_pending
for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- =========================================================
-- 8) SUGGESTIONS
-- =========================================================
create table if not exists public.suggestions (
  id uuid primary key default uuid_generate_v4(),
  auteur_id uuid references public.profiles(id) on delete set null,
  contenu text not null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'lue', 'traitee')),
  created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

drop policy if exists "Suggestions insert par membre" on public.suggestions;
create policy "Suggestions insert par membre" on public.suggestions
for insert with check (auth.uid() = auteur_id);

drop policy if exists "Suggestions lisibles admin" on public.suggestions;
create policy "Suggestions lisibles admin" on public.suggestions
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Suggestions update admin" on public.suggestions;
create policy "Suggestions update admin" on public.suggestions
for update using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- =========================================================
-- 9) ANNONCES
-- =========================================================
create table if not exists public.annonces (
  id uuid primary key default uuid_generate_v4(),
  titre text not null,
  contenu text not null,
  auteur_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.annonces enable row level security;

drop policy if exists "Annonces lisibles" on public.annonces;
create policy "Annonces lisibles" on public.annonces for select using (true);

drop policy if exists "Annonces write admin" on public.annonces;
create policy "Annonces write admin" on public.annonces
for all
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- =========================================================
-- 10) LIENS UTILES
-- =========================================================
create table if not exists public.liens_utiles (
  id uuid primary key default uuid_generate_v4(),
  titre text not null,
  url text not null,
  categorie text not null default 'general'
    check (categorie in ('tournoi', 'boutique', 'formation', 'regle', 'general')),
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.liens_utiles enable row level security;

drop policy if exists "Liens lisibles" on public.liens_utiles;
create policy "Liens lisibles" on public.liens_utiles for select using (true);

drop policy if exists "Liens write admin" on public.liens_utiles;
create policy "Liens write admin" on public.liens_utiles
for all
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- =========================================================
-- 11) TOURNOIS PONCTUELS - ENUMS
-- =========================================================
do $$ begin
  create type public.tournoi_format as enum
    ('swiss', 'elimination_directe', 'poules_finale', 'equipes_match', 'equipes_swiss');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tournoi_statut as enum
    ('brouillon', 'inscriptions', 'en_cours', 'termine');
exception when duplicate_object then null;
end $$;

-- =========================================================
-- 12) TOURNOIS PONCTUELS - TABLES
-- =========================================================
create table if not exists public.tournois (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  format public.tournoi_format not null,
  statut public.tournoi_statut not null default 'brouillon',
  date_debut date,
  date_fin date,
  nb_rondes integer,
  max_joueurs integer,
  description text,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.tournois enable row level security;

drop policy if exists "Tournois lisibles" on public.tournois;
create policy "Tournois lisibles" on public.tournois for select using (true);

drop policy if exists "Tournois write admin" on public.tournois;
create policy "Tournois write admin" on public.tournois
for all
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create table if not exists public.inscriptions_tournoi (
  id uuid primary key default uuid_generate_v4(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  joueur_id uuid not null references public.profiles(id) on delete cascade,
  equipe text,
  created_at timestamptz not null default now(),
  unique (tournoi_id, joueur_id)
);

alter table public.inscriptions_tournoi enable row level security;

drop policy if exists "Inscriptions tournoi lisibles" on public.inscriptions_tournoi;
create policy "Inscriptions tournoi lisibles" on public.inscriptions_tournoi for select using (true);

drop policy if exists "Inscription tournoi insert joueur" on public.inscriptions_tournoi;
create policy "Inscription tournoi insert joueur" on public.inscriptions_tournoi
for insert with check (auth.uid() = joueur_id);

-- Admin peut inscrire n'importe qui
drop policy if exists "Inscription tournoi insert admin" on public.inscriptions_tournoi;
create policy "Inscription tournoi insert admin" on public.inscriptions_tournoi
for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

drop policy if exists "Inscription tournoi delete joueur" on public.inscriptions_tournoi;
create policy "Inscription tournoi delete joueur" on public.inscriptions_tournoi
for delete using (auth.uid() = joueur_id);

-- Admin peut modifier équipes
drop policy if exists "Inscription tournoi update admin" on public.inscriptions_tournoi;
create policy "Inscription tournoi update admin" on public.inscriptions_tournoi
for update using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Admin peut supprimer des inscriptions
drop policy if exists "Inscription tournoi delete admin" on public.inscriptions_tournoi;
create policy "Inscription tournoi delete admin" on public.inscriptions_tournoi
for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

create table if not exists public.matchs_tournoi (
  id uuid primary key default uuid_generate_v4(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  joueur_blanc_id uuid references public.profiles(id) on delete set null,
  joueur_noir_id uuid references public.profiles(id) on delete set null,
  resultat public.match_resultat,
  statut public.match_statut not null default 'en_attente',
  round integer not null,
  poule text,
  lien_partie text,
  note_admin text,
  modifie_par_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.matchs_tournoi enable row level security;

drop policy if exists "Matchs tournoi lisibles" on public.matchs_tournoi;
create policy "Matchs tournoi lisibles" on public.matchs_tournoi for select using (true);

drop policy if exists "Matchs tournoi write admin" on public.matchs_tournoi;
create policy "Matchs tournoi write admin" on public.matchs_tournoi
for all
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- =========================================================
-- FIN DU SCRIPT
-- =========================================================
