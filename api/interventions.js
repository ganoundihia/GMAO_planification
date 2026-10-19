import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { unite_id, atelier_id, date_start, date_end, technicien_id, statut } = req.query;
      let query = supabase.from('planning').select('*');
      if (unite_id) query = query.eq('unite_id', unite_id);
      if (atelier_id) query = query.eq('atelier_id', atelier_id);
      if (statut) query = query.eq('statut', statut);
      const { data: items, error } = await query;
      if (error) { console.error('Planning fetch error:', error); return res.status(200).json([]); }
      let result = items || [];
      if (date_start) result = result.filter(i => i.date_prevue && i.date_prevue >= date_start);
      if (date_end) result = result.filter(i => i.date_prevue && i.date_prevue <= date_end);
      if (technicien_id) {
        try {
          const { data: itData } = await supabase.from('planning_techniciens').select('planning_id').eq('technicien_id', technicien_id);
          const ids = new Set((itData || []).map(it => it.planning_id));
          result = result.filter(i => ids.has(i.id));
        } catch (e) { console.error('Tech filter error:', e); }
      }
      if (result.length > 0) {
        try {
          const ids = result.map(i => i.id);
          const { data: techLinks } = await supabase.from('planning_techniciens').select('*').in('planning_id', ids);
          const techMap = {};
          (techLinks || []).forEach(t => { if (!techMap[t.planning_id]) techMap[t.planning_id] = []; techMap[t.planning_id].push(t); });
          result = result.map(i => ({ ...i, techniciens: techMap[i.id] || [] }));
        } catch (e) { console.error('Tech enrichment error:', e); result = result.map(i => ({ ...i, techniciens: [] })); }
      }
      result.sort((a, b) => (a.date_prevue || 'z').localeCompare(b.date_prevue || 'z'));
      return res.status(200).json(result);
    }
    if (req.method === 'POST') {
      const { intervention, techniciens, notify } = req.body;
      if (intervention.code_gmao) {
        const parts = intervention.code_gmao.split('.');
        if (!intervention.systeme && parts[0]) intervention.systeme = parts[0];
        if (!intervention.sous_systeme && parts[2]) intervention.sous_systeme = parts[2];
      }
      const insertData = {
        unite_id: intervention.unite_id, atelier_id: intervention.atelier_id || null,
        equipement: intervention.equipement || '', code_gmao: intervention.code_gmao || '',
        titre: intervention.titre, systeme: intervention.systeme || '', sous_systeme: intervention.sous_systeme || '',
        frequence: intervention.frequence || '', date_prevue: intervention.date_prevue || null,
        duree_intervention: intervention.duree_intervention || 0, temps_logistique: intervention.temps_logistique || 0,
        materiel: intervention.materiel || '', outillage: intervention.outillage || '',
        fiche_inspection: intervention.fiche_inspection || '',
        consignation: intervention.consignation || 'Non', consignation_motif: intervention.consignation_motif || '',
        jour_nuit: intervention.jour_nuit || 'Jour', num_shift: intervention.num_shift || null,
        statut: intervention.statut || 'planifiee', created_by: intervention.created_by || '',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const { data: newItem, error } = await supabase.from('planning').insert(insertData).select().single();
      if (error) throw error;
      if (techniciens && techniciens.length > 0) {
        await supabase.from('planning_techniciens').insert(techniciens.map(t => ({ planning_id: newItem.id, technicien_id: t.technicien_id, duree: t.duree || 1 })));
      }
      if (notify) {
        try {
          const { data: admins } = await supabase.from('profiles').select('user_id').eq('role', 'admin');
          if (admins && admins.length > 0) {
            await supabase.from('notifications').insert(admins.map(a => ({ user_id: a.user_id, type: 'creation', message: `Nouvelle intervention: ${intervention.titre}`, lu: false, created_at: new Date().toISOString() })));
          }
        } catch (e) { console.error('Notification error:', e); }
      }
      return res.status(201).json(newItem);
    }
    if (req.method === 'PUT') {
      const { id, intervention, techniciens, notify } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (intervention.code_gmao) {
        const parts = intervention.code_gmao.split('.');
        if (!intervention.systeme && parts[0]) intervention.systeme = parts[0];
        if (!intervention.sous_systeme && parts[2]) intervention.sous_systeme = parts[2];
      }
      const updateData = { ...intervention, updated_at: new Date().toISOString() };
      delete updateData.id; delete updateData.created_at; delete updateData.techniciens;
      const { data: updated, error } = await supabase.from('planning').update(updateData).eq('id', id).select().single();
      if (error) throw error;
      if (techniciens !== undefined) {
        await supabase.from('planning_techniciens').delete().eq('planning_id', id);
        if (techniciens.length > 0) {
          await supabase.from('planning_techniciens').insert(techniciens.map(t => ({ planning_id: id, technicien_id: t.technicien_id, duree: t.duree || 1 })));
        }
      }
      if (notify) {
        try {
          const { data: admins } = await supabase.from('profiles').select('user_id').eq('role', 'admin');
          if (admins && admins.length > 0) {
            await supabase.from('notifications').insert(admins.map(a => ({ user_id: a.user_id, type: 'modification', message: `Intervention modifiée: ${intervention?.titre || updated?.titre || '#' + id}`, lu: false, created_at: new Date().toISOString() })));
          }
        } catch (e) { console.error('Notification error:', e); }
      }
      return res.status(200).json(updated);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      await supabase.from('planning_techniciens').delete().eq('planning_id', id);
      const { error } = await supabase.from('planning').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
