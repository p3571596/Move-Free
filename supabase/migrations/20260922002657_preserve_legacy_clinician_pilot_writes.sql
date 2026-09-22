-- Treating identities already reference auth.users in patients and exercises.
-- A legacy clinician may have an authenticated account and an explicit care
-- relationship without an optional profile row. Match that existing identity
-- model so audit, reviews and messages cannot break their clinical writes.
-- Authorization policies are unchanged.
alter table public.engine_program_changes drop constraint engine_program_changes_clinician_id_fkey,
 add constraint engine_program_changes_clinician_id_fkey foreign key (clinician_id) references auth.users(id);
alter table public.care_messages drop constraint care_messages_author_id_fkey,
 add constraint care_messages_author_id_fkey foreign key (author_id) references auth.users(id);
alter table public.clinical_engine_reviews drop constraint clinical_engine_reviews_clinician_id_fkey,
 add constraint clinical_engine_reviews_clinician_id_fkey foreign key (clinician_id) references auth.users(id);
alter table public.clinical_decisions drop constraint clinical_decisions_clinician_id_fkey,
 add constraint clinical_decisions_clinician_id_fkey foreign key (clinician_id) references auth.users(id) on delete cascade;
alter table public.visit_notes drop constraint visit_notes_clinician_id_fkey,
 add constraint visit_notes_clinician_id_fkey foreign key (clinician_id) references auth.users(id) on delete cascade;
