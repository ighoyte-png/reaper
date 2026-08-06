-- Mention inbox stays until X; orange unread = read_at is null.
alter table public.mention_unreads
  add column if not exists read_at timestamptz null;

drop policy if exists mention_unreads_update on public.mention_unreads;
create policy mention_unreads_update on public.mention_unreads for update
  using (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  )
  with check (
    organization_id = public.current_org_id()
    and (
      person_id = public.current_person_id()
      or public.current_role() in ('admin', 'manager')
    )
  );
