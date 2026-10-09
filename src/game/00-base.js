// Ether Mines · Base: shortcuts, shared generator and rules, touch detection.
// The files in src/game/ load in order and share the same global scope.
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
  CITY,
  inCity,
  CIRCUITS,
  inCircuits,
  onPath,
  gardenAt,
  LIMIT,
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
const { PASTELS, STAINED, B, ITEM, RECIPES, reqTier } = Rules;
const touch = matchMedia('(pointer:coarse)').matches;
