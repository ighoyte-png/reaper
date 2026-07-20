-- Bulletin board writes: admins only (was admin + manager).
drop policy if exists bulletins_write on public.bulletins;
create policy bulletins_write on public.bulletins for all
  using (organization_id = public.current_org_id() and public.current_role() = 'admin')
  with check (organization_id = public.current_org_id() and public.current_role() = 'admin');
