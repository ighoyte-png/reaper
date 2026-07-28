-- Bulletin audience: selected pods in addition to selected people
alter table public.bulletins
  add column if not exists audience_pod_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Bulletins: audience enforced in SELECT (people and/or pods)
-- ---------------------------------------------------------------------------
drop policy if exists bulletins_select on public.bulletins;
create policy bulletins_select on public.bulletins for select
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('admin', 'manager')
      or coalesce(audience, 'all') = 'all'
      or (
        audience = 'people'
        and public.current_person_id() is not null
        and (
          public.current_person_id() = any (coalesce(audience_person_ids, '{}'::uuid[]))
          or exists (
            select 1
            from public.pods pod
            where pod.organization_id = bulletins.organization_id
              and pod.id = any (coalesce(audience_pod_ids, '{}'::uuid[]))
              and (
                pod.manager_person_id = public.current_person_id()
                or exists (
                  select 1
                  from public.pod_members pm
                  where pm.pod_id = pod.id
                    and pm.person_id = public.current_person_id()
                )
              )
          )
        )
      )
    )
  );
