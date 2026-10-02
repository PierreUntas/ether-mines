// Génère supabase/installation.sql : toutes les migrations dans l'ordre, puis les règles du jeu, en un seul fichier.
// Usage : node tools/installation.mjs > supabase/installation.sql
// Pour installer ou mettre à jour la base : lancer ce seul fichier dans Supabase (SQL Editor). Il se relance sans risque.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const fichiers = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const out = [
  "-- INSTALLATION COMPLÈTE de la base de Mines d'Éther. FICHIER GÉNÉRÉ par tools/installation.mjs : ne pas modifier à la main.",
  '-- Contient : ' + fichiers.join(', ') + ', puis regles.sql.',
  '-- À lancer en une fois dans Supabase (SQL Editor). Se relance sans risque. Pour repartir de zéro : reset.sql d\'abord.',
  '',
];
for (const f of fichiers) out.push(`-- ════════════════ ${f} ════════════════`, readFileSync(new URL(f, dir), 'utf8').trimEnd(), '');
out.push('-- ════════════════ regles.sql ════════════════', readFileSync(new URL('../supabase/regles.sql', import.meta.url), 'utf8').trimEnd(), '');
console.log(out.join('\n'));
