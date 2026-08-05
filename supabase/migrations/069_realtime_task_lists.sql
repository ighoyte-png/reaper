-- Realtime for task list reorder/rename/archive so boards update live for others.
-- REPLICA IDENTITY FULL so filtered DELETE events include project_id.

alter table public.task_lists replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_lists;
exception
  when duplicate_object then null;
end $$;
