-- Allow org admins to rename their organization.
create policy org_update_admin on public.organizations for update
  using (id = public.current_org_id() and public.current_role() = 'admin')
  with check (id = public.current_org_id() and public.current_role() = 'admin');
