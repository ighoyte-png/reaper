-- Distinguish inline WYSIWYG embeds from email-style file attachments.

alter table public.attachments
  add column if not exists placement text not null default 'inline'
    check (placement in ('inline', 'attached'));

create index if not exists attachments_entity_placement_idx
  on public.attachments (organization_id, entity_type, entity_id, placement)
  where ready = true;
