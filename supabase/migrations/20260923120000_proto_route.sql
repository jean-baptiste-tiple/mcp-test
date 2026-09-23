-- Migration : proto_route
-- Description : routage lexical du serveur proto (E04-S02, architecture §9.4). Sans cette
-- fonction, <prefix>_context ne peut reconnaître aucune procédure et <prefix>_find ne trouve rien.
--
-- Aucun embedding : trigrammes (pg_trgm) sur les phrases stockées et le titre, plein texte
-- français sans accents (proto.fr) sur phrases, titre et résumé, requête enrichie par le
-- vocabulaire de l'organisation. La fonction rend les COMPOSANTES du score ; le mélange, les
-- bonus (équipe, usage) et les seuils sont dans src/proto/services/routing.ts, où la calibration
-- se fait sans nouvelle migration.
--
-- Rollback :
--   drop function if exists proto.route_candidates(uuid, text, text, int);

create or replace function proto.route_candidates(
  p_org uuid,
  p_query text,
  p_kind text default null,
  p_limit int default 20
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
  lexical real
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
    select w.padded || coalesce((
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
    select e.q, array(select distinct unnest(tsvector_to_array(to_tsvector('proto.fr'::regconfig, e.q)))) as lex
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
  )
  select
    c.id,
    c.path,
    c.title,
    c.summary,
    c.kind,
    c.team_id,
    coalesce(p.s_trigger, 0)::real,
    coalesce(p.s_neighbor, 0)::real,
    greatest(extensions.similarity(proto.norm(c.title), qx.q), extensions.word_similarity(proto.norm(c.title), qx.q))::real,
    (case
      when cardinality(qx.lex) = 0 then 0
      else (select count(*) from unnest(qx.lex) l where l = any (d.lex))::real / cardinality(qx.lex)
    end)::real
  from cand c
  cross join qx
  join docs d on d.id = c.id
  left join phrases p on p.node_id = c.id
  order by greatest(coalesce(p.s_trigger, 0), 0) desc, c.path
  limit p_limit
$$;

revoke execute on function proto.route_candidates(uuid, text, text, int) from public, anon, authenticated;
grant execute on function proto.route_candidates(uuid, text, text, int) to service_role;
