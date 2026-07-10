-- Normalize exercise names and prevent active duplicates within each clinician's library.
alter table public.exercises
  add column if not exists normalized_name text;

create or replace function public.normalize_exercise_name(exercise_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(btrim(exercise_name), '\s+', ' ', 'g'));
$$;

revoke all on function public.normalize_exercise_name(text) from public, anon, authenticated;

create or replace function public.set_exercise_normalized_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_name := public.normalize_exercise_name(new.name);
  new.tags := coalesce(
    array(
      select distinct lower(regexp_replace(btrim(tag), '\s+', ' ', 'g'))
      from unnest(coalesce(new.tags, '{}'::text[])) as tag
      where btrim(tag) <> ''
      order by 1
    ),
    '{}'::text[]
  );
  return new;
end;
$$;

revoke all on function public.set_exercise_normalized_name() from public, anon, authenticated;

drop trigger if exists set_exercise_normalized_name on public.exercises;
create trigger set_exercise_normalized_name
before insert or update of name, tags on public.exercises
for each row execute function public.set_exercise_normalized_name();

update public.exercises
set normalized_name = public.normalize_exercise_name(name),
    tags = coalesce(
      array(
        select distinct lower(regexp_replace(btrim(tag), '\s+', ' ', 'g'))
        from unnest(coalesce(exercises.tags, '{}'::text[])) as tag
        where btrim(tag) <> ''
        order by 1
      ),
      '{}'::text[]
    );

-- Preserve the oldest exercise as canonical, repoint program rows, merge tags,
-- and deactivate extra rows before adding the partial unique index.
with ranked as (
  select id, clinician_id, normalized_name,
         first_value(id) over (partition by clinician_id, normalized_name order by created_at, id) as canonical_id,
         row_number() over (partition by clinician_id, normalized_name order by created_at, id) as duplicate_rank
  from public.exercises
  where is_active = true
), duplicate_map as (
  select id as duplicate_id, canonical_id from ranked where duplicate_rank > 1
)
update public.home_program_exercises hpe
set exercise_id = duplicate_map.canonical_id
from duplicate_map
where hpe.exercise_id = duplicate_map.duplicate_id;

with ranked as (
  select id, clinician_id, normalized_name,
         first_value(id) over (partition by clinician_id, normalized_name order by created_at, id) as canonical_id,
         row_number() over (partition by clinician_id, normalized_name order by created_at, id) as duplicate_rank
  from public.exercises
  where is_active = true
), merged_tags as (
  select ranked.canonical_id,
         array_agg(distinct tag order by tag) filter (where tag is not null) as tags
  from ranked
  join public.exercises e on e.clinician_id = ranked.clinician_id and e.normalized_name = ranked.normalized_name
  left join lateral unnest(e.tags) tag on true
  group by ranked.canonical_id
)
update public.exercises e
set tags = coalesce(merged_tags.tags, '{}'::text[])
from merged_tags
where e.id = merged_tags.canonical_id;

with ranked as (
  select id, row_number() over (partition by clinician_id, normalized_name order by created_at, id) as duplicate_rank
  from public.exercises
  where is_active = true
)
update public.exercises e
set is_active = false
from ranked
where e.id = ranked.id and ranked.duplicate_rank > 1;

alter table public.exercises
  alter column normalized_name set not null;

create unique index if not exists exercises_clinician_normalized_name_active_uidx
  on public.exercises (clinician_id, normalized_name)
  where is_active = true;

comment on column public.exercises.normalized_name is
  'Lowercase, trimmed, whitespace-collapsed exercise name maintained by trigger for clinician-scoped deduplication.';
