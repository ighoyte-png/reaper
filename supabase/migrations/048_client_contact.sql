-- Client main point of contact + company website
alter table public.clients
  add column if not exists contact_first_name text not null default '',
  add column if not exists contact_last_name text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists company_website text not null default '';
