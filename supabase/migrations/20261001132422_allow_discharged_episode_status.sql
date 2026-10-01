-- Preserve every legacy episode status while adding the explicit lifecycle state.
alter table public.episodes drop constraint episodes_status_check;
alter table public.episodes add constraint episodes_status_check
 check (status in ('active','paused','completed','archived','discharged'));
