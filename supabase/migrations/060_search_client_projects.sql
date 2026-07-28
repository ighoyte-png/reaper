-- When a client matches search, also return that client's projects.

create or replace function public.search_org(
  p_query text,
  p_limit int default 40
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  snippet text,
  project_id uuid,
  task_id uuid,
  client_id uuid,
  hit_rank real
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  org uuid := public.current_org_id();
  q text := trim(coalesce(p_query, ''));
  pat text;
  lim int := least(greatest(coalesce(p_limit, 40), 1), 80);
  per int;
  project_lim int;
begin
  if org is null or char_length(q) < 2 then
    return;
  end if;

  -- Neutralize ilike wildcards from user input
  pat := '%' || replace(replace(q, '%', ''), '_', '') || '%';
  if pat = '%%' then
    return;
  end if;

  per := greatest(3, lim / 4);
  -- Allow more projects so a matched client's full portfolio can surface
  project_lim := least(lim, 40);

  return query
  with matched_clients as (
    select
      c.id,
      c.name,
      nullif(
        trim(
          concat_ws(
            ' ',
            nullif(trim(c.contact_first_name), ''),
            nullif(trim(c.contact_last_name), '')
          )
        ),
        ''
      ) as contact_name,
      left(public.search_plain(c.notes), 140) as notes_snippet,
      (
        case when c.name ilike pat then 3 else 0 end
        + case when c.contact_email ilike pat then 2 else 0 end
        + case
            when concat_ws(' ', c.contact_first_name, c.contact_last_name) ilike pat
            then 2
            else 0
          end
        + case when public.search_plain(c.notes) ilike pat then 1 else 0 end
      )::real as hit_rank
    from public.clients c
    where c.organization_id = org
      and (
        c.name ilike pat
        or c.contact_email ilike pat
        or concat_ws(' ', c.contact_first_name, c.contact_last_name) ilike pat
        or public.search_plain(c.notes) ilike pat
      )
    order by hit_rank desc, c.name asc
    limit per
  ),
  hits as (
    (
      select
        'client'::text as kind,
        mc.id,
        mc.name as title,
        mc.contact_name as subtitle,
        mc.notes_snippet as snippet,
        null::uuid as project_id,
        null::uuid as task_id,
        mc.id as client_id,
        mc.hit_rank
      from matched_clients mc
    )
    union all
    (
      select
        'project'::text,
        p.id,
        p.name,
        coalesce(cl.name, ''),
        left(public.search_plain(p.notes), 140),
        p.id,
        null::uuid,
        p.client_id,
        (
          case when p.name ilike pat then 3 else 0 end
          + case when public.search_plain(p.notes) ilike pat then 1 else 0 end
          + case
              when p.client_id in (select mc.id from matched_clients mc)
              then 2
              else 0
            end
        )::real
      from public.projects p
      left join public.clients cl on cl.id = p.client_id
      where p.organization_id = org
        and (
          p.name ilike pat
          or public.search_plain(p.notes) ilike pat
          or p.client_id in (select mc.id from matched_clients mc)
        )
      order by 9 desc, p.name asc
      limit project_lim
    )
    union all
    (
      select
        'task'::text,
        t.id,
        t.title,
        coalesce(p.name, ''),
        left(public.search_plain(t.notes), 140),
        t.project_id,
        t.id,
        p.client_id,
        (
          case when t.title ilike pat then 3 else 0 end
          + case when public.search_plain(t.notes) ilike pat then 1 else 0 end
        )::real
      from public.tasks t
      join public.projects p on p.id = t.project_id
      where t.organization_id = org
        and (
          t.title ilike pat
          or public.search_plain(t.notes) ilike pat
        )
      order by 9 desc, t.title asc
      limit per
    )
    union all
    (
      select
        'comment'::text,
        tc.id,
        coalesce(nullif(t.title, ''), 'Comment'),
        coalesce(p.name, ''),
        left(public.search_plain(tc.body), 140),
        t.project_id,
        t.id,
        p.client_id,
        (
          case when public.search_plain(tc.body) ilike pat then 2 else 0 end
        )::real
      from public.task_comments tc
      join public.tasks t on t.id = tc.task_id
      join public.projects p on p.id = t.project_id
      where tc.organization_id = org
        and public.search_plain(tc.body) ilike pat
      order by 9 desc, tc.created_at desc
      limit per
    )
  )
  select
    h.kind,
    h.id,
    h.title,
    h.subtitle,
    h.snippet,
    h.project_id,
    h.task_id,
    h.client_id,
    h.hit_rank
  from hits h
  order by h.hit_rank desc, h.title asc
  limit lim;
end;
$$;

revoke all on function public.search_org(text, int) from public;
grant execute on function public.search_org(text, int) to authenticated;
