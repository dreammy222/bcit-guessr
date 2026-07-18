alter table public.party_sessions
  add column if not exists round_loading_deadline_at timestamptz;

alter table public.party_players
  add column if not exists round_ready_index integer not null default -1;

alter table public.party_players
  add column if not exists round_ready_at timestamptz;

alter table public.party_sessions
  drop constraint if exists party_sessions_status_check;

alter table public.party_sessions
  add constraint party_sessions_status_check
  check (status in ('lobby', 'round_loading', 'round_countdown', 'round_active', 'round_result', 'finished', 'finalizing', 'ended'));
