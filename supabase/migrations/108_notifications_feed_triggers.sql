-- Emit durable feed rows from DB-originated notification events
-- (in-review, task comments, reactions) so offline/API paths still write the feed.

create or replace function public.notify_task_in_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignee_profile uuid;
  assigner_person uuid;
  assigner_profile uuid;
  proj_name text;
  client_name text;
  assignee_name text;
  bulletin_id uuid;
  bulletin_title text;
  org_slug text;
  proj_slug text;
  client_slug text;
  feed_href text;
begin
  if TG_OP <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status <> 'upcoming'::public.task_status
     or new.status <> 'active'::public.task_status then
    return new;
  end if;

  if new.assignee_person_id is null or new.status_changed_by_profile_id is null then
    return new;
  end if;

  select p.profile_id into assignee_profile
  from public.people p
  where p.id = new.assignee_person_id;

  if assignee_profile is null
     or assignee_profile <> new.status_changed_by_profile_id then
    return new;
  end if;

  select p.id, p.profile_id
  into assigner_person, assigner_profile
  from public.people p
  where p.organization_id = new.organization_id
    and p.profile_id = new.created_by_profile_id
  limit 1;

  if assigner_person is null then
    select pr.manager_person_id into assigner_person
    from public.projects pr
    where pr.id = new.project_id;

    if assigner_person is not null then
      select p.profile_id into assigner_profile
      from public.people p
      where p.id = assigner_person;
    end if;
  end if;

  if assigner_person is null
     or assigner_profile is null
     or assigner_person = new.assignee_person_id then
    return new;
  end if;

  select pr.name, pr.slug, c.name, c.slug, o.slug
  into proj_name, proj_slug, client_name, client_slug, org_slug
  from public.projects pr
  left join public.clients c on c.id = pr.client_id
  left join public.organizations o on o.id = pr.organization_id
  where pr.id = new.project_id;

  select p.name into assignee_name
  from public.people p
  where p.id = new.assignee_person_id;

  if coalesce(trim(assignee_name), '') <> '' then
    bulletin_title := format(
      '%s submitted "%s" for review on the %s %s Project!',
      trim(assignee_name),
      coalesce(nullif(trim(new.title), ''), 'A task'),
      coalesce(nullif(trim(client_name), ''), 'Client'),
      coalesce(nullif(trim(proj_name), ''), 'Project')
    );
  else
    bulletin_title := format(
      '"%s" is ready for review on the %s %s Project!',
      coalesce(nullif(trim(new.title), ''), 'A task'),
      coalesce(nullif(trim(client_name), ''), 'Client'),
      coalesce(nullif(trim(proj_name), ''), 'Project')
    );
  end if;

  bulletin_id := gen_random_uuid();

  insert into public.bulletins (
    id,
    organization_id,
    project_id,
    task_id,
    title,
    body,
    pinned,
    audience,
    audience_person_ids,
    audience_pod_ids,
    tone,
    created_by_profile_id,
    created_at
  ) values (
    bulletin_id,
    new.organization_id,
    new.project_id,
    new.id,
    bulletin_title,
    '',
    false,
    'people',
    array[assigner_person]::uuid[],
    '{}'::uuid[],
    'success',
    null,
    coalesce(new.status_changed_at, now())
  );

  insert into public.bulletin_unreads (bulletin_id, profile_id, organization_id)
  values (bulletin_id, assigner_profile, new.organization_id);

  feed_href := format(
    '/%s/projects/%s/%s?task=%s',
    coalesce(nullif(trim(org_slug), ''), 'app'),
    coalesce(nullif(trim(client_slug), ''), 'uncategorized'),
    coalesce(nullif(trim(proj_slug), ''), 'project'),
    new.id
  );

  perform public.emit_notifications(
    new.organization_id,
    array[assigner_profile]::uuid[],
    'in_review',
    bulletin_title,
    'Task ready for review',
    feed_href,
    'bulletin',
    bulletin_id::text,
    new.assignee_person_id
  );

  return new;
end;
$$;

create or replace function public.notify_task_thread_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee uuid;
  v_assigner uuid;
  v_pm uuid;
  v_author_person uuid;
  v_project_id uuid;
  v_recipient_profiles uuid[];
  v_title text;
  v_org_slug text;
  v_proj_slug text;
  v_client_slug text;
  v_href text;
begin
  select p.id into v_author_person
  from public.people p
  where p.organization_id = new.organization_id
    and p.profile_id = new.author_profile_id
  limit 1;

  if v_author_person is null then
    return new;
  end if;

  insert into public.task_thread_subscribers (task_id, person_id, organization_id)
  values (new.task_id, v_author_person, new.organization_id)
  on conflict do nothing;

  select t.assignee_person_id, t.project_id, t.title
    into v_assignee, v_project_id, v_title
  from public.tasks t
  where t.id = new.task_id;

  select p.id into v_assigner
  from public.tasks t
  join public.people p
    on p.organization_id = t.organization_id
   and p.profile_id = t.created_by_profile_id
  where t.id = new.task_id
  limit 1;

  select pr.manager_person_id into v_pm
  from public.projects pr
  where pr.id = v_project_id;

  if v_assigner is null then
    v_assigner := v_pm;
  end if;

  if v_assignee is not null and v_assignee <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_assignee, new.organization_id)
    on conflict do nothing;
  end if;

  if v_assigner is not null and v_assigner <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_assigner, new.organization_id)
    on conflict do nothing;
  end if;

  if v_pm is not null and v_pm <> v_author_person then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    values (new.task_id, v_pm, new.organization_id)
    on conflict do nothing;
  end if;

  if v_project_id is not null then
    insert into public.task_thread_unreads (task_id, person_id, organization_id)
    select new.task_id, pm.person_id, new.organization_id
    from public.project_members pm
    where pm.project_id = v_project_id
      and pm.organization_id = new.organization_id
      and pm.person_id <> v_author_person
    on conflict do nothing;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  select new.task_id, s.person_id, new.organization_id
  from public.task_thread_subscribers s
  where s.task_id = new.task_id
    and s.person_id <> v_author_person
  on conflict do nothing;

  -- Feed rows for recipients who have profile_ids (client emit also runs; 2m dedupe).
  select coalesce(array_agg(distinct p.profile_id) filter (where p.profile_id is not null), '{}')
  into v_recipient_profiles
  from public.task_thread_unreads u
  join public.people p on p.id = u.person_id
  where u.task_id = new.task_id
    and u.organization_id = new.organization_id
    and u.person_id <> v_author_person
    and p.profile_id is distinct from new.author_profile_id;

  select o.slug, pr.slug, c.slug
  into v_org_slug, v_proj_slug, v_client_slug
  from public.projects pr
  left join public.clients c on c.id = pr.client_id
  left join public.organizations o on o.id = pr.organization_id
  where pr.id = v_project_id;

  v_href := format(
    '/%s/projects/%s/%s?task=%s&comment=%s',
    coalesce(nullif(trim(v_org_slug), ''), 'app'),
    coalesce(nullif(trim(v_client_slug), ''), 'uncategorized'),
    coalesce(nullif(trim(v_proj_slug), ''), 'project'),
    new.task_id,
    new.id
  );

  if cardinality(v_recipient_profiles) > 0 then
    perform public.emit_notifications(
      new.organization_id,
      v_recipient_profiles,
      'message',
      coalesce(
        (select name from public.people where id = v_author_person),
        'New comment'
      ),
      case
        when coalesce(nullif(trim(v_title), ''), '') <> '' then
          format('New comment on “%s”', trim(v_title))
        else 'New comment'
      end,
      v_href,
      'comment',
      new.id::text,
      v_author_person
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_task_thread_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_profile uuid;
  v_author_person uuid;
  v_task_id uuid;
  v_org uuid;
  v_reactor_person uuid;
  v_reactor_name text;
  v_task_title text;
  v_org_slug text;
  v_proj_slug text;
  v_client_slug text;
  v_href text;
begin
  select c.author_profile_id, c.task_id, c.organization_id
    into v_author_profile, v_task_id, v_org
  from public.task_comments c
  where c.id = new.comment_id;

  if v_author_profile is null or v_task_id is null then
    return new;
  end if;

  if v_author_profile = new.profile_id then
    return new;
  end if;

  select p.id into v_author_person
  from public.people p
  where p.organization_id = v_org
    and p.profile_id = v_author_profile
  limit 1;

  if v_author_person is null then
    return new;
  end if;

  insert into public.task_thread_unreads (task_id, person_id, organization_id)
  values (v_task_id, v_author_person, v_org)
  on conflict do nothing;

  select p.id, p.name into v_reactor_person, v_reactor_name
  from public.people p
  where p.organization_id = v_org
    and p.profile_id = new.profile_id
  limit 1;

  select t.title, o.slug, pr.slug, c.slug
  into v_task_title, v_org_slug, v_proj_slug, v_client_slug
  from public.tasks t
  join public.projects pr on pr.id = t.project_id
  left join public.clients c on c.id = pr.client_id
  left join public.organizations o on o.id = t.organization_id
  where t.id = v_task_id;

  v_href := format(
    '/%s/projects/%s/%s?task=%s&comment=%s',
    coalesce(nullif(trim(v_org_slug), ''), 'app'),
    coalesce(nullif(trim(v_client_slug), ''), 'uncategorized'),
    coalesce(nullif(trim(v_proj_slug), ''), 'project'),
    v_task_id,
    new.comment_id
  );

  perform public.emit_notifications(
    v_org,
    array[v_author_profile]::uuid[],
    'reaction',
    coalesce(nullif(trim(v_reactor_name), ''), 'Someone'),
    case
      when coalesce(nullif(trim(new.emoji), ''), '') <> '' then
        format('%s reacted to your comment', trim(new.emoji))
      else 'Reacted to your comment'
    end || case
      when coalesce(nullif(trim(v_task_title), ''), '') <> '' then
        format(E'\n%s', trim(v_task_title))
      else ''
    end,
    v_href,
    'comment',
    new.comment_id::text,
    v_reactor_person
  );

  return new;
end;
$$;
