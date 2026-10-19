// api/profiles.js
import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json'); // ← toujours JSON

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  console.log(`\n━━━━━ ${req.method} /api/profiles ━━━━━`);

  try {
    // ── GET ──────────────────────────────────────
    if (req.method === 'GET') {
      const { user_id, email, role } = req.query ?? {};

      let query = supabase
        .from('profiles')
        .select('*, unites(id, code, nom)')
        .order('nom');

      if (user_id) query = query.eq('user_id', user_id);
      else if (email) query = query.ilike('email', email);
      if (role) query = query.eq('role', role);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      console.log(`✅ GET → ${data?.length ?? 0} profil(s)`);
      return res.status(200).json(data ?? []);
    }

    // ── POST ─────────────────────────────────────
    if (req.method === 'POST') {
      const { email, password, nom, prenom, role, unite_id, atelier_id } = req.body ?? {};

      const missing = ['email','password','nom','prenom','role']
        .filter(k => !req.body?.[k]);

      if (missing.length > 0) {
        return res.status(400).json({ error: `Champs manquants : ${missing.join(', ')}` });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Mot de passe minimum 6 caractères' });
      }

      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: email.toLowerCase().trim(),
          password,
          email_confirm: true,
        });

      if (authError) {
        if (authError.message.includes('already')) {
          return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }
        return res.status(400).json({ error: authError.message });
      }

      const userId = authData.user?.id;
      if (!userId) return res.status(500).json({ error: 'ID utilisateur non retourné' });

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id:  userId,
          nom:      nom.trim(),
          prenom:   prenom.trim(),
          role,
          unite_id:   unite_id   ? Number(unite_id)   : null,
          atelier_id: atelier_id ? Number(atelier_id) : null,
          email:    email.toLowerCase().trim(),
        })
        .select('*, unites(id, code, nom)')
        .single();

      if (profileError) {
        await supabase.auth.admin.deleteUser(userId).catch(() => {});
        return res.status(400).json({ error: profileError.message });
      }

      console.log('✅ Créé:', profile.email);
      return res.status(201).json(profile);
    }

    // ── PUT ──────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, role, unite_id, atelier_id, password, nom, prenom } = req.body ?? {};

      if (!id) return res.status(400).json({ error: 'Champ "id" manquant' });

      const updates = {};
      if (role       !== undefined) updates.role       = role;
      if (unite_id   !== undefined) updates.unite_id   = unite_id || null;
      if (atelier_id !== undefined) updates.atelier_id = atelier_id || null;
      if (nom        !== undefined) updates.nom        = nom.trim();
      if (prenom     !== undefined) updates.prenom     = prenom.trim();

      const { data: updated, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select('*, unites(id, code, nom)')
        .single();

      if (error) return res.status(400).json({ error: error.message });

      if (password?.length >= 6 && updated?.user_id) {
        const { error: pwdErr } = await supabase.auth.admin.updateUserById(
          updated.user_id, { password }
        );
        if (pwdErr) console.warn('⚠️ Password:', pwdErr.message);
      }

      console.log('✅ Mis à jour:', updated.email);
      return res.status(200).json(updated);
    }

    // ── DELETE ───────────────────────────────────
    if (req.method === 'DELETE') {
      // Id depuis query param (?id=xxx) OU body
      const id = req.query?.id ?? req.body?.id;

      console.log('DELETE id:', id,
        '| depuis:', req.query?.id ? 'query' : 'body'
      );

      if (!id) {
        return res.status(400).json({
          error: 'Paramètre "id" manquant',
          hint: 'Envoyez ?id=xxx en query param ou {"id":"xxx"} dans le body',
        });
      }

      // 1. Récupérer le profil
      const { data: profile, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, user_id, email, nom, prenom')
        .eq('id', id)
        .single();

      if (fetchErr || !profile) {
        return res.status(404).json({ error: 'Profil introuvable', id });
      }

      console.log('🗑️', profile.email, '| user_id:', profile.user_id);

      // 2. Supprimer le profil
      const { error: delProfileErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (delProfileErr) {
        return res.status(500).json({ error: delProfileErr.message });
      }

      // 3. Supprimer l'auth user (best-effort)
      if (profile.user_id) {
        const { error: delAuthErr } =
          await supabase.auth.admin.deleteUser(profile.user_id);

        if (delAuthErr) {
          console.warn('⚠️ Auth non supprimé:', delAuthErr.message);
        } else {
          console.log('✅ Auth supprimé');
        }
      }

      console.log('✅ Supprimé:', profile.email);
      return res.status(200).json({
        ok: true,
        deleted: `${profile.prenom} ${profile.nom} (${profile.email})`,
      });
    }

    return res.status(405).json({ error: `Méthode ${req.method} non autorisée` });

  } catch (err) {
    console.error('━━━ ERREUR profiles ━━━', err);
    return res.status(500).json({ error: err.message });
  }
}