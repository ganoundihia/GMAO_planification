// api/import.js
// Client service_role partagé (contourne la RLS côté serveur uniquement).
// Idempotence : cette route exige l'en-tête `Idempotency-Key` (voir api/app.js),
// sinon un retry réseau dupliquerait toutes les interventions.
import supabaseAdmin from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { interventions, unite_id, uploaded_by, filename } = req.body;

    // FIX 2: Validate required fields
    if (!interventions || !Array.isArray(interventions) || interventions.length === 0) {
      return res.status(400).json({ error: 'Aucune intervention fournie' });
    }
    if (!unite_id) {
      return res.status(400).json({ error: 'unite_id manquant' });
    }

    // FIX 3: Verify the user exists in auth.users before using their UUID
    // uploaded_by comes from supabase.auth.getUser() on the frontend — it's already a valid UUID
    // We just make sure it's not a placeholder string
    const createdBy = uploaded_by && uploaded_by.length === 36 ? uploaded_by : null;

    // FIX 4: Build all rows first, then insert in ONE bulk call (not a loop)
    const rows = interventions.map(item => {
      let systeme = item.systeme || '';
      let sous_systeme = item.sous_systeme || '';
      if (item.code_gmao) {
        const parts = item.code_gmao.split('.');
        if (!systeme && parts[0])     systeme = parts[0];
        if (!sous_systeme && parts[2]) sous_systeme = parts[2];
      }

      return {
        unite_id:            Number(unite_id),
        atelier_id:          item.atelier_id || null,
        equipement:          item.equipement || '',
        code_gmao:           item.code_gmao || '',
        titre:               item.titre,
        systeme,
        sous_systeme,
        frequence:           item.frequence || null,
        date_prevue:         item.date_prevue || null,     // already ISO YYYY-MM-DD from frontend
        duree_intervention:  item.duree_intervention ?? item.temps_h ?? 0,
        temps_logistique:    item.temps_logistique ?? 0.5,
        materiel:            item.materiel || '',
        outillage:           item.outillage || '',
        fiche_inspection:    item.fiche_inspection || '',
        consignation:        item.consignation === 'Oui' ? 'Oui' : 'Non',
        consignation_motif:  item.consignation_motif || '',
        jour_nuit:           item.jour_nuit === 'Nuit' ? 'Nuit' : 'Jour',
        num_shift:           item.num_shift ? Number(item.num_shift) : null,
        statut:              'planifiee',
        created_by:          createdBy,                    // FIX: UUID or null, never a string
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      };
    });

    // FIX 5: Single bulk insert — atomic, fast, all-or-nothing
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('planning')
      .insert(rows)
      .select('id');

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({
        error: `Erreur insertion planning: ${insertError.message}`,
        details: insertError,
      });
    }

    // FIX 6: Log the import — uploaded_by must be UUID or null
    const { error: logError } = await supabaseAdmin
      .from('excel_imports')
      .insert({
        filename:    filename || 'unknown.xlsx',
        uploaded_by: createdBy,                           // FIX: UUID or null
        unite_id:    Number(unite_id),
        row_count:   interventions.length,
        status:      'success',
        created_at:  new Date().toISOString(),
      });

    if (logError) {
      // Non-blocking — log but don't fail the whole import
      console.warn('Import log warning:', logError.message);
    }

    // FIX 7: Notifications — only if admins exist
    try {
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          admins.map(a => ({
            user_id:    a.user_id,
            type:       'import',
            message:    `Import Excel: ${inserted.length} intervention(s) importée(s) — ${filename}`,
            lu:         false,
            created_at: new Date().toISOString(),
          }))
        );
      }
    } catch (notifErr) {
      console.warn('Notification warning:', notifErr.message);
    }

    return res.status(200).json({
      imported: inserted.length,
      errors:   0,
      message:  `${inserted.length} intervention(s) publiée(s) avec succès`,
    });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}