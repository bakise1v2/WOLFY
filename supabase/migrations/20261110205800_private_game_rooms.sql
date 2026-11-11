create table if not exists public.private_game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by text not null,
  status text not null default 'waiting' check (status in ('waiting')),
  created_at timestamptz not null default now()
);

create table if not exists public.private_game_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.private_game_rooms(id) on delete cascade,
  user_id text not null,
  pseudo text not null check (char_length(pseudo) between 2 and 24),
  role text not null check (role in ('admin', 'player', 'reserve')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists private_game_participants_room_id_idx
  on public.private_game_participants (room_id, joined_at);

alter table public.private_game_rooms enable row level security;
alter table public.private_game_participants enable row level security;
