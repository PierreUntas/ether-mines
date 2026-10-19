-- 044: one step only. A validator not attested for 8 days is corrupted (a Validator Heart repairs it);
-- there's no "damaged" state any more. _tick_validator is 043's with the window at 8 days and no damaged
-- step; validators left damaged by the old rule are active again if attested within the 8 days, and
-- corrupted otherwise (on their next tick). Production is unchanged. Requires 043_weekly_attest.sql.
-- Replayable without error.

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
  -- having actually attested in the last 8 days (044).
  net := greatest(v.gwei_per_cycle - v.maintenance_cost, 0) * cycles;
  if net > 0 then perform _gwei(v.owner, w, net); end if;
  -- maintained = attested within the last 8 days, counting back from now (not from last_cycle_at, which
  -- would let one attestation count as "maintained" forever if nobody ever ticks again)
  maintained := v.last_attested_at is not null and v.last_attested_at >= now() - interval '8 days';
  if maintained then
    -- (a validator left damaged by the old rule is healthy again)
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300), missed_cycles = 0,
      state = case when state = 'damaged' then 'active' else state end
      where id = vid returning * into v;
  else
    update validators set last_cycle_at = last_cycle_at + make_interval(secs => cycles * 300),
      missed_cycles = missed_cycles + cycles,
      state = 'corrupted' -- no damaged step any more (044): 8 days without an attestation and it's corrupted
      where id = vid returning * into v;
  end if;
  return v;
end $$;

update validators set state = 'active', missed_cycles = 0
  where state = 'damaged' and last_attested_at >= now() - interval '8 days';
