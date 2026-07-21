-- Allow authors to edit their own task comments; track last edit time.

alter table public.task_comments
  add column if not exists updated_at timestamptz;

create policy task_comments_update on public.task_comments for update
  using (
    organization_id = public.current_org_id()
    and author_profile_id = auth.uid()
  )
  with check (
    organization_id = public.current_org_id()
    and author_profile_id = auth.uid()
  );
