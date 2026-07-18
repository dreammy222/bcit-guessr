alter table public.party_sessions
  add column if not exists last_activity_at timestamptz;

update public.party_sessions
set last_activity_at = coalesce(last_activity_at, created_at, now())
where last_activity_at is null;

alter table public.party_sessions
  alter column last_activity_at set default now();

alter table public.party_sessions
  alter column last_activity_at set not null;

alter table public.party_sessions
  drop constraint if exists party_sessions_status_check;

alter table public.party_sessions
  add constraint party_sessions_status_check
  check (status in ('lobby', 'round_loading', 'round_countdown', 'round_active', 'round_result', 'finished', 'finalizing', 'ended'));

create index if not exists idx_party_sessions_status_activity
  on public.party_sessions(status, last_activity_at);
