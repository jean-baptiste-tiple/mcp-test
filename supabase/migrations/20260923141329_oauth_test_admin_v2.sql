-- Migration : oauth_test_admin_v2
-- Description : compléments des fonctions d'observation et de révocation de la campagne E03 (E03-S07,
-- dette relevée à l'implémentation ; architecture §10.7, ADR-004 §6, ADR-002 §3). Remplace trois
-- fonctions de 20260923134030_oauth_test_admin.sql (create or replace, mêmes signatures) et en ajoute deux.
--
-- Ce qui casse sans chaque changement :
--   revoke_client_grants  supprimait consentements et autorisations mais laissait les sessions que le
--                         client avait ouvertes (`auth.sessions.oauth_client_id`), refresh tokens compris :
--                         le host « révoqué » rafraîchissait encore ses jetons. `revokeGrant` de Supabase
--                         Auth (page /auth-test/grants) supprime ces sessions ; la fonction aussi, et rend le
--                         total consentements + autorisations + sessions (la cascade emporte les refresh
--                         tokens, non comptés).
--   oauth_authorizations  aucune lecture de `auth.oauth_authorizations` : `resource` (RFC 8707), `scope`,
--                         `redirect_uri`, `status` et la méthode PKCE demandés par un host ne se relevaient
--                         que par SQL direct.
--   oauth_consents        aucune lecture de `auth.oauth_consents` : ni qui a consenti à quel client, ni les
--                         scopes accordés, ni la révocation (`revoked_at`).
--   registered_clients,   le filtre `secret|hash|token` masquait `token_endpoint_auth_method` (un réglage du
--   user_sessions         client, pas un secret) ; user_sessions ne nommait pas le client d'une session
--                         (`oauth_client_id` seul).
--
-- Clés retirées des lignes (rendues en jsonb, colonnes non connues à l'avance) :
--   registered_clients, user_sessions      secret|hash|hmac|refresh_token|access_token : `client_secret_hash`,
--                                          `refresh_token_hmac_key`, `refresh_token_counter` ;
--                                          `token_endpoint_auth_method` reste visible.
--   oauth_authorizations, oauth_consents   code|nonce|secret|hash|hmac|token, sauf `code_challenge_method`
--                                          (S256 ou plain, relevé par la campagne) : `authorization_code`,
--                                          `code_challenge`, `nonce`. `token` en plus : aucune colonne de ces
--                                          deux tables ne le porte aujourd'hui, un jeton qu'y ajouterait une
--                                          version de Supabase Auth n'en sortirait pas.
-- Chaque ligne d'autorisation ou de consentement reçoit `client_name` (`auth.oauth_clients` : `client_name`,
-- sinon `name`, lus dans le jsonb comme dans 20260923134030) et `email` (`auth.users`), null sans
-- correspondance (autorisation pas encore liée à un compte, par exemple) ; chaque session, `client_name`.
-- `p_email` null : toutes les lignes ; email inconnu : exception `compte inconnu : <email>` (P0002), comme
-- les autres fonctions. user_sessions lit désormais `auth.oauth_clients` sans `to_regclass` : présente dès
-- que le serveur OAuth de Supabase existe, prérequis d'E03 (`auth.sessions.oauth_client_id` de même).
--
-- Droits : security definer, `search_path = ''`, exécution à `service_role` seul, comme 20260923134030.
-- Revoke et grant réaffirmés pour les cinq fonctions touchées : create or replace garde les droits d'une
-- fonction existante, mais une fonction créée reçoit EXECUTE pour PUBLIC.
--
-- Rollback :
--   drop function if exists oauth_test.oauth_consents(text);
--   drop function if exists oauth_test.oauth_authorizations(text);
--   puis rejouer les sections 2, 3 et 5 de 20260923134030_oauth_test_admin.sql (registered_clients,
--   user_sessions et revoke_client_grants dans leur version précédente).

-- 1. Clients enregistrés, les plus récents d'abord : filtre affiné

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
      where e.key !~* '(secret|hash|hmac|refresh_token|access_token)'
    )
    from auth.oauth_clients as c
    order by (pg_catalog.to_jsonb(c) ->> 'created_at')::timestamptz desc nulls last;
end;
$$;

-- 2. Sessions d'un compte : filtre affiné, nom du client OAuth, refresh tokens et révoqués

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
      where e.key !~* '(secret|hash|hmac|refresh_token|access_token)'
    ) || pg_catalog.jsonb_build_object(
      'client_name', coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name'),
      'refresh_tokens_total', t.total,
      'refresh_tokens_revoked', t.revoked
    )
    from auth.sessions as s
    left join auth.oauth_clients as c on c.id = s.oauth_client_id
    cross join lateral (
      select pg_catalog.count(*) as total, pg_catalog.count(*) filter (where r.revoked) as revoked
      from auth.refresh_tokens as r
      where r.session_id = s.id
    ) as t
    where s.user_id = v_user_id
    order by s.created_at desc;
end;
$$;

-- 3. Autorisations (toutes, ou celles d'un compte), les plus récentes d'abord

create or replace function oauth_test.oauth_authorizations(p_email text default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_email is not null then
    select u.id into v_user_id from auth.users as u where pg_catalog.lower(u.email) = pg_catalog.lower(p_email);
    if v_user_id is null then
      raise exception 'compte inconnu : %', p_email using errcode = 'P0002';
    end if;
  end if;
  if pg_catalog.to_regclass('auth.oauth_authorizations') is null then
    raise notice 'auth.oauth_authorizations absente : aucune autorisation';
    return;
  end if;
  return query
    select (
      select pg_catalog.jsonb_object_agg(e.key, e.value)
      from pg_catalog.jsonb_each(pg_catalog.to_jsonb(a)) as e
      where e.key !~* '(code|nonce|secret|hash|hmac|token)' or e.key = 'code_challenge_method'
    ) || pg_catalog.jsonb_build_object(
      'client_name', coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name'),
      'email', u.email
    )
    from auth.oauth_authorizations as a
    left join auth.oauth_clients as c on c.id = a.client_id
    left join auth.users as u on u.id = a.user_id
    where v_user_id is null or a.user_id = v_user_id
    order by (pg_catalog.to_jsonb(a) ->> 'created_at')::timestamptz desc nulls last;
end;
$$;

-- 4. Consentements (tous, ou ceux d'un compte), les plus récents d'abord

create or replace function oauth_test.oauth_consents(p_email text default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_email is not null then
    select u.id into v_user_id from auth.users as u where pg_catalog.lower(u.email) = pg_catalog.lower(p_email);
    if v_user_id is null then
      raise exception 'compte inconnu : %', p_email using errcode = 'P0002';
    end if;
  end if;
  if pg_catalog.to_regclass('auth.oauth_consents') is null then
    raise notice 'auth.oauth_consents absente : aucun consentement';
    return;
  end if;
  return query
    select (
      select pg_catalog.jsonb_object_agg(e.key, e.value)
      from pg_catalog.jsonb_each(pg_catalog.to_jsonb(x)) as e
      where e.key !~* '(code|nonce|secret|hash|hmac|token)' or e.key = 'code_challenge_method'
    ) || pg_catalog.jsonb_build_object(
      'client_name', coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name'),
      'email', u.email
    )
    from auth.oauth_consents as x
    left join auth.oauth_clients as c on c.id = x.client_id
    left join auth.users as u on u.id = x.user_id
    where v_user_id is null or x.user_id = v_user_id
    order by (pg_catalog.to_jsonb(x) ->> 'granted_at')::timestamptz desc nulls last;
end;
$$;

-- 5. Révocation : consentements, autorisations et sessions du compte pour un client, désigné par son nom
--    (comme revokeGrant de Supabase Auth pour les sessions ; la cascade emporte leurs refresh tokens).
--    Rend le total des trois.

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

  delete from auth.sessions as s
  using auth.oauth_clients as c
  where s.oauth_client_id = c.id
    and s.user_id = v_user_id
    and coalesce(pg_catalog.to_jsonb(c) ->> 'client_name', pg_catalog.to_jsonb(c) ->> 'name') = p_client_name;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

-- 6. Privilèges : service_role seulement (voir en-tête)

revoke all on function
  oauth_test.registered_clients(),
  oauth_test.user_sessions(text),
  oauth_test.oauth_authorizations(text),
  oauth_test.oauth_consents(text),
  oauth_test.revoke_client_grants(text, text)
from public, anon, authenticated;

grant execute on function
  oauth_test.registered_clients(),
  oauth_test.user_sessions(text),
  oauth_test.oauth_authorizations(text),
  oauth_test.oauth_consents(text),
  oauth_test.revoke_client_grants(text, text)
to service_role;
