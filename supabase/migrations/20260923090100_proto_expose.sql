-- Migration : proto_expose
-- Description : expose le schéma `proto` à PostgREST (E04-S01). Sans elle, supabase-js
-- ne peut pas lire `proto` (erreur PGRST106 « schema must be one of … ») et le serveur proto
-- n'a aucun accès à ses tables. Seul service_role y a des privilèges (migration proto).
--
-- Pourquoi en SQL et pas dans le tableau de bord : le jeton de l'API de gestion du banc est
-- révoqué (2026-09-23). La configuration en base de PostgREST (`pgrst.db_schemas` sur le rôle
-- authenticator) prime sur celle du tableau de bord : si l'on change un jour les schémas
-- exposés dans le tableau de bord, reprendre cette liste.
--
-- Rollback :
--   alter role authenticator reset pgrst.db_schemas;
--   notify pgrst, 'reload config';

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, proto';
notify pgrst, 'reload config';
