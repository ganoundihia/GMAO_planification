// scripts/check-db.mjs — vérifie la connexion Supabase depuis la ligne de commande.
//   npm run check:db
// N'affiche AUCUNE donnée : seulement l'état de la configuration et de la connexion.
import 'dotenv/config';
import supabase from '../api/db-client.js';

const { error, count } = await supabase.from('techniciens').select('*', { count: 'exact', head: true });

if (error) {
  console.error(`❌ Connexion Supabase en échec : ${error.message}`);
  process.exit(1);
}
console.log(`✅ Supabase connecté (table techniciens : ${count} ligne(s))`);
