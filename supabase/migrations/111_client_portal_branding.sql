-- Client Portal org master switch + white-label branding on organization_settings.

alter table public.organization_settings
  add column if not exists client_portal_enabled boolean not null default true;

alter table public.organization_settings
  add column if not exists client_portal_company_name text null;

alter table public.organization_settings
  add column if not exists client_portal_logo_light_attachment_id uuid null;

alter table public.organization_settings
  add column if not exists client_portal_logo_dark_attachment_id uuid null;
