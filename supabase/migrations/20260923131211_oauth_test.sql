-- Migration : oauth_test
-- Description : schéma `oauth_test` du serveur auth-test (E03-S01, architecture §10.3, ADR-004).
-- Sans lui, /api/auth-test/mcp ne résout aucune organisation par son hôte (404 partout), ne peut
-- relire aucune appartenance sous le jeton et n'a aucun journal où écrire : la campagne E03 ne
-- prouve rien. La migration ne fait qu'ajouter un schéma : `bench_*` et `proto` ne sont pas touchés.
--
-- Ce qui casse sans chaque table :
--   orgs     l'organisation vient du nom d'hôte appelé, jamais du jeton (ADR-004 §4) : sans elle,
--            aucun hôte ne sert d'organisation ni de préfixe d'outils.
--   members  l'appartenance est relue à chaque tools/call sous le jeton de l'utilisateur (§5) : sans
--            elle, rien ne distingue un membre d'un non-membre, et aucun retrait n'est possible.
--   journal  le journal fait foi (FR-AUTH-07) : il garde aussi les 401, les hôtes inconnus et les
--            consentements, que la RLS ne laisserait pas écrire au nom de l'utilisateur (§6).
--
-- RLS : activée sur les trois tables. `orgs` et `members` : select pour `authenticated`, limité à
-- ses organisations et à ses lignes ; `journal` : aucune policy. Privilèges : usage et select sur
-- `orgs` et `members` à `authenticated`, tout à `service_role`, rien à `anon`. Toute écriture passe
-- par la clé secrète (seed, scripts, journal, comptes de test : ADR-002 §3).
--
-- Exposition à PostgREST EN TÊTE : les NOTIFY partent à la validation, dans l'ordre d'émission, et
-- le premier DDL émet `reload schema` (déclencheur d'événements pgrst_ddl_watch de Supabase). Placé
-- avant, `reload config` fait lire la nouvelle liste avant le rechargement du cache ; placé après,
-- le cache serait rechargé avec l'ancienne liste (E04-S01 a dû relancer `reload schema` à la main).
-- La liste reprend celle de 20260923090100_proto_expose.sql (`proto` conservé), plus `oauth_test`.
--
-- Rollback (l'exposition d'abord, pour que PostgREST ne recharge pas un schéma disparu) :
--   alter role authenticator set pgrst.db_schemas = 'public, graphql_public, proto';
--   notify pgrst, 'reload config';
--   drop schema if exists oauth_test cascade;

-- 1. Exposition PostgREST (voir en-tête)

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, proto, oauth_test';
notify pgrst, 'reload config';

-- 2. Schéma et tables

create schema if not exists oauth_test;

create table if not exists oauth_test.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  prefix text not null unique check (prefix ~ '^[a-z][a-z0-9]{1,11}$'), -- outils <prefix>_whoami
  host text not null unique check (host ~ '^[a-z0-9.-]+$'), -- minuscules, sans port ni espace
  created_at timestamptz not null default now()
);

create table if not exists oauth_test.members (
  org_id uuid not null references oauth_test.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null, -- copie pour le journal et les scripts (auth.users n'est pas exposé)
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists oauth_test.journal (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  host text,
  path text,
  method text, -- JSON-RPC (initialize, tools/list, tools/call) ou HTTP (lecture des métadonnées)
  tool text,
  decision text not null check (decision in (
    'unauthenticated', 'invalid_token', 'unknown_host', 'allowed', 'denied_not_member', 'consent', 'metadata'
  )),
  reason text, -- motif d'un refus (signature, expired, issuer…), jamais le jeton
  user_id uuid, -- sans clé étrangère, comme org_slug : le journal survit aux comptes et aux organisations
  email text,
  org_slug text,
  client_id text,
  client_name text,
  token jsonb, -- résumé de claims (summarizeClaims), jamais le jeton brut
  consent jsonb, -- page de consentement : {stage, client, redirect_uri, scope}
  user_agent text,
  ip text
);

-- 3. RLS

alter table oauth_test.orgs enable row level security;
alter table oauth_test.members enable row level security;
alter table oauth_test.journal enable row level security;

-- `(select auth.uid())` : évalué une fois par requête, pas une fois par ligne.
create policy members_select_own on oauth_test.members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- La sous-requête passe elle-même par la RLS de members : elle ne voit que les lignes de l'utilisateur.
create policy orgs_select_member on oauth_test.orgs
  for select to authenticated
  using (id in (select m.org_id from oauth_test.members m where m.user_id = (select auth.uid())));

-- journal : aucune policy (voir en-tête).

-- 4. Privilèges

revoke all on schema oauth_test from public, anon;
grant usage on schema oauth_test to authenticated, service_role;
revoke all on all tables in schema oauth_test from public, anon, authenticated;
grant select on oauth_test.orgs, oauth_test.members to authenticated;
grant all on all tables in schema oauth_test to service_role;
grant all on all sequences in schema oauth_test to service_role;
