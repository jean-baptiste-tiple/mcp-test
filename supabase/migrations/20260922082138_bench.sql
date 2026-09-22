-- Migration : bench
-- Description : schéma du banc MCP — registre (bench_scenarios, bench_tools) et journal
-- (bench_events), architecture §4. Sans ces tables, /api/mcp n'a rien à servir :
-- loadSnapshot() ne trouve aucun scénario actif, tools/list est vide et aucune requête
-- JSON-RPC n'est mesurable. Le seed en fin de fichier rend l'endpoint utile dès le push.
--
-- RLS : activé sur les 3 tables, AUCUNE policy (ADR-002 §3). Ce n'est pas un oubli —
-- c'est la configuration voulue : sans policy, les clés publiques (anon, authenticated)
-- n'ont aucun accès, et le seul chemin de lecture/écriture est la clé secrète utilisée par
-- src/lib/supabase/admin.ts, qui bypasse RLS. Une policy ouverte exposerait autant en
-- dispersant l'accès (alternative écartée dans l'ADR).
--
-- Périmètre : les colonnes/checks couvrent l'epic E01 entier tel que figé par architecture
-- §4, pour n'écrire qu'une migration de schéma. Lues par le code dès S02 : slug,
-- server_name/title/version, instructions, is_active, et tout bench_tools sauf `version`,
-- plus les colonnes de bench_events remplies par parseRpcBody(). Non encore lues (S03/S04,
-- mêmes tables) : readme_content, readme_lever, ack_ttl_seconds, bench_tools.version,
-- bench_events.list_changed_sent / is_error / error_text, et les valeurs non-'echo' du
-- check `handler`.
--
-- Rollback :
--   drop table if exists bench_events;
--   drop table if exists bench_tools;
--   drop table if exists bench_scenarios;

-- 1. Tables

create table if not exists bench_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  notes text,
  server_name text not null default 'mcp-bench',
  server_title text,
  server_version text not null default '1.0.0',
  instructions text not null default '',
  readme_content text,
  readme_lever text not null default 'none'
    check (readme_lever in ('none', 'instructions', 'descriptions', 'name_first', 'gate', 'ack', 'hub')),
  ack_ttl_seconds int,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bench_tools (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references bench_scenarios (id) on delete cascade,
  name text not null,
  title text,
  description text not null default '',
  input_schema jsonb not null default '{"type":"object","properties":{}}'::jsonb,
  annotations jsonb,
  handler text not null default 'echo'
    check (handler in ('echo', 'whoami', 'mutate', 'readme')),
  enabled boolean not null default true,
  version int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, name)
);

create table if not exists bench_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  scenario_slug text,
  server_version text,
  method text not null,
  rpc_id text,
  client_name text,
  client_version text,
  protocol_version text,
  user_agent text,
  ip text,
  session_id text,
  tool_name text,
  args jsonb,
  tools_served int,
  response_chars int,
  list_changed_sent boolean,
  is_error boolean not null default false,
  error_text text
);

-- 2. Index
-- Un seul scénario actif à la fois : l'index partiel n'indexe que les lignes true, qui
-- partagent donc toutes la même valeur — l'unicité les limite à une.
create unique index if not exists idx_bench_scenarios_active
  on bench_scenarios (is_active) where is_active;

-- loadSnapshot() lit les tools d'un scénario ; sort_order en 2e colonne sert le tri.
create index if not exists idx_bench_tools_scenario_sort
  on bench_tools (scenario_id, sort_order);

-- Dépouillement : les N derniers événements, puis le filtre par empreinte (ADR-001 :
-- stateless, l'empreinte user_agent+ip est le seul lien entre deux requêtes d'un host).
create index if not exists idx_bench_events_ts on bench_events (ts desc);
create index if not exists idx_bench_events_fingerprint on bench_events (user_agent, ip, ts);

-- 3. RLS (aucune policy — voir en-tête)
alter table bench_scenarios enable row level security;
alter table bench_tools enable row level security;
alter table bench_events enable row level security;

-- 4. Seed — scénario de référence, servi dès le premier appel de /api/mcp
insert into bench_scenarios (slug, notes, server_name, server_title, server_version, instructions, is_active)
values (
  'baseline',
  'Référence : un seul tool, description au format imposé, aucun levier readme.',
  'mcp-bench',
  'MCP Bench',
  '1.0.0',
  'MCP Bench: a test server that measures how MCP hosts read tools and instructions. Tools echo their arguments.',
  true
)
on conflict (slug) do nothing;

insert into bench_tools (scenario_id, name, title, description, input_schema, annotations, handler, sort_order)
select
  s.id,
  'bench_echo',
  'Echo',
  'Returns its arguments unchanged. Use this when asked to echo or to test a tool call. Do not use for anything else.',
  '{"type":"object","properties":{"message":{"type":"string","description":"Text to echo back"}}}'::jsonb,
  '{"readOnlyHint": true, "idempotentHint": true, "openWorldHint": false}'::jsonb,
  'echo',
  0
from bench_scenarios s
where s.slug = 'baseline'
on conflict (scenario_id, name) do nothing;
