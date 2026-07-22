-- Emoji reactions on task comments (Basecamp-style).

create table if not exists public.task_comment_reactions (
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id, emoji),
  constraint task_comment_reactions_emoji_len check (char_length(emoji) between 1 and 16)
);

create index if not exists task_comment_reactions_comment_idx
  on public.task_comment_reactions (comment_id);

create index if not exists task_comment_reactions_org_idx
  on public.task_comment_reactions (organization_id);

alter table public.task_comment_reactions enable row level security;

create policy task_comment_reactions_select on public.task_comment_reactions for select
  using (organization_id = public.current_org_id());

create policy task_comment_reactions_insert on public.task_comment_reactions for insert
  with check (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.task_comments c
      where c.id = comment_id
        and c.organization_id = organization_id
    )
  );

create policy task_comment_reactions_delete on public.task_comment_reactions for delete
  using (
    organization_id = public.current_org_id()
    and profile_id = auth.uid()
  );

alter table public.task_comment_reactions replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_comment_reactions;
exception
  when duplicate_object then null;
end $$;
