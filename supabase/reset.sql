-- REMISE À ZÉRO COMPLÈTE : supprime tous les mondes, tous les blocs, toutes les parties et les comptes invités.
-- Couvre aussi les tables des anciennes versions. Ensuite : lancer supabase/migrations/ dans l'ordre.

drop table if exists public.players cascade;
drop table if exists public.recovery cascade;
drop table if exists public.legacy_claims cascade;
drop table if exists public.blocks cascade;
drop table if exists public.chunks cascade;
drop table if exists public.worlds cascade;
drop function if exists public.set_recovery_code() cascade;
drop function if exists public.claim_recovery(text) cascade;
drop function if exists public.claim_legacy(text) cascade;
drop function if exists public.on_block_placed() cascade;

-- comptes invités (sans email) : ils n'ont plus de partie
delete from auth.users where is_anonymous;
