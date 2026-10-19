// src/lib/notifications.ts

import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export type NotifType =
  | 'creation'
  | 'modification'
  | 'import'
  | 'delete'
  | 'info'
  | 'warning'
  | 'planning'
  | 'system';

interface NotifPayload {
  user_id: string;
  type: NotifType;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// RÉCUPÉRER LES DESTINATAIRES D'UNE UNITÉ
// ─────────────────────────────────────────────────────────────
async function getRecipients(uniteId: number): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, role, unite_id')
      .or(
        `role.eq.admin,and(unite_id.eq.${uniteId},role.in.(responsable_unite,charge_unite,technicien))`
      );

    if (error) {
      console.warn('⚠️ getRecipients error:', error.message);
      return [];
    }

    return (data ?? [])
      .map((p: any) => p.user_id)
      .filter(Boolean) as string[];
  } catch (err) {
    console.warn('⚠️ getRecipients exception:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ENVOYER DES NOTIFICATIONS (batch avec déduplication)
// ─────────────────────────────────────────────────────────────
async function sendNotifications(payloads: NotifPayload[]): Promise<void> {
  if (payloads.length === 0) return;

  // Déduplication par user_id + type + message
  const seen = new Set<string>();
  const unique = payloads.filter(p => {
    if (!p.user_id) return false;
    const key = `${p.user_id}::${p.type}::${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return;

  try {
    const { error } = await supabase
      .from('notifications')
      .insert(
        unique.map(p => ({
          user_id:    p.user_id,
          type:       p.type,
          message:    p.message,
          lu:         false,
          created_at: new Date().toISOString(),
        }))
      );

    if (error) {
      console.warn('⚠️ sendNotifications error:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ sendNotifications exception:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER : formater une date
// ─────────────────────────────────────────────────────────────
function fmtDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER : libellé statut
// ─────────────────────────────────────────────────────────────
const STATUT_LABELS: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours:  'En cours 🔄',
  terminee:  'Clôturée ✅',
  reportee:  'Reportée ⚠️',
};

function fmtStatut(s: string): string {
  return STATUT_LABELS[s] ?? s;
}

// ─────────────────────────────────────────────────────────────
// API PUBLIQUE
// ─────────────────────────────────────────────────────────────

/**
 * Notifier la création d'une intervention planifiée
 */
export async function notifyInterventionCreated(params: {
  userId:     string;
  uniteId:    number;
  titre:      string;
  datePrevue: string;
  atelier?:   string;
  frequence?: string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const freqPart    = params.frequence ? ` — ${params.frequence}` : '';
    const message     = `🆕 Nouvelle intervention${atelierPart} : "${params.titre}" le ${fmtDate(params.datePrevue)}${freqPart}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'creation' as NotifType, message })));
  } catch (err) {
    console.warn('notifyInterventionCreated:', err);
  }
}

/**
 * Notifier le changement de statut d'une intervention
 */
export async function notifyStatutChanged(params: {
  userId:     string;
  uniteId:    number;
  titre:      string;
  datePrevue: string;
  oldStatut:  string;
  newStatut:  string;
  atelier?:   string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const message = `✏️ Statut${atelierPart} "${params.titre}" (${fmtDate(params.datePrevue)}) : ${fmtStatut(params.oldStatut)} → ${fmtStatut(params.newStatut)}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'modification' as NotifType, message })));
  } catch (err) {
    console.warn('notifyStatutChanged:', err);
  }
}

/**
 * Notifier une modification générale d'intervention
 */
export async function notifyInterventionUpdated(params: {
  userId:     string;
  uniteId:    number;
  titre:      string;
  datePrevue: string;
  detail?:    string;
  atelier?:   string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const detailPart  = params.detail ? ` — ${params.detail}` : '';
    const message     = `✏️ Intervention${atelierPart} modifiée : "${params.titre}" le ${fmtDate(params.datePrevue)}${detailPart}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'modification' as NotifType, message })));
  } catch (err) {
    console.warn('notifyInterventionUpdated:', err);
  }
}

/**
 * Notifier la suppression d'une intervention
 */
export async function notifyInterventionDeleted(params: {
  userId:     string;
  uniteId:    number;
  titre:      string;
  datePrevue: string;
  atelier?:   string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const message     = `🗑️ Intervention${atelierPart} supprimée : "${params.titre}" du ${fmtDate(params.datePrevue)}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'delete' as NotifType, message })));
  } catch (err) {
    console.warn('notifyInterventionDeleted:', err);
  }
}

/**
 * Notifier l'import / publication d'un plan annuel
 */
export async function notifyPlanningImported(params: {
  userId:        string;
  uniteId:       number;
  annee:         number;
  nbOccurrences: number;
  uniteCode?:    string;
  isDuplicate?:  boolean;
  sourceYear?:   number;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const unitePart = params.uniteCode ? ` — Unité ${params.uniteCode}` : '';
    const dupPart   = params.isDuplicate && params.sourceYear
      ? ` (dupliqué depuis ${params.sourceYear})`
      : '';
    const message = `📥 Plan ${params.annee} publié${unitePart}${dupPart} : ${params.nbOccurrences} occurrence(s)`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'import' as NotifType, message })));
  } catch (err) {
    console.warn('notifyPlanningImported:', err);
  }
}

/**
 * Notifier un avertissement (surcharge, conflit calendrier, etc.)
 */
export async function notifyWarning(params: {
  userId:   string;
  uniteId:  number;
  message:  string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const message = params.message.startsWith('⚠️')
      ? params.message
      : `⚠️ ${params.message}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'warning' as NotifType, message })));
  } catch (err) {
    console.warn('notifyWarning:', err);
  }
}

/**
 * Notification info simple (pour l'utilisateur courant ou un groupe)
 */
export async function notifyInfo(params: {
  userId:  string;
  uniteId?: number;
  message: string;
}): Promise<void> {
  try {
    const recipients: string[] = params.uniteId
      ? await getRecipients(params.uniteId)
      : [];
    const all = [...new Set([...recipients, params.userId])];

    await sendNotifications(all.map(uid => ({
      user_id: uid,
      type:    'info' as NotifType,
      message: params.message,
    })));
  } catch (err) {
    console.warn('notifyInfo:', err);
  }
}

/**
 * Notification uniquement pour l'utilisateur courant
 */
export async function notifySelf(params: {
  userId:  string;
  type:    NotifType;
  message: string;
}): Promise<void> {
  try {
    await sendNotifications([{
      user_id: params.userId,
      type:    params.type,
      message: params.message,
    }]);
  } catch (err) {
    console.warn('notifySelf:', err);
  }
}

/**
 * Notifier le report d'une intervention
 */
export async function notifyInterventionReported(params: {
  userId:      string;
  uniteId:     number;
  titre:       string;
  oldDate:     string;
  newDate:     string;
  motif?:      string;
  atelier?:    string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const motifPart   = params.motif ? ` — Motif : ${params.motif}` : '';
    const message     = `📅 Intervention${atelierPart} reportée : "${params.titre}" du ${fmtDate(params.oldDate)} → ${fmtDate(params.newDate)}${motifPart}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'planning' as NotifType, message })));
  } catch (err) {
    console.warn('notifyInterventionReported:', err);
  }
}

/**
 * Notifier l'affectation d'un technicien
 */
export async function notifyTechnicienAssigned(params: {
  userId:        string;
  uniteId:       number;
  technicienNom: string;
  titre:         string;
  datePrevue:    string;
  atelier?:      string;
}): Promise<void> {
  try {
    const recipients = await getRecipients(params.uniteId);
    const all = [...new Set([...recipients, params.userId])];

    const atelierPart = params.atelier ? ` [${params.atelier}]` : '';
    const message     = `👷 ${params.technicienNom} affecté${atelierPart} : "${params.titre}" le ${fmtDate(params.datePrevue)}`;

    await sendNotifications(all.map(uid => ({ user_id: uid, type: 'modification' as NotifType, message })));
  } catch (err) {
    console.warn('notifyTechnicienAssigned:', err);
  }
}