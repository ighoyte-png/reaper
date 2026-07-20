-- Members (and any linked profile) can update their own people row
-- so they can change avatar_url from Settings without manager write access.
create policy people_update_self on public.people for update
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );
