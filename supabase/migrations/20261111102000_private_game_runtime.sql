alter table public.private_game_rooms
  drop constraint if exists private_game_rooms_status_check;

alter table public.private_game_rooms
  add constraint private_game_rooms_status_check
  check (status in ('waiting', 'running', 'completed'));

alter table public.private_game_rooms
  add column if not exists game_state jsonb,
  add column if not exists revision integer not null default 0;
