-- Bulletin board writes: admins and managers (restore manager access from 024)
drop policy if exists bulletins_write on public.bulletins;
create policy bulletins_write on public.bulletins for all
  using (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'))
  with check (organization_id = public.current_org_id() and public.current_role() in ('admin', 'manager'));
