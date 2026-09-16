-- Align settings write access with Settings menu visibility:
-- - organization_settings: Admin only (Project Defaults / Currency / Client Portal)
-- - holiday calendars: Admin only
-- - organization_emojis: Admin + Manager (Custom Emojis tab)

-- organization_settings -------------------------------------------------------
drop policy if exists organization_settings_write on public.organization_settings;
create policy organization_settings_write on public.organization_settings for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

-- holidays --------------------------------------------------------------------
drop policy if exists holiday_calendars_write on public.holiday_calendars;
create policy holiday_calendars_write on public.holiday_calendars for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

drop policy if exists holiday_calendar_days_write on public.holiday_calendar_days;
create policy holiday_calendar_days_write on public.holiday_calendar_days for all
  using (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() = 'admin'
  );

-- custom emojis ---------------------------------------------------------------
drop policy if exists organization_emojis_insert on public.organization_emojis;
create policy organization_emojis_insert on public.organization_emojis
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists organization_emojis_update on public.organization_emojis;
create policy organization_emojis_update on public.organization_emojis
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );

drop policy if exists organization_emojis_delete on public.organization_emojis;
create policy organization_emojis_delete on public.organization_emojis
  for delete
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('admin', 'manager')
  );
