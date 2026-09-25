-- Legacy entries may contain patient-specific text. Preserve them for clinician review,
-- and keep all existing assignment references intact. Never infer standard status.
alter table public.exercises add column library_scope text not null default 'needs_review' check(library_scope in ('standard','needs_review'));
alter table public.exercises add column equipment text check(length(equipment)<=300);
