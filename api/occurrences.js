import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { master_id, date_start, date_end, statut, conflit } = req.query;
      let query = supabase.from('planning_occurrences').select('*');
      if (master_id) query = query.eq('master_id', master_id);
      if (statut) query = query.eq('statut', statut);
      if (conflit === 'weekend') query = query.eq('conflit_weekend', true);
      if (conflit === 'ferie') query = query.eq('conflit_ferie', true);
      if (conflit === 'surcharge') query = query.eq('conflit_surcharge', true);
      const { data, error } = await query.order('date_prevue', { ascending: true });
      if (error) throw error;
      let result = data || [];
      if (date_start) result = result.filter(o => o.date_prevue >= date_start);
      if (date_end) result = result.filter(o => o.date_prevue <= date_end);
      // Enrich with technicians
      if (result.length > 0) {
        const ids = result.map(o => o.id);
        const { data: otData } = await supabase.from('occurrence_techniciens').select('*').in('occurrence_id', ids);
        const otMap = {};
        (otData || []).forEach(t => { if (!otMap[t.occurrence_id]) otMap[t.occurrence_id] = []; otMap[t.occurrence_id].push(t); });
        result = result.map(o => ({ ...o, techniciens: otMap[o.id] || [] }));
      }
      return res.status(200).json(result);
    }
    if (req.method === 'POST') {
      const { occurrences } = req.body;
      if (!occurrences || !Array.isArray(occurrences)) return res.status(400).json({ error: 'No occurrences provided' });
      const inserts = occurrences.map(o => ({
        master_id: o.master_id, date_prevue: o.date_prevue, statut: o.statut || 'planifiee',
        conflit_weekend: o.conflit_weekend || false, conflit_ferie: o.conflit_ferie || false,
        conflit_surcharge: o.conflit_surcharge || false, details_conflit: o.details_conflit || '',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }));
      const { data, error } = await supabase.from('planning_occurrences').insert(inserts).select();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('planning_occurrences').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id, master_id } = req.body;
      if (master_id) {
        const { data: occs } = await supabase.from('planning_occurrences').select('id').eq('master_id', master_id);
        if (occs && occs.length > 0) {
          await supabase.from('occurrence_techniciens').delete().in('occurrence_id', occs.map(o => o.id));
        }
        await supabase.from('planning_occurrences').delete().eq('master_id', master_id);
      } else if (id) {
        await supabase.from('occurrence_techniciens').delete().eq('occurrence_id', id);
        await supabase.from('planning_occurrences').delete().eq('id', id);
      }
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
