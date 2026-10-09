-- RESET TERRAIN ONLY, for one world — keeps every account, their inventory, their unique items
-- (pickaxes, seals, the Titan Fang, a Plasma Pistol...), and their claims exactly as they are.
--
-- Unlike reset.sql (which drops every table, including players/inventory/uniques/auth accounts),
-- this only clears the two tables that hold terrain: "chunks" (the frozen snapshot the freeze
-- function writes the first time an area is visited) and "blocks" (every block a player has since
-- mined or placed, layered on top of that snapshot). Neither table is referenced by players,
-- inventory, uniques, or claims — they're read-only history of what the *map* looks like, not of
-- what any player owns. Clearing them just means every chunk regenerates fresh, from the current
-- code, next time it's loaded — exactly like visiting a chunk for the first time.
--
-- Use this after a world-gen change you want *already-explored* areas to pick up too (a plain GEN
-- bump alone only affects chunks nobody has loaded yet — "already-frozen chunks don't move").
--
-- Change the world name below if it isn't 'principal' (the default, and what the game falls back
-- to when no ?monde= is given — see src/game/14-startup.js).

delete from public.blocks where world = 'principal';
delete from public.chunks where world = 'principal';
