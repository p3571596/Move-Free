create index analytics_events_home_program_id_idx
  on public.analytics_events (home_program_id)
  where home_program_id is not null;
