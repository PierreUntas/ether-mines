-- Dev utility: wipes every validator (and its seal) owned by ONE named test player, so you can redo
-- the whole find/craft → reanimate → attest → upgrade → degrade → repair loop from zero. Leaves
-- everything else (inventory, Gwei balance, other unique items) untouched.
--
-- Not a migration: never run automatically (not touched by tools/installation.mjs, tests/sql/run.sh,
-- or any client code). Paste into the Supabase SQL Editor yourself. Edit "nickname"/"w" below first.

do $$
declare
  nickname text := 'Pierre';
  w        text := 'principal';
  uid      uuid;
  n        int;
begin
  select user_id into uid from players where world = w and lower(name) = lower(nickname);
  if uid is null then raise exception 'no player named % in world %', nickname, w; end if;

  -- the seal (item 203) referencing a validator must go first: validators.id is a foreign key from it
  delete from uniques where user_id = uid and world = w and validator_id is not null;
  delete from validators where world = w and owner = uid;
  get diagnostics n = row_count;
  raise notice '% validator(s) removed for %', n, nickname;
end $$;
