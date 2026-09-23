-- Migration : oauth_test_admin
-- Description : fonctions d'observation et de révocation du schéma `auth` pour la campagne E03
-- (E03-S07, architecture §10.7, ADR-004 §6, ADR-002 §3).
-- Sans elles, la campagne ne peut ni voir les sessions d'un compte, ni les révoquer (preuve 8), ni
-- lire telle quelle la ligne qu'un host a enregistrée, sauf en SQL par `DATABASE_URL` (mot de passe
-- du propriétaire de la base : tout `auth` lisible, secrets compris) : le jeton de l'API de gestion
-- Supabase est révoqué et `auth` n'est pas exposé à PostgREST. Chaque fonction rend une vue bornée de
-- `auth`, jamais un secret ni un jeton, à la clé secrète qu'emploient déjà les scripts.
--
-- Ce qui casse sans chaque fonction :
--   auth_columns          les colonnes des tables du serveur OAuth changent d'une version de Supabase
--                         Auth à l'autre : le protocole ne peut pas nommer ce qu'il relève.
--   registered_clients    la ligne de `auth.oauth_clients` (colonnes non secrètes) telle que le host
--                         l'a enregistrée ; l'API d'administration (`auth.admin.oauth.listClients`)
--                         n'en rend que la vue choisie par Supabase Auth.
--   user_sessions         aucun moyen de voir les sessions d'un compte ni ses refresh tokens (l'API
--                         d'administration n'a pas de lecture des sessions).
--   revoke_user_sessions  la révocation par suppression de session (preuve 8) exigerait du SQL par
--                         `DATABASE_URL` ou par JB (`auth.admin.signOut` veut un jeton du compte).
--   revoke_client_grants  retirer le consentement d'un compte à un client exigerait de se connecter
--                         comme ce compte sur /auth-test/grants.
--
-- Lignes rendues en jsonb (`to_jsonb(ligne)`), privées de toute clé dont le nom contient `secret`,
-- `hash` ou `token` (hachage du secret client, clé HMAC des refresh tokens…) : les colonnes ne sont
-- pas connues à l'avance. Une table absente ne lève rien (zéro ligne ou 0, avec un `raise notice`) ;
-- le nom du client et `created_at` sont lus dans le jsonb (`client_name`, sinon `name`), pour qu'une
-- colonne absente donne « aucune correspondance » ou « pas de tri » plutôt qu'une erreur, sans SQL
-- dynamique. Email inconnu : exception `compte inconnu : <email>` (SQLSTATE P0002).
--
-- Droits : `security definer` (le propriétaire de la migration lit et supprime dans `auth`),
-- `search_path = ''` (tout est qualifié ; les opérateurs viennent de pg_catalog, toujours cherché en
-- premier), exécution réservée à `service_role` (clé secrète : scripts et tests, ADR-002 §3) ;
-- `public`, `anon` et `authenticated` n'ont rien (`anon` n'a déjà pas l'usage du schéma).
--
-- Rollback :
--   drop function if exists oauth_test.revoke_client_grants(text, text);
--   drop function if exists oauth_test.revoke_user_sessions(text);
--   drop function if exists oauth_test.user_sessions(text);
--   drop function if exists oauth_test.registered_clients();
--   drop function if exists oauth_test.auth_columns();

-- 1. Colonnes des tables `auth` du serveur OAuth (information_schema : une table absente n'a pas de ligne)

create or replace function oauth_test.auth_columns()
returns table (table_name text, column_name text, data_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.table_name::text, c.column_name::text, c.data_type::text
  from information_schema.columns as c
  where c.table_schema = 'auth'
    and c.table_name in ('oauth_clients', 'oauth_authorizations', 'oauth_consents', 'sessions', 'refresh_tokens', 'users')
  order by c.table_name, c.ordinal_position;
$$;

-- 2. Clients enregistrés, les plus récents d'abord

create or replace function oauth_test.registered_clients()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.to_regclass('auth.oauth_clients') is null then
    raise notice 'auth.oauth_clients absente : aucun client';
    return;
  end if;
  return query
    select (
      select pg_catalog.jsonb_object_agg(e.key, e.value)
      from pg_catalog.jsonb_each(pg_catalog.to_jsonb(c)) as e
      where e.key !~* '(secret|hash|token)'
    )
    from auth.oauth_clients as c
    order by (pg_catalog.to_jsonb(c) ->> 'created_at')::timestamptz desc nulls last;
end;
$$;

-- 3. Sessions d'un compte, avec le nombre de refresh tokens de chacune et de révoqués

create or replace function oauth_test.user_sessions(p_email text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users as u where pg_catalog.lower(u.email) = pg_catalog.lower(p_email);
  if v_user_id is null then
    raise exception 'compte inconnu : %', p_email using errcode = 'P0002';
  end if;
  return query
    select (
      select pg_catalog.jsonb_object_agg(e.key, e.value)
      from pg_catalog.jsonb_each(pg_catalog.to_jsonb(s)) as e
      where e.key !~* '(secret|hash|token)'
    ) || pg_catalog.jsonb_build_object('refresh_tokens_total', t.total, 'refresh_tokens_revoked', t.revoked)
    from auth.sessions as s
    cross join lateral (
      select pg_catalog.count(*) as total, pg_catalog.count(*) filter (where r.revoked) as revoked
      from auth.refresh_tokens as r
      where r.session_id = s.id
    ) as t
    where s.user_id = v_user_id
    order by s.created_at desc;
end;
$$;

-- 4. Révocation : toutes les sessions du compte (la cascade emporte leurs refresh tokens)

create or replace function oauth_test.revoke_user_sessions(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  select u.id into v_user_id from auth.users as u where pg_catalog.lower(u.email) = pg_catalog.lower(p_email);
  if v_user_id is null then
    raise exception 'compte inconnu : %', p_email using errcode = 'P0002';
  end if;
  delete from auth.sessions as s where s.user_id = v_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5. Révocation : consentements et autorisations du compte pour un client, désigné par son nom.
--    Les sessions ouvertes par ce client (`auth.sessions.oauth_client_id`) restent, et ses refresh
--    tokens avec : `revokeGrant` de Supabase Auth les supprime, cette fonction non (revoke_user_sessions).

create or replace function oauth_test.revoke_client_grants(p_email text, p_client_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer;
  v_total integer := 0;
begin
  select u.id into v_user_id from auth.users as u where pg_catalog.lower(u.email) = pg_catalog.lower(p_email);
  if v_user_id is null then
    raise exception 'compte inconnu : %', p_email using errcode = 'P0002';
  end if;
  if pg_catalog.to_regclass('auth.oauth_clients') is null then
    raise notice 'auth.oauth_clients absente : rien à révoquer';
    return 0;
  end if;

  if pg_catalog.to_regclass('auth.oauth_consents') is null then
    raise notice 'auth.oauth_consents absente';
  else
    delete from auth.oauth_consents as x
    using auth.oauth_clients as c
    where x.client_id = c.id
      and x.user_id = v_user_id
      and coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name') = p_client_name;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end if;

  if pg_catalog.to_regclass('auth.oauth_authorizations') is null then
    raise notice 'auth.oauth_authorizations absente';
  else
    delete from auth.oauth_authorizations as x
    using auth.oauth_clients as c
    where x.client_id = c.id
      and x.user_id = v_user_id
      and coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name') = p_client_name;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end if;

  return v_total;
end;
$$;

-- 6. Privilèges : service_role seulement

revoke all on function
  oauth_test.auth_columns(),
  oauth_test.registered_clients(),
  oauth_test.user_sessions(text),
  oauth_test.revoke_user_sessions(text),
  oauth_test.revoke_client_grants(text, text)
from public, anon, authenticated;

grant execute on function
  oauth_test.auth_columns(),
  oauth_test.registered_clients(),
  oauth_test.user_sessions(text),
  oauth_test.revoke_user_sessions(text),
  oauth_test.revoke_client_grants(text, text)
to service_role;
