-- Location catalog for schools running LOCATIONS_BACKEND=supabase.
-- Only needed if you are not using DynamoDB; see NEW_SCHOOL.md.
--
-- id must match the photo filename stem exactly (e.g. 'GS__0431'), because
-- single-player, daily challenge and party mode all look photos up by it.

create table if not exists locations (
  id text primary key,
  label text,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

-- The server reads with the service role key, which bypasses RLS. Enable RLS
-- with no public policy so the anon key cannot read true coordinates — those
-- must never reach a client before a guess is scored.
alter table locations enable row level security;
