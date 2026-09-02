-- Allow org_branding on attachments.entity_type (Client Portal white-label logos).

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'attachments'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  limit 1;
  if con_name is not null then
    execute format('alter table public.attachments drop constraint %I', con_name);
  end if;
end $$;

alter table public.attachments
  add constraint attachments_entity_type_check
  check (entity_type in (
    'profile_picture',
    'comment',
    'task_note',
    'custom_emoji',
    'org_branding'
  ));
