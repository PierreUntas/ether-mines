-- REMISE À ZÉRO : supprime tout le monde partagé (tous les mondes, tous les blocs).
-- À lancer seulement pour repartir de rien, puis relancer supabase/migrations/ dans l'ordre.

drop table if exists public.blocks cascade;
drop table if exists public.chunks cascade;
drop table if exists public.worlds cascade;
drop function if exists public.on_block_placed() cascade;
