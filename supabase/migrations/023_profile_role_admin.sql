-- Admins can update profiles in their org (used to change roles).
create policy profiles_update_admin on public.profiles for update
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );
