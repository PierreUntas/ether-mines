-- 035: how many nicknames a world has. Players can only read their own row (001_schema.sql), so the
-- count goes through this function: it returns a number and nothing else, no name, no id. A player
-- counts once they have a nickname in that world. Requires 001_schema.sql. Replayable without error.

create index if not exists players_world on public.players (world);

create or replace function public.world_player_count(w text) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from players where world = w and coalesce(btrim(name), '') <> '';
$$;

revoke all on function public.world_player_count(text) from public, anon;
grant execute on function public.world_player_count(text) to authenticated;
