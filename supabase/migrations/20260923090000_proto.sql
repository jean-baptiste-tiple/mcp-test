-- Migration : proto
-- Description : schéma `proto` de la maquette de la plateforme MCP d'entreprise (E04-S01,
-- architecture §9.3). Sans lui, /api/proto/u/<utilisateur>/mcp n'a ni utilisateur à résoudre,
-- ni contexte à servir, ni code ctx à vérifier, ni journal où écrire.
--
-- RLS : activée sur les 13 tables, AUCUNE policy, privilèges à service_role seulement
-- (ADR-003 §3). Le seul chemin est la clé secrète de src/lib/supabase/admin.ts ; les droits
-- d'équipe sont appliqués par les services (sans jeton utilisateur, la RLS ne peut pas les porter).
--
-- Périmètre : le modèle entier d'architecture §9.3 d'un bloc, comme E01-S02. Colonnes lues
-- seulement par les stories suivantes : triggers.norm/tsv et vocabulary (routage, S02),
-- nodes.draft et node_versions au-delà de la révision 1 (write, S03), rows.claimed_by /
-- lease_until / provenance et mail_drafts (call, S04).
--
-- Rollback :
--   drop schema if exists proto cascade;

-- 1. Schéma, extensions, normalisation

create schema if not exists proto;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Déclarée immutable pour servir dans une colonne générée : unaccent ne l'est pas (son
-- dictionnaire pourrait changer), mais le dictionnaire est ici nommé explicitement.
create or replace function proto.norm(t text)
returns text
language sql
immutable
parallel safe
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

-- Plein texte français sans accents : « réponds » et « reponds » donnent le même lexème.
do $$
begin
  if not exists (
    select 1 from pg_ts_config c join pg_namespace n on n.oid = c.cfgnamespace
    where n.nspname = 'proto' and c.cfgname = 'fr'
  ) then
    create text search configuration proto.fr (copy = pg_catalog.french);
    alter text search configuration proto.fr
      alter mapping for hword, hword_part, word with extensions.unaccent, french_stem;
  end if;
end $$;

-- 2. Tables

create table proto.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  prefix text not null unique check (prefix ~ '^[a-z][a-z0-9]{1,11}$'),
  domains text, -- null : description de <prefix>_context sans domaines (mesure 6)
  topics jsonb not null default '[]'::jsonb,
  rules_version int not null default 1,
  created_at timestamptz not null default now()
);

create table proto.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references proto.orgs (id) on delete cascade,
  slug text not null,
  name text not null,
  lead_user_id uuid,
  rules text not null default '',
  connectors jsonb not null default '{}'::jsonb, -- {connecteur: "read" | "write"}
  unique (org_id, slug)
);

create table proto.users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references proto.orgs (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'), -- segment d'URL (ADR-003)
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  default_team_id uuid references proto.teams (id) on delete set null,
  profile jsonb not null default '{}'::jsonb -- {langue, ton, preferences}
);

alter table proto.teams
  add constraint teams_lead_user_id_fkey
  foreign key (lead_user_id) references proto.users (id) on delete set null;

create table proto.team_members (
  team_id uuid not null references proto.teams (id) on delete cascade,
  user_id uuid not null references proto.users (id) on delete cascade,
  primary key (team_id, user_id)
);

create table proto.nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references proto.orgs (id) on delete cascade,
  team_id uuid references proto.teams (id) on delete cascade, -- null : nœud d'organisation
  path text not null check (path ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'),
  title text not null,
  summary text not null check (char_length(summary) <= 200),
  kind text not null check (kind in ('page', 'procedure', 'table')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  revision int not null default 0, -- 0 : jamais publié
  sections jsonb not null default '[]'::jsonb, -- [{title, body}] publiées
  draft jsonb, -- {sections, title, summary, triggers, neighbors, base_revision}
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid references proto.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (org_id, path)
);

create table proto.node_versions (
  node_id uuid not null references proto.nodes (id) on delete cascade,
  revision int not null,
  title text not null,
  summary text not null,
  sections jsonb not null,
  author uuid references proto.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (node_id, revision)
);

create table proto.triggers (
  id bigint generated always as identity primary key,
  node_id uuid not null references proto.nodes (id) on delete cascade,
  phrase text not null,
  sense text not null check (sense in ('trigger', 'neighbor')),
  norm text generated always as (proto.norm(phrase)) stored,
  tsv tsvector generated always as (to_tsvector('proto.fr'::regconfig, phrase)) stored
);

create table proto.vocabulary (
  id bigint generated always as identity primary key,
  org_id uuid not null references proto.orgs (id) on delete cascade,
  term text not null,
  synonyms text[] not null default '{}'
);

create table proto.rows (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references proto.nodes (id) on delete cascade,
  key text not null,
  values jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb, -- {colonne: {origin, by, at, reason}}
  claimed_by text,
  lease_until timestamptz,
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  unique (node_id, key)
);

create table proto.mail_drafts (
  id text primary key,
  org_id uuid not null references proto.orgs (id) on delete cascade,
  user_id uuid references proto.users (id) on delete set null,
  to_addr text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table proto.ctx (
  code text primary key check (code ~ '^[0-9A-Z]{4}-[0-9A-Z]{4}$'),
  org_id uuid not null references proto.orgs (id) on delete cascade,
  user_id uuid not null references proto.users (id) on delete cascade,
  rules_version int not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table proto.journal (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  org_id uuid references proto.orgs (id) on delete cascade,
  user_id uuid references proto.users (id) on delete cascade,
  team_id uuid references proto.teams (id) on delete set null,
  ctx text,
  method text not null,
  tool text,
  target text, -- fonction ou chemin
  args jsonb, -- tronqués à 2 ko
  args_chars int,
  result_chars int,
  is_error boolean not null default false,
  error text,
  duration_ms int,
  client_name text,
  user_agent text
);

create table proto.feedback (
  id bigint generated always as identity primary key, -- numéro de ticket
  org_id uuid not null references proto.orgs (id) on delete cascade,
  user_id uuid references proto.users (id) on delete set null,
  ctx text,
  type text not null check (type in ('friction', 'gap', 'error')),
  text text not null,
  created_at timestamptz not null default now()
);

-- 3. Index

create index idx_proto_triggers_norm on proto.triggers using gin (norm extensions.gin_trgm_ops);
create index idx_proto_triggers_tsv on proto.triggers using gin (tsv);
create index idx_proto_triggers_node on proto.triggers (node_id);
create index idx_proto_nodes_org_kind on proto.nodes (org_id, kind);
create index idx_proto_rows_node on proto.rows (node_id);
create index idx_proto_ctx_user on proto.ctx (user_id, created_at desc);
-- Dépouillement : un ctx = une conversation ; usage par cible pour les bonus de routage.
create index idx_proto_journal_ts on proto.journal (ts desc);
create index idx_proto_journal_ctx on proto.journal (ctx, ts);
create index idx_proto_journal_org_target on proto.journal (org_id, target);

-- 4. RLS (aucune policy — voir en-tête)

alter table proto.orgs enable row level security;
alter table proto.teams enable row level security;
alter table proto.users enable row level security;
alter table proto.team_members enable row level security;
alter table proto.nodes enable row level security;
alter table proto.node_versions enable row level security;
alter table proto.triggers enable row level security;
alter table proto.vocabulary enable row level security;
alter table proto.rows enable row level security;
alter table proto.mail_drafts enable row level security;
alter table proto.ctx enable row level security;
alter table proto.journal enable row level security;
alter table proto.feedback enable row level security;

-- 5. Privilèges : service_role seulement

revoke all on schema proto from public, anon, authenticated;
grant usage on schema proto to service_role;
grant all on all tables in schema proto to service_role;
grant all on all sequences in schema proto to service_role;
revoke execute on all functions in schema proto from public, anon, authenticated;
grant execute on all functions in schema proto to service_role;
alter default privileges in schema proto grant all on tables to service_role;
alter default privileges in schema proto grant all on sequences to service_role;
alter default privileges in schema proto revoke execute on functions from public;
alter default privileges in schema proto grant execute on functions to service_role;
