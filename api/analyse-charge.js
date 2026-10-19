import supabase from './db-client.js';

const FREQ_JOURS = { Quotidienne: 1, Hebdomadaire: 7, Mensuelle: 30, Trimestrielle: 90, Semestrielle: 180, Annuelle: 365 };

// Count working days (Sun-Thu are working days, Fri-Sat are weekend in Algeria)
function countWorkingDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 5 && day !== 6) count++; // Fri=5, Sat=6
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { date_debut, date_fin, atelier_id, unite_id, technicien_id, cap_h } = req.query;
      if (!date_debut || !date_fin) return res.status(400).json({ error: 'date_debut et date_fin requis' });

      const cap = parseFloat(cap_h) || 5;
      const joursOuvres = countWorkingDays(date_debut, date_fin);

      if (joursOuvres < 1) return res.status(400).json({ error: 'Période inférieure à 1 jour ouvré' });

      // Fetch interventions
      let query = supabase.from('planning').select('*');
      if (unite_id) query = query.eq('unite_id', unite_id);
      if (atelier_id) query = query.eq('atelier_id', atelier_id);
      const { data: interventions, error: intError } = await query;
      if (intError) { console.error('Fetch error:', intError); return res.status(500).json({ error: intError.message }); }

      let filteredInterventions = interventions || [];

      // Fetch techniciens
      let techQuery = supabase.from('techniciens').select('*');
      if (unite_id) techQuery = techQuery.eq('unite_id', unite_id);
      if (technicien_id) techQuery = techQuery.eq('id', technicien_id);
      const { data: allTechs } = await techQuery;
      const techList = allTechs || [];

      // Fetch planning_techniciens for all interventions
      const intIds = filteredInterventions.map(i => i.id);
      let techLinks = [];
      if (intIds.length > 0) {
        const { data: links } = await supabase.from('planning_techniciens').select('*').in('planning_id', intIds);
        techLinks = links || [];
      }

      // Fetch ateliers for codes
      const { data: ateliers } = await supabase.from('ateliers').select('*');
      const atelierMap = {};
      (ateliers || []).forEach(a => atelierMap[a.id] = a.code);

      // Fetch unites for codes
      const { data: unites } = await supabase.from('unites').select('*');
      const uniteMap = {};
      (unites || []).forEach(u => uniteMap[u.id] = u.code);

      // Build per-technician charge
      const techChargeMap = {};
      techList.forEach(t => {
        techChargeMap[t.id] = {
          technicien_id: t.id, nom: t.nom, prenom: t.prenom, unite_code: uniteMap[t.unite_id] || '-',
          jours_dispo: joursOuvres, charge_totale_min: 0, interventions: [], en_conge: false
        };
      });

      // For each intervention, compute contribution per technician
      filteredInterventions.forEach(intervention => {
        const freqJours = FREQ_JOURS[intervention.frequence] || 365;
        const nbOcc = Math.floor(joursOuvres / freqJours);
        const intTechs = techLinks.filter(l => l.planning_id === intervention.id);
        const nbTechs = intTechs.length || 1;

        intTechs.forEach(link => {
          if (!techChargeMap[link.technicien_id]) return;
          const dureeInterMin = (link.duree || intervention.duree_intervention || 0) * 60;
          const dureeLogMin = (intervention.temps_logistique || 0) * 60;
          const chargeOccTech = (dureeInterMin / nbTechs) + dureeLogMin;
          const contribution = nbOcc * chargeOccTech;

          const isHorsPeriode = nbOcc === 0;
          techChargeMap[link.technicien_id].charge_totale_min += isHorsPeriode ? 0 : contribution;
          techChargeMap[link.technicien_id].interventions.push({
            intervention_id: intervention.id,
            titre: intervention.titre,
            atelier_code: atelierMap[intervention.atelier_id] || '-',
            frequence: intervention.frequence,
            nb_occ: nbOcc,
            duree_occ_min: Math.round(chargeOccTech * 100) / 100,
            total_h: Math.round((isHorsPeriode ? 0 : contribution) / 60 * 100) / 100,
            alerte: isHorsPeriode ? '0 occ. - hors période' : null,
            detail: `${Math.round(dureeInterMin)}min inter (${Math.round(dureeInterMin)}min / ${nbTechs} tech) + ${Math.round(dureeLogMin)}min log = ${Math.round(chargeOccTech)}min/occ`,
            hors_periode: isHorsPeriode,
          });
        });
      });

      // Compute stats
      const techArray = Object.values(techChargeMap).map(tc => {
        const chargeH = Math.round(tc.charge_totale_min / 60 * 100) / 100;
        const chargeMoyHJ = tc.jours_dispo > 0 ? Math.round(chargeH / tc.jours_dispo * 100) / 100 : 0;
        const enSurcharge = chargeH > cap * tc.jours_dispo;
        return { ...tc, charge_totale_h: chargeH, charge_moy_h_j: chargeMoyHJ, en_surcharge: enSurcharge };
      }).sort((a, b) => b.charge_totale_h - a.charge_totale_h);

      const nbSurcharges = techArray.filter(t => t.en_surcharge).length;
      const totalCharge = techArray.reduce((s, t) => s + t.charge_totale_h, 0);
      const totalJours = techArray.reduce((s, t) => s + t.jours_dispo, 0);
      const chargeMoy = totalJours > 0 ? Math.round(totalCharge / totalJours * 100) / 100 : 0;

      return res.status(200).json({
        jours_ouvres: joursOuvres,
        techniciens: techArray,
        stats: { nb_analyses: techArray.length, nb_surcharges: nbSurcharges, charge_moy_h_j: chargeMoy }
      });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
