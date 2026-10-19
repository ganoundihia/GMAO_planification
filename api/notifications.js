import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { user_id, lu, limit } = req.query;
      // Try to wake DB first
      try { await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } }); } catch {}
      let query = supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (user_id) query = query.eq('user_id', user_id);
      if (lu !== undefined) query = query.eq('lu', lu === 'true');
      if (limit) query = query.limit(parseInt(limit));
      else query = query.limit(100);
      const { data, error } = await query;
      if (error) { console.error('Notifications error:', JSON.stringify(error)); return res.status(200).json([]); }
      return res.status(200).json(data || []);
    }
    if (req.method === 'POST') {
      const { data, error } = await supabase.from('notifications').insert({ ...req.body, created_at: new Date().toISOString(), lu: false }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      const { data, error } = await supabase.from('notifications').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Notifications API error:', err);
    res.status(500).json({ error: err.message });
  }
}
