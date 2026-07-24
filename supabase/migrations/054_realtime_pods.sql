-- Realtime for org Pods so filter bars / People / Schedule update live.

alter table public.pods replica identity full;
alter table public.pod_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.pods;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pod_members;
exception
  when duplicate_object then null;
end $$;
