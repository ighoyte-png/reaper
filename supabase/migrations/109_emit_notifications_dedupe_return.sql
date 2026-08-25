-- Prefer returning an existing recent row id on dedupe so client emit can still
-- fan-out Web Push when the DB trigger won the race.

create or replace function public.emit_notifications(
  p_organization_id uuid,
  p_recipient_profile_ids uuid[],
  p_kind text,
  p_title text,
  p_body text default '',
  p_href text default '/',
  p_entity_type text default null,
  p_entity_id text default null,
  p_actor_person_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  inserted uuid[] := '{}';
  recip uuid;
begin
  if p_organization_id is null then
    return inserted;
  end if;
  if p_recipient_profile_ids is null or cardinality(p_recipient_profile_ids) = 0 then
    return inserted;
  end if;

  foreach recip in array p_recipient_profile_ids
  loop
    if recip is null then
      continue;
    end if;
    -- Light dedupe: same recipient/kind/entity within 2 minutes.
    if p_entity_id is not null then
      select n.id into rid
      from public.notifications n
      where n.recipient_profile_id = recip
        and n.kind = p_kind
        and n.entity_id = p_entity_id
        and n.created_at > now() - interval '2 minutes'
      order by n.created_at desc
      limit 1;
      if rid is not null then
        inserted := array_append(inserted, rid);
        continue;
      end if;
    end if;

    insert into public.notifications (
      organization_id,
      recipient_profile_id,
      kind,
      title,
      body,
      href,
      entity_type,
      entity_id,
      actor_person_id
    )
    values (
      p_organization_id,
      recip,
      p_kind,
      coalesce(nullif(trim(p_title), ''), 'Notification'),
      coalesce(p_body, ''),
      coalesce(nullif(trim(p_href), ''), '/'),
      p_entity_type,
      p_entity_id,
      p_actor_person_id
    )
    returning id into rid;

    inserted := array_append(inserted, rid);
  end loop;

  return inserted;
end;
$$;
