-- Realtime for project essentials + milestones so hubs update live for others.
-- REPLICA IDENTITY FULL so filtered DELETE events include project_id.

alter table public.project_assets replica identity full;
alter table public.milestones replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.project_assets;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.milestones;
exception
  when duplicate_object then null;
end $$;
