-- After profile CASCADE wipe + rebuild (087/088), task_comments survived with
-- author_profile_id SET NULL (082) and showed as "Deleted user".
-- Reattach those orphans to the recovered Auth user for every org they belong to.

do $$
declare
  target_email text := 'ihoyte@sovyn.com';
  target_uid uuid;
  updated_count integer;
begin
  select p.id
  into target_uid
  from public.profiles p
  where lower(trim(p.email)) = lower(trim(target_email))
  limit 1;

  if target_uid is null then
    select u.id
    into target_uid
    from auth.users u
    where lower(trim(u.email)) = lower(trim(target_email))
    limit 1;
  end if;

  if target_uid is null then
    raise exception
      '089_relink_orphan_comment_authors: no profile/Auth user for %',
      target_email;
  end if;

  update public.task_comments tc
  set author_profile_id = target_uid
  from public.organization_memberships m
  where m.user_id = target_uid
    and m.organization_id = tc.organization_id
    and tc.author_profile_id is null;

  get diagnostics updated_count = row_count;
  raise notice
    '089_relink_orphan_comment_authors: reattached % comment(s) to % (%)',
    updated_count,
    target_email,
    target_uid;
end;
$$;
