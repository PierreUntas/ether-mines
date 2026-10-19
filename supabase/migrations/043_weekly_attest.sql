-- 043: a validator needs attesting once a week, not once a day: players who can only play on weekends
-- keep theirs healthy. _tick_validator is 021's, with the health check's window at 7 days instead of 24h
-- (production, the 24h catch-up cap per tick, and the 3 / 8 missed cycles before damaged / corrupted are
-- unchanged). Requires 021_gwei_cycle_and_maintenance.sql. Replayable without error.

create or replace function public._tick_validator(w text, vid bigint) returns validators
language plpgsql security definer set search_path = public as $$
declare v validators; cycles int; maintained boolean; net int;
begin
  select * into v from validators where id = vid and world = w for update;
  if not found or v.state = 'dormant' or v.owner is null or v.last_cycle_at is null then return v; end if;
  cycles := floor(least(extract(epoch from now() - v.last_cycle_at), 86400) / 300)::int; -- 24h catch-up cap, 300s = 1 cycle
  if cycles <= 0 then return v; end if;
  -- production is always paid for elapsed cycles, whether or not the player checked in: the validator
  -- itself doesn't stop working. Only the health check (missed_cycles / degradation) below is gated on
  -- having actually attested in the last week (043).
  net := greatest(v.gwei_per_cycle - v.maintenance_cost, 0) * cycles;
  if net > 0 then perform _gwei(v.owner, w, net); end if;
  -- maintained = attested within the last 7 days, counting back from now (not from last_cycle_at, which
  -- would let one attestation count as "maintained" forever if nobody ever ticks again)
  maintained := v.last_attested_at is not null and v.last_attested_at >= now() - interval '7 days';
  if maintained then
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300), missed_cycles = 0
      where id = vid returning * into v;
  else
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300),
      missed_cycles = missed_cycles + cycles,
      state = case when missed_cycles + cycles >= 8 then 'corrupted' when missed_cycles + cycles >= 3 then 'damaged' else state end
      where id = vid returning * into v;
  end if;
  return v;
end $$;
