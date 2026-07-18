create extension if not exists pgcrypto;

create table if not exists public.party_sessions (
  id uuid primary key,
  join_code text not null unique,
  host_user_id text not null,
  host_display_name text not null,
  status text not null check (status in ('lobby', 'round_loading', 'round_countdown', 'round_active', 'round_result', 'finished', 'finalizing', 'ended')),
  rounds_count integer not null check (rounds_count between 1 and 20),
  current_round_index integer not null default 0,
  round_loading_deadline_at timestamptz,
  current_round_started_at timestamptz,
  result_started_at timestamptz,
  selected_photo_ids jsonb not null default '[]'::jsonb,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.party_players (
  id uuid primary key,
  party_id uuid not null references public.party_sessions(id) on delete cascade,
  player_key text not null,
  display_name text not null,
  username_key text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_connected boolean not null default true,
  round_ready_index integer not null default -1,
  round_ready_at timestamptz,
  total_points integer not null default 0,
  current_rank integer,
  unique (party_id, player_key),
  unique (party_id, username_key)
);

create table if not exists public.party_round_guesses (
  party_id uuid not null references public.party_sessions(id) on delete cascade,
  round_index integer not null,
  player_id uuid not null references public.party_players(id) on delete cascade,
  guess_lat double precision,
  guess_lng double precision,
  submitted_at timestamptz not null default now(),
  distance_km double precision,
  points integer not null default 0,
  round_rank integer,
  primary key (party_id, round_index, player_id)
);

create index if not exists idx_party_sessions_join_code on public.party_sessions(join_code);
create index if not exists idx_party_sessions_status_activity on public.party_sessions(status, last_activity_at);
create index if not exists idx_party_players_party_id on public.party_players(party_id);
create index if not exists idx_party_round_guesses_party_round on public.party_round_guesses(party_id, round_index);
