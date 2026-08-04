-- Notify task assigner when assignee moves Active → In Review (upcoming → active).

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

  select pr.name, c.name
  into proj_name, client_name
  from public.projects pr
  left join public.clients c on c.id = pr.client_id
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

  return new;
end;
$$;

drop trigger if exists trg_notify_task_in_review on public.tasks;
create trigger trg_notify_task_in_review
  after update on public.tasks
  for each row
  execute function public.notify_task_in_review();
