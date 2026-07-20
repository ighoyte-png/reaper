-- Person profile photos (URL to Storage or external)
alter table public.people
  add column if not exists avatar_url text;

-- Public bucket for person avatars
insert into storage.buckets (id, name, public)
values ('person-avatars', 'person-avatars', true)
on conflict (id) do nothing;

-- Authenticated users can upload/update/delete within the bucket
drop policy if exists person_avatars_select on storage.objects;
drop policy if exists person_avatars_insert on storage.objects;
drop policy if exists person_avatars_update on storage.objects;
drop policy if exists person_avatars_delete on storage.objects;

create policy person_avatars_select on storage.objects
  for select using (bucket_id = 'person-avatars');

create policy person_avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'person-avatars');

create policy person_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'person-avatars')
  with check (bucket_id = 'person-avatars');

create policy person_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'person-avatars');
