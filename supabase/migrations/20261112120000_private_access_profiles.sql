create table if not exists public.private_access_profiles (
  id text primary key,
  label text not null,
  role text not null check (role in ('admin', 'player', 'reserve')),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.private_access_profiles enable row level security;
grant select, insert, update on public.private_access_profiles to service_role;

create or replace function public.private_access_update_profile(
  p_profile_id text,
  p_code_hash text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
begin
  lock table public.private_access_profiles in exclusive mode;

  select role into target_role
  from public.private_access_profiles
  where id = p_profile_id;

  if not found then
    raise exception 'Compte introuvable';
  end if;

  if not p_active and target_role = 'admin' and (
    select count(*) from public.private_access_profiles
    where role = 'admin' and active
  ) <= 1 then
    raise exception 'Impossible de révoquer le dernier administrateur actif';
  end if;

  update public.private_access_profiles
  set code_hash = coalesce(p_code_hash, code_hash),
      active = p_active,
      updated_at = now()
  where id = p_profile_id;
end;
$$;

revoke all on function public.private_access_update_profile(text, text, boolean) from public, anon, authenticated;
grant execute on function public.private_access_update_profile(text, text, boolean) to service_role;
