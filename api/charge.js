import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { unite_id, date_start, date_end, technicien_id } = req.query;
      const MAX_HOURS = 5;

      // Get technicians
      let techQuery = supabase.from('techniciens').select('*');
      if (unite_id) techQuery = techQuery.eq('unite_id', unite_id);
      if (technicien_id) techQuery = techQuery.eq('id', technicien_id);
      const { data: techs } = await techQuery;

      // Get planning interventions
      let planQuery = supabase.from('planning').select('*');
      if (unite_id) planQuery = planQuery.eq('unite_id', unite_id);
      const { data: plans } = await planQuery;
      let filtered = plans || [];
      if (date_start) filtered = filtered.filter(p => p.date_prevue && p.date_prevue >= date_start);
      if (date_end) filtered = filtered.filter(p => p.date_prevue && p.date_prevue <= date_end);

      // Get planning_techniciens links
      const planIds = filtered.map(p => p.id);
      let ptLinks = [];
      if (planIds.length > 0) {
        const { data } = await supabase.from('planning_techniciens').select('*').in('planning_id', planIds);
        ptLinks = data || [];
      }

      // Get unites for names
      const { data: unitesData } = await supabase.from('unites').select('*');
      const unitesMap = {};
      (unitesData || []).forEach(u => { unitesMap[u.id] = u; });

      // Get technician leaves
      const { data: conges } = await supabase.from('technicien_conges').select('*');

      // Build charge map per technician
      // Formula: charge = (duree_intervention / nb_intervenants) + temps_logistique
      const chargeMap = {};
      ptLinks.forEach(link => {
        const plan = filtered.find(p => p.id === link.planning_id);
        if (!plan || !plan.date_prevue) return;
        const tid = link.technicien_id;
        if (!chargeMap[tid]) chargeMap[tid] = { dates: {}, systeme: {}, unite: {} };

        // Count how many techs on this intervention
        const nbTechs = ptLinks.filter(l => l.planning_id === plan.id).length;
        const charge = ((parseFloat(plan.duree_intervention) || 0) / Math.max(1, nbTechs)) + (parseFloat(plan.temps_logistique) || 0);

        // By date
        const date = plan.date_prevue;
        if (!chargeMap[tid].dates[date]) chargeMap[tid].dates[date] = { hours: 0, interventions: [] };
        chargeMap[tid].dates[date].hours += charge;
        chargeMap[tid].dates[date].interventions.push({
          planning_id: plan.id, titre: plan.titre, date_prevue: date,
          duree_intervention: plan.duree_intervention, temps_logistique: plan.temps_logistique,
          nb_intervenants: nbTechs, charge,
          consignation: plan.consignation, jour_nuit: plan.jour_nuit, num_shift: plan.num_shift,
          systeme: plan.systeme, unite_id: plan.unite_id,
        });

        // By systeme
        const sys = plan.systeme || 'Autre';
        chargeMap[tid].systeme[sys] = (chargeMap[tid].systeme[sys] || 0) + charge;

        // By unite
        const uName = unitesMap[plan.unite_id]?.code || 'Autre';
        chargeMap[tid].unite[uName] = (chargeMap[tid].unite[uName] || 0) + charge;
      });

      const result = (techs || []).map(tech => {
        const tc = chargeMap[tech.id] || { dates: {}, systeme: {}, unite: {} };
        const techConges = (conges || []).filter(c => c.technicien_id === tech.id);
        const dates = Object.entries(tc.dates).map(([date, data]) => ({
          date, hours: Math.round(data.hours * 100) / 100, interventions: data.interventions,
          overloaded: data.hours > MAX_HOURS, remaining: Math.max(0, Math.round((MAX_HOURS - data.hours) * 100) / 100),
        }));
        dates.sort((a, b) => a.date.localeCompare(b.date));
        const totalHours = dates.reduce((s, d) => s + d.hours, 0);
        // Round systeme/unite values
        const chargeBySysteme = {};
        Object.entries(tc.systeme).forEach(([k, v]) => { chargeBySysteme[k] = Math.round(v * 100) / 100; });
        const chargeByUnite = {};
        Object.entries(tc.unite).forEach(([k, v]) => { chargeByUnite[k] = Math.round(v * 100) / 100; });
        return {
          technicien: tech, conges: techConges, dates,
          totalHours: Math.round(totalHours * 100) / 100,
          totalInterventions: dates.reduce((s, d) => s + d.interventions.length, 0),
          overloadedDates: dates.filter(d => d.overloaded).length,
          chargeBySysteme, chargeByUnite,
        };
      });

      return res.status(200).json({ maxHours: MAX_HOURS, techniciens: result });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Charge API error:', err);
    res.status(500).json({ error: err.message });
  }
}
