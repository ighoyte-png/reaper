-- Optional project manager (person) assignment
alter table public.projects
  add column if not exists manager_person_id uuid
    references public.people(id) on delete set null;

create index if not exists projects_manager_person_idx
  on public.projects (manager_person_id);
