-- Enable Realtime for schedule tables so clients can subscribe to changes.
-- REPLICA IDENTITY FULL so filtered DELETE events include organization_id.

alter table public.assignments replica identity full;
alter table public.leave_days replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.assignments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.leave_days;
exception
  when duplicate_object then null;
end $$;
