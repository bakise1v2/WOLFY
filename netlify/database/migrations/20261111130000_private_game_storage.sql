create table if not exists private_access_profiles (
  id text primary key,
  label text not null,
  role text not null check (role in ('admin', 'player', 'reserve')),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private_app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private_game_rooms (
  id text primary key,
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'completed')),
  created_at timestamptz not null default now(),
  created_by text not null,
  game_state jsonb,
  revision integer not null default 0
);

create table if not exists private_game_participants (
  room_id text not null references private_game_rooms(id) on delete cascade,
  user_id text not null,
  pseudo text not null,
  role text not null check (role in ('admin', 'player', 'reserve')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists private_game_participants_user_id_idx
  on private_game_participants (user_id);
