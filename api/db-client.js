// api/db-client.js
// Client Supabase côté serveur (clé service_role : contourne la RLS).
// ⚠️ Ne jamais importer ce module depuis `src/` (code navigateur).
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    'Configuration Supabase manquante : définir SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY — voir .env.example',
  );
}

const supabase = createClient(url, serviceRoleKey, {
  // Process serveur sans session utilisateur : ni persistance ni refresh de token.
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabase;
