-- The trigger runs as the authenticated caller. Keep the normalization helper
-- private and inline the expression so browser inserts do not need EXECUTE on it.
create or replace function public.set_exercise_normalized_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_name := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
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
