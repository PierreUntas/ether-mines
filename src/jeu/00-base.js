// Mines d'Éther · Bases : raccourcis, générateur et règles partagés, détection du tactile.
// Les fichiers de src/jeu/ se chargent dans l'ordre et partagent la même portée globale.
'use strict';
const $ = id => document.getElementById(id);
const {
  clamp,
  lerp,
  sm,
  hash,
  hash3,
  vn2,
  vn3,
  SY,
  SEA,
  CH,
  CV,
  DEEP,
  GEN,
  SPAWN,
  CITE,
  dansCite,
  surVoie,
  jardinAt,
  LIMITE,
  RUIN,
  ckey,
  coordKey,
  cOf,
  li,
  inWorld,
  ruinAt,
  contAt,
  heightAt,
  islandZone,
  isIsland,
  islandTop,
  biome,
  topAt,
  genChunk,
} = World;
const encodeChunk = (cx, cz) => World.encodeChunk(CHK.get(ckey(cx, cz))),
  decodeChunk = World.decodeChunk;
const { PASTELS, VITRAUX, B, ITEM, RECIPES, reqTier } = Rules;
const touch = matchMedia('(pointer:coarse)').matches;
