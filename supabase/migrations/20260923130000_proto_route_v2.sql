-- Migration : proto_route_v2
-- Description : corrige proto.route_candidates après la review E04-S02 (la v1 est dans
-- 20260923120000_proto_route.sql, jamais utilisée en campagne).
--   1. `lexical` se calcule sur les lexèmes de la requête D'ORIGINE : les termes ajoutés par le
--      vocabulaire peuvent marquer des lexèmes trouvés, mais n'allongent plus le dénominateur
--      (une requête faite d'un sigle, « ACC », n'est plus pénalisée).
--   2. `query_lexemes` rend ce nombre de lexèmes : routing.ts atténue `lexical` pour une requête
--      d'un seul mot (« relance » servait des étapes, avec lexical = 1 d'office).
--   3. Pré-tri sur la meilleure composante (phrases, titre, lexèmes) et non plus sur les seules
--      phrases : pages et tableaux, sans phrases, n'étaient plus triés que par chemin.
-- Changer le type de retour impose drop puis create.
--
-- Rollback : réappliquer 20260923120000_proto_route.sql après
--   drop function if exists proto.route_candidates(uuid, text, text, int);

drop function if exists proto.route_candidates(uuid, text, text, int);

create function proto.route_candidates(
  p_org uuid,
  p_query text,
  p_kind text default null,
  p_limit int default 50
)
returns table (
  node_id uuid,
  path text,
  title text,
  summary text,
  kind text,
  team_id uuid,
  s_trigger real,
  s_neighbor real,
  s_title real,
  lexical real,
  query_lexemes int
)
language sql
stable
set search_path = ''
as $$
  with words as (
    -- Requête normalisée, réduite à des mots séparés par une espace, bornée par deux espaces :
    -- un synonyme se cherche ainsi à frontière de mot (« rdv » oui, « ordv » non).
    select ' ' || trim(regexp_replace(proto.norm(p_query), '[^a-z0-9]+', ' ', 'g')) || ' ' as padded
  ),
  expanded as (
    select w.padded as original, w.padded || coalesce((
      select string_agg(proto.norm(v.term), ' ')
      from proto.vocabulary v
      where v.org_id = p_org
        and exists (
          select 1 from unnest(v.synonyms) s
          where w.padded like '% ' || trim(regexp_replace(proto.norm(s), '[^a-z0-9]+', ' ', 'g')) || ' %'
        )
    ), '') as q
    from words w
  ),
  qx as (
    select
      e.q,
      array(select distinct unnest(tsvector_to_array(to_tsvector('proto.fr'::regconfig, e.original)))) as own,
      array(select distinct unnest(tsvector_to_array(to_tsvector('proto.fr'::regconfig, e.q)))) as lex
    from expanded e
  ),
  cand as (
    select n.id, n.path, n.title, n.summary, n.kind, n.team_id
    from proto.nodes n
    where n.org_id = p_org
      and n.status = 'published'
      and n.path <> 'guide'
      and (p_kind is null or n.kind = p_kind)
  ),
  phrases as (
    select
      t.node_id,
      max(greatest(extensions.similarity(t.norm, qx.q), extensions.word_similarity(t.norm, qx.q)))
        filter (where t.sense = 'trigger') as s_trigger,
      max(greatest(extensions.similarity(t.norm, qx.q), extensions.word_similarity(t.norm, qx.q)))
        filter (where t.sense = 'neighbor') as s_neighbor
    from proto.triggers t
    cross join qx
    where t.node_id in (select c.id from cand c)
    group by t.node_id
  ),
  docs as (
    select
      c.id,
      array(
        select distinct unnest(
          tsvector_to_array(to_tsvector('proto.fr'::regconfig, c.title || ' ' || c.summary))
          || coalesce((
            select array_agg(l)
            from proto.triggers t2, unnest(tsvector_to_array(t2.tsv)) l
            where t2.node_id = c.id and t2.sense = 'trigger'
          ), '{}'::text[])
        )
      ) as lex
    from cand c
  ),
  scored as (
    select
      c.id,
      c.path,
      c.title,
      c.summary,
      c.kind,
      c.team_id,
      coalesce(p.s_trigger, 0)::real as s_trigger,
      coalesce(p.s_neighbor, 0)::real as s_neighbor,
      greatest(extensions.similarity(proto.norm(c.title), qx.q), extensions.word_similarity(proto.norm(c.title), qx.q))::real as s_title,
      (case
        when cardinality(qx.own) = 0 then 0
        else least(1, (select count(*) from unnest(qx.lex) l where l = any (d.lex))::real / cardinality(qx.own))
      end)::real as lexical,
      cardinality(qx.own) as query_lexemes
    from cand c
    cross join qx
    join docs d on d.id = c.id
    left join phrases p on p.node_id = c.id
  )
  select s.id, s.path, s.title, s.summary, s.kind, s.team_id, s.s_trigger, s.s_neighbor, s.s_title, s.lexical, s.query_lexemes
  from scored s
  order by greatest(s.s_trigger, s.s_title, s.lexical) desc, s.path
  limit p_limit
$$;

revoke execute on function proto.route_candidates(uuid, text, text, int) from public, anon, authenticated;
grant execute on function proto.route_candidates(uuid, text, text, int) to service_role;
