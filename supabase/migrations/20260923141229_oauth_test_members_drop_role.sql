-- Migration : oauth_test_members_drop_role
-- Description : retire `oauth_test.members.role` (review isolée d'E03-S01, M3).
-- Surface sans consommateur (coding-standards §Surfaces nouvelles) : aucun fichier de src/, scripts/ ni
-- tests/ ne la lit ni ne l'écrit. L'appartenance est binaire (ADR-004 §5 : membre ou non, relu sous le
-- jeton) et whoami rend `membership: { member: true }` : rien ne casse sans elle. Gardée, elle laisserait
-- croire qu'un rôle décide d'un accès.
-- PostgREST recharge son cache seul (déclencheur d'événements pgrst_ddl_watch de Supabase).
--
-- Rollback :
--   alter table oauth_test.members add column role text not null default 'member';

alter table oauth_test.members drop column role;
