-- Progression audit actors are authenticated users. A profile is optional for
-- legacy treating accounts; patient ownership remains enforced by RLS/triggers.
begin;
alter table public.program_progression_revisions
  drop constraint program_progression_revisions_recorded_by_fkey;
alter table public.program_progression_revisions
  add constraint program_progression_revisions_recorded_by_fkey
  foreign key (recorded_by) references auth.users(id);
commit;
