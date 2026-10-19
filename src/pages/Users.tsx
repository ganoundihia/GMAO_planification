// pages/Users.tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Edit2, Plus, Trash2, Shield, UserCircle, Key, Eye, EyeOff,
  CheckCircle2, X, AlertTriangle, Loader2, Users as UsersIcon,
  Mail, User, Building2, Filter, RotateCcw, Target, Info,
  ChevronsUpDown, Crown, Briefcase, HardHat, Wand2, Copy, Star
} from 'lucide-react';
import type { Profile, Unite, Atelier, Role } from '../lib/types';
import { ROLES } from '../lib/types';

// ─── Animated Number ───
function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const from = 0; const to = value;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.floor(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(to);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ─── Pro Input ───
function ProInput({
  label, value, onChange, type = 'text', required = false, icon: Icon,
  placeholder, error, hint, rightAction
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; icon?: any;
  placeholder?: string; error?: string; hint?: string;
  rightAction?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className={`relative bg-white border rounded-xl transition-all duration-200 ${
        error ? 'border-red-300 ring-2 ring-red-100'
          : focused ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}>
        {Icon && (
          <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none ${
            focused ? 'text-blue-500' : error ? 'text-red-400' : 'text-slate-400'
          }`}>
            <Icon size={15} />
          </div>
        )}
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className={`w-full bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-300 ${
            Icon ? 'pl-10' : 'pl-4'
          } ${rightAction ? 'pr-12' : 'pr-4'} py-3 transition-all`}
        />
        {rightAction && <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightAction}</div>}
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 font-semibold flex items-center gap-1">
          <AlertTriangle size={10} />{error}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
          <Info size={10} />{hint}
        </p>
      )}
    </div>
  );
}

// ─── Pro Select ───
function ProSelect({
  label, value, onChange, options, required = false, icon: Icon, placeholder, disabled
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; icon?: any; placeholder?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className={`relative bg-white border rounded-xl transition-all duration-200 ${
        disabled ? 'opacity-50 cursor-not-allowed bg-slate-50'
          : focused ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}>
        {Icon && (
          <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
            focused ? 'text-blue-500' : 'text-slate-400'
          }`}>
            <Icon size={15} />
          </div>
        )}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          disabled={disabled}
          className={`w-full bg-transparent outline-none text-sm appearance-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${value ? 'text-slate-800' : 'text-slate-400'} ${Icon ? 'pl-10' : 'pl-4'} pr-10 py-3 transition-all`}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => (
            <option key={o.value} value={o.value} className="text-slate-800">{o.label}</option>
          ))}
        </select>
        <ChevronsUpDown size={14} className={`absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
          focused ? 'text-blue-500' : 'text-slate-300'
        }`} />
      </div>
    </div>
  );
}

// ─── Role config ───
const ROLE_CONFIG: Record<string, {
  label: string; gradient: string; icon: any; description: string; badge: string;
}> = {
  super_admin: {
    label: 'Super Admin',
    gradient: 'from-rose-500 to-red-600',
    icon: Star,
    description: 'Accès illimité à toute la plateforme, gestion des admins',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  admin: {
    label: 'Admin DG',
    gradient: 'from-amber-500 to-orange-600',
    icon: Crown,
    description: 'Accès total à toutes les unités et fonctionnalités',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  responsable_unite: {
    label: 'Responsable Unité',
    gradient: 'from-blue-500 to-indigo-600',
    icon: Briefcase,
    description: "Affecté à une seule unité, visualise tous les ateliers de cette unité et valide les plannings",
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  charge_unite: {
    label: "Chargé d'Unité",
    gradient: 'from-cyan-500 to-blue-600',
    icon: Shield,
    description: "Affecté à un seul atelier d'une unité précise, ne visualise que cet atelier",
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
};

const CREATABLE_ROLES: { value: string; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin DG' },
  { value: 'responsable_unite', label: 'Responsable Unité' },
  { value: 'charge_unite', label: "Chargé d'Unité" },
];

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const nums = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + nums + special;
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += nums[Math.floor(Math.random() * nums.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

const ROLES_NEEDING_UNITE = ['responsable_unite', 'charge_unite'];
const ROLES_NEEDING_ATELIER = ['charge_unite'];

// Le catalogue d'ateliers est global (CFA, VOIE, MR…) : il n'appartient pas à une seule
// unité, chaque unité couvre tous les ateliers. On ne filtre donc plus par unite_id
// (qui n'existe pas sur la table ateliers) — on exige juste qu'une unité soit choisie.
function ateliersOfUnite(ateliers: Atelier[], uniteId: string | number | null | undefined) {
  if (!uniteId) return [];
  return ateliers;
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function Users() {
  const { profile: myProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterUnite, setFilterUnite] = useState('');
  const [filterAtelier, setFilterAtelier] = useState('');

  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({
    role: '' as Role, unite_id: '', atelier_id: '', password: ''
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '', password: '', nom: '', prenom: '',
    role: 'charge_unite' as Role, unite_id: '', atelier_id: ''
  });

  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string; password: string
  } | null>(null);
  // Clé d'idempotence de la création de compte en cours : conservée tant que la requête
  // peut être rejouée sans risque (réseau coupé, 5xx, double clic), renouvelée dès que
  // le serveur a statué (succès ou erreur de validation).
  const addKeyRef = useRef<string | null>(null);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      setProfiles(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/profiles'),
      fetch('/api/unites'),
      fetch('/api/ateliers'),
    ])
      .then(([p, u, a]) => Promise.all([p.json(), u.json(), a.json()]))
      .then(([p, u, a]) => {
        setProfiles(Array.isArray(p) ? p : []);
        setUnites(Array.isArray(u) ? u : []);
        setAteliers(Array.isArray(a) ? a : []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ─── Ateliers disponibles selon l'unité sélectionnée (dépend de la forme active) ───
  const editAteliersOptions = useMemo(
    () => ateliersOfUnite(ateliers, editForm.unite_id),
    [ateliers, editForm.unite_id]
  );
  const addAteliersOptions = useMemo(
    () => ateliersOfUnite(ateliers, addForm.unite_id),
    [ateliers, addForm.unite_id]
  );

  // ─── Validation ───
  const isAddFormValid = useMemo(() => {
    if (!addForm.email || !addForm.password || !addForm.nom || !addForm.prenom) return false;
    if (addForm.password.length < 6) return false;
    if (ROLES_NEEDING_UNITE.includes(addForm.role) && !addForm.unite_id) return false;
    if (ROLES_NEEDING_ATELIER.includes(addForm.role) && !addForm.atelier_id) return false;
    return true;
  }, [addForm]);

  const isEditFormValid = useMemo(() => {
    if (editForm.password && editForm.password.length < 6) return false;
    if (ROLES_NEEDING_UNITE.includes(editForm.role) && !editForm.unite_id) return false;
    if (ROLES_NEEDING_ATELIER.includes(editForm.role) && !editForm.atelier_id) return false;
    return true;
  }, [editForm]);

  // ─── Handlers ───
  const handleUpdateUser = async () => {
    if (!editUser) return;
    setSaving(true); setEditError('');
    try {
      if (editForm.password && editForm.password.length < 6)
        throw new Error('Mot de passe minimum 6 caractères');
      if (ROLES_NEEDING_UNITE.includes(editForm.role) && !editForm.unite_id)
        throw new Error('Une unité est obligatoire pour ce rôle');
      if (ROLES_NEEDING_ATELIER.includes(editForm.role) && !editForm.atelier_id)
        throw new Error("Un atelier est obligatoire pour le rôle Chargé d'Unité");
      if (
        ROLES_NEEDING_ATELIER.includes(editForm.role) &&
        editForm.atelier_id &&
        !editAteliersOptions.some(a => String(a.id) === editForm.atelier_id)
      )
        throw new Error("L'atelier sélectionné n'appartient pas à l'unité choisie");

      const body: any = {
        id: editUser.id,
        role: editForm.role,
        unite_id: editForm.unite_id ? Number(editForm.unite_id) : null,
        atelier_id: editForm.atelier_id ? Number(editForm.atelier_id) : null,
      };
      if (editForm.password?.trim()) body.password = editForm.password.trim();

      const res = await fetch('/api/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur'); }
      setEditUser(null);
      setSuccessMsg(
        `✅ ${editUser.prenom} ${editUser.nom} modifié avec succès.${editForm.password ? ' Le mot de passe a été changé.' : ''}`
      );
      fetchProfiles();
    } catch (err: any) { setEditError(err.message); }
    finally { setSaving(false); }
  };

  const handleAddUser = async () => {
    setSaving(true); setAddError('');
    try {
      if (!addForm.email || !addForm.password || !addForm.nom || !addForm.prenom)
        throw new Error('Tous les champs marqués * sont obligatoires');
      if (addForm.password.length < 6)
        throw new Error('Le mot de passe doit contenir au minimum 6 caractères');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addForm.email))
        throw new Error('Email invalide');
      if (ROLES_NEEDING_UNITE.includes(addForm.role) && !addForm.unite_id)
        throw new Error(`Le rôle "${ROLE_CONFIG[addForm.role]?.label}" nécessite une unité`);
      if (ROLES_NEEDING_ATELIER.includes(addForm.role) && !addForm.atelier_id)
        throw new Error(`Le rôle "${ROLE_CONFIG[addForm.role]?.label}" nécessite un atelier`);
      if (
        ROLES_NEEDING_ATELIER.includes(addForm.role) &&
        addForm.atelier_id &&
        !addAteliersOptions.some(a => String(a.id) === addForm.atelier_id)
      )
        throw new Error("L'atelier sélectionné n'appartient pas à l'unité choisie");
      if (profiles.some(p => p.email.toLowerCase() === addForm.email.toLowerCase()))
        throw new Error('Cet email est déjà utilisé');

      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': (addKeyRef.current ??= crypto.randomUUID()),
        },
        body: JSON.stringify({
          ...addForm,
          unite_id: addForm.unite_id ? Number(addForm.unite_id) : null,
          atelier_id: addForm.atelier_id ? Number(addForm.atelier_id) : null,
        }),
      });
      if (!res.ok) {
        // Le serveur a rejeté la demande (validation…) : une correction = nouvelle clé.
        // 409 (déjà en cours), 429 (limité) et 5xx : on garde la clé pour un retry sûr.
        if (res.status < 500 && res.status !== 409 && res.status !== 429) addKeyRef.current = null;
        const d = await res.json().catch(() => ({}));
        throw new Error(
          res.status === 429 ? 'Trop de tentatives, réessayez dans une minute.' : (d.error || 'Erreur'),
        );
      }
      addKeyRef.current = null;
      setCreatedCredentials({ email: addForm.email, password: addForm.password });
      setAddForm({ email: '', password: '', nom: '', prenom: '', role: 'charge_unite', unite_id: '', atelier_id: '' });
      setSuccessMsg(`✅ Compte créé pour ${addForm.prenom} ${addForm.nom}`);
      fetchProfiles();
    } catch (err: any) { setAddError(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteUser = async (p: Profile) => {
    if (p.id === myProfile?.id) { alert('Vous ne pouvez pas supprimer votre propre compte'); return; }
    if (!confirm(`Supprimer définitivement :\n${p.prenom} ${p.nom}\n${p.email}\n\nCette action est irréversible.`)) return;
    try {
      const res = await fetch(`/api/profiles?id=${encodeURIComponent(p.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Erreur serveur ${res.status}`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setSuccessMsg(`✅ ${p.prenom} ${p.nom} supprimé avec succès.`);
      fetchProfiles();
    } catch (e: any) {
      console.error('❌ Delete error:', e);
      alert(`Erreur suppression : ${e.message}`);
    }
  };

  const openEdit = (p: Profile) => {
    setEditUser(p);
    setEditForm({
      role: p.role,
      unite_id: p.unite_id ? String(p.unite_id) : '',
      atelier_id: p.atelier_id ? String(p.atelier_id) : '',
      password: '',
    });
    setEditError('');
    setShowPassword(false);
  };

  const openNew = () => {
    setShowAddModal(true);
    setAddError('');
    addKeyRef.current = null;
    setCreatedCredentials(null);
    setAddForm({ email: '', password: '', nom: '', prenom: '', role: 'charge_unite', unite_id: '', atelier_id: '' });
  };

  const handleGeneratePassword = (which: 'add' | 'edit') => {
    const pwd = generatePassword();
    if (which === 'add') { setAddForm(f => ({ ...f, password: pwd })); setShowNewPassword(true); }
    else { setEditForm(f => ({ ...f, password: pwd })); setShowPassword(true); }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    } catch {}
  };

  // ─── Filtered list ───
  const filtered = useMemo(() => {
    let list = profiles;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => `${p.prenom} ${p.nom} ${p.email}`.toLowerCase().includes(q));
    }
    if (filterRole) list = list.filter(p => p.role === filterRole);
    if (filterUnite) list = list.filter(p => Number(p.unite_id) === Number(filterUnite));
    if (filterAtelier) list = list.filter(p => Number(p.atelier_id) === Number(filterAtelier));
    return list;
  }, [profiles, search, filterRole, filterUnite, filterAtelier]);

  // Ateliers proposés dans le filtre, limités à l'unité sélectionnée (si une unité est filtrée)
  const filterAteliersOptions = useMemo(
    () => (filterUnite ? ateliersOfUnite(ateliers, filterUnite) : ateliers),
    [ateliers, filterUnite]
  );

  const stats = useMemo(() => ({
    total: profiles.length,
    super_admin: profiles.filter(p => p.role === 'super_admin').length,
    admin: profiles.filter(p => p.role === 'admin').length,
    responsables: profiles.filter(p => p.role === 'responsable_unite').length,
    charges: profiles.filter(p => p.role === 'charge_unite').length,
  }), [profiles]);

  const activeFilterCount = (filterRole ? 1 : 0) + (filterUnite ? 1 : 0) + (filterAtelier ? 1 : 0);

  if (loading) return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 flex flex-col items-center gap-4">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Chargement des utilisateurs…</p>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* HEADER */}
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#0c1530] rounded-3xl p-5 lg:p-6 shadow-md">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <UsersIcon size={22} className="text-blue-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Gestion des Utilisateurs</h1>
                <p className="text-xs text-slate-300">{profiles.length} compte(s) actif(s) · {filtered.length} affiché(s)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={openNew}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors">
                <Plus size={14} strokeWidth={2.5} />Nouvel utilisateur
              </button>
            </div>
          </div>
        </div>

        {/* SUCCESS */}
        {successMsg && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 size={17} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-emerald-800 flex-1">{successMsg}</p>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { l: 'Total', v: stats.total, sub: 'comptes actifs', icon: UsersIcon, iconBg: 'from-slate-700 to-slate-900' },
            { l: 'Super Admin', v: stats.super_admin, sub: 'accès illimité', icon: Star, iconBg: 'from-rose-500 to-red-600' },
            { l: 'Admin DG', v: stats.admin, sub: 'accès total', icon: Crown, iconBg: 'from-amber-500 to-orange-600' },
            { l: 'Responsables', v: stats.responsables, sub: 'gestionnaires', icon: Briefcase, iconBg: 'from-blue-500 to-indigo-600' },
            { l: 'Chargés', v: stats.charges, sub: "d'unité", icon: Shield, iconBg: 'from-cyan-500 to-blue-600' },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.l}
                className="group bg-white rounded-2xl p-4 shadow-sm relative overflow-hidden cursor-default">
                <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${k.iconBg} opacity-5 group-hover:opacity-10 blur-2xl transition-all`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${k.iconBg} flex items-center justify-center shadow-md transition-transform group-hover:scale-110`}>
                      <Icon size={17} className="text-white" />
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.l}</p>
                  <AnimatedNumber value={k.v} className="text-2xl font-black text-slate-800 tracking-tight leading-none tabular-nums block mt-1" />
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{k.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* FILTERS */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#1e2a5e]/20" />
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-blue-500" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Recherche & Filtres</p>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-blue-100 text-blue-700">
                  {activeFilterCount} actif{activeFilterCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {(search || activeFilterCount > 0) && (
              <button onClick={() => { setSearch(''); setFilterRole(''); setFilterUnite(''); setFilterAtelier(''); }}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors">
                <RotateCcw size={11} /> Réinitialiser
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Recherche</label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Nom, prénom ou email..."
                  className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all hover:border-slate-300" />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <ProSelect label="Rôle" value={filterRole} onChange={setFilterRole}
              icon={Shield} placeholder="Tous les rôles" options={CREATABLE_ROLES} />

            <ProSelect label="Unité" value={filterUnite}
              onChange={v => { setFilterUnite(v); setFilterAtelier(''); }}
              icon={Building2} placeholder="Toutes les unités"
              options={unites.map(u => ({ value: String(u.id), label: `${u.code} — ${u.nom}` }))} />

            <ProSelect label="Atelier" value={filterAtelier} onChange={setFilterAtelier}
              icon={HardHat} placeholder={filterUnite ? "Tous les ateliers de l'unité" : "Tous les ateliers"}
              options={filterAteliersOptions.map(a => ({ value: String(a.id), label: `${a.code} — ${a.nom}` }))} />
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-100">
                  {['Utilisateur', 'Email', 'Rôle', 'Unité', 'Atelier(s)', 'Statut', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
                          <UsersIcon size={28} className="text-slate-300" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-semibold text-slate-400">
                          {search || activeFilterCount > 0 ? 'Aucun résultat' : 'Aucun utilisateur'}
                        </p>
                        {(search || activeFilterCount > 0) && (
                          <button onClick={() => { setSearch(''); setFilterRole(''); setFilterUnite(''); setFilterAtelier(''); }}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700">
                            Réinitialiser les filtres →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.map(p => {
                  const roleConfig = ROLE_CONFIG[p.role] || ROLE_CONFIG.charge_unite;
                  const RoleIcon = roleConfig.icon;
                  const unite = unites.find(u => u.id === p.unite_id);
                  const atelier = ateliers.find(a => a.id === p.atelier_id);
                  const isMe = p.id === myProfile?.id;
                  // Ateliers réellement rattachés à l'unité du responsable (pas la liste globale)
                  const uniteAteliers = p.role === 'responsable_unite'
                    ? ateliersOfUnite(ateliers, p.unite_id)
                    : [];

                  return (
                    <tr key={p.id} className={`group hover:bg-blue-50/20 transition-colors ${isMe ? 'bg-blue-50/30' : ''}`}>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`relative w-9 h-9 rounded-xl bg-gradient-to-br ${roleConfig.gradient} flex items-center justify-center text-white font-black text-[11px] shadow-sm shrink-0`}>
                            {p.prenom?.[0]}{p.nom?.[0]}
                            {isMe && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white" title="Vous" />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-[13px]">{p.prenom} {p.nom}</p>
                            {isMe && (
                              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold mt-0.5">
                                <CheckCircle2 size={8} />Vous
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-600 text-[12px]">
                          <Mail size={11} className="text-slate-400" />{p.email}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-bold border ${roleConfig.badge}`}>
                          <RoleIcon size={10} />{roleConfig.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {unite ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg font-bold">
                            <Building2 size={10} />{unite.code}
                          </span>
                        ) : <span className="text-slate-300 text-[11px]">—</span>}
                      </td>

                      {/* ATELIER(S) — logique clé */}
                      <td className="px-4 py-3">
                        {p.role === 'responsable_unite' && unite ? (
                          /* Responsable → tous les ateliers de SA seule unité */
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {uniteAteliers.length > 0 ? uniteAteliers.map(a => (
                              <span key={a.id}
                                className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded font-bold">
                                <HardHat size={8} />{a.code}
                              </span>
                            )) : (
                              <span className="text-slate-300 text-[10px]">Aucun atelier</span>
                            )}
                          </div>
                        ) : p.role === 'charge_unite' ? (
                          /* Chargé → SON atelier uniquement, dans SA seule unité */
                          atelier ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg font-bold">
                              <HardHat size={10} />{atelier.code} — {atelier.nom}
                            </span>
                          ) : (
                            <span className="text-amber-500 text-[10px] font-semibold flex items-center gap-1">
                              <AlertTriangle size={9} />Non assigné
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Actif
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(p)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Modifier">
                            <Edit2 size={13} />
                          </button>
                          {!isMe && (
                            <button onClick={() => handleDeleteUser(p)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Supprimer">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-slate-400">
          <Target size={10} />
          <span>{stats.total} comptes · {stats.super_admin} super admin · {stats.admin} admin · {stats.responsables} resp. · {stats.charges} chargés</span>
        </div>

        {/* ═══════════════════════════════
            EDIT MODAL
        ═══════════════════════════════ */}
        {editUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setEditUser(null); setEditError(''); }}>
            <div onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]">

              <div className="px-6 py-5 bg-gradient-to-br from-[#1e2a5e] to-[#0c1530]">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${ROLE_CONFIG[editUser.role]?.gradient || 'from-blue-500 to-indigo-600'} flex items-center justify-center text-white font-black text-base shadow-md`}>
                    {editUser.prenom?.[0]}{editUser.nom?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Modifier l'utilisateur</p>
                    <h2 className="text-base font-bold text-white truncate">{editUser.prenom} {editUser.nom}</h2>
                    <p className="text-[11px] text-white/50 mt-0.5 truncate">{editUser.email}</p>
                  </div>
                  <button onClick={() => { setEditUser(null); setEditError(''); }}
                    className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />{editError}
                  </div>
                )}

                <ProSelect label="Rôle" value={editForm.role}
                  onChange={v => setEditForm(f => ({
                    ...f, role: v as Role,
                    // On repart d'une unité/atelier vides à chaque changement de rôle
                    // pour éviter des combinaisons unité/atelier incohérentes.
                    atelier_id: '',
                    unite_id: ROLES_NEEDING_UNITE.includes(v) ? f.unite_id : '',
                  }))}
                  required icon={Shield} options={CREATABLE_ROLES} />

                {editForm.role && ROLE_CONFIG[editForm.role] && (
                  <div className={`p-3 rounded-xl border ${ROLE_CONFIG[editForm.role].badge} flex items-start gap-2`}>
                    {(() => { const I = ROLE_CONFIG[editForm.role].icon; return <I size={14} className="shrink-0 mt-0.5" />; })()}
                    <span className="text-xs">{ROLE_CONFIG[editForm.role].description}</span>
                  </div>
                )}

                {/* Unité — seulement si rôle le nécessite (responsable ou chargé) */}
                {ROLES_NEEDING_UNITE.includes(editForm.role) && (
                  <>
                    <ProSelect label="Unité" value={editForm.unite_id}
                      onChange={v => setEditForm(f => ({ ...f, unite_id: v, atelier_id: '' }))}
                      required icon={Building2} placeholder="Sélectionner une unité..."
                      options={unites.map(u => ({ value: String(u.id), label: `${u.code} — ${u.nom}` }))} />

                    {!editForm.unite_id && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        Le rôle <strong>{ROLE_CONFIG[editForm.role]?.label}</strong> nécessite une unité.
                      </div>
                    )}
                  </>
                )}

                {/* Atelier — uniquement pour charge_unite, filtré par l'unité sélectionnée */}
                {ROLES_NEEDING_ATELIER.includes(editForm.role) && (
                  <>
                    <ProSelect
                      label="Atelier" value={editForm.atelier_id}
                      onChange={v => setEditForm(f => ({ ...f, atelier_id: v }))}
                      required icon={HardHat}
                      disabled={!editForm.unite_id}
                      placeholder={editForm.unite_id ? "Sélectionner un atelier..." : "Choisissez d'abord une unité"}
                      options={editAteliersOptions.map(a => ({ value: String(a.id), label: `${a.code} — ${a.nom}` }))}
                    />

                    {editForm.unite_id && editAteliersOptions.length === 0 && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        Cette unité ne possède aucun atelier.
                      </div>
                    )}

                    {editForm.unite_id && !editForm.atelier_id && editAteliersOptions.length > 0 && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        Sélectionnez un atelier pour ce chargé d'unité.
                      </div>
                    )}

                    <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-[11px] text-cyan-700 flex items-start gap-2">
                      <Info size={12} className="shrink-0 mt-0.5 text-cyan-500" />
                      <span>Le <strong>Chargé d'Unité</strong> ne visualise que les données de <strong>son atelier uniquement</strong>.</span>
                    </div>
                  </>
                )}

                {/* Info responsable */}
                {editForm.role === 'responsable_unite' && editForm.unite_id && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-700 flex items-start gap-2">
                    <Info size={12} className="shrink-0 mt-0.5 text-blue-500" />
                    <span>
                      Ce responsable accède à <strong>tous les {editAteliersOptions.length} atelier(s)</strong> de son unité.
                    </span>
                  </div>
                )}

                {/* Mot de passe */}
                <ProInput label="Nouveau mot de passe" value={editForm.password}
                  onChange={v => setEditForm(f => ({ ...f, password: v }))}
                  type={showPassword ? 'text' : 'password'}
                  icon={Key} placeholder="Laisser vide pour ne pas changer"
                  hint="Minimum 6 caractères si renseigné"
                  error={editForm.password && editForm.password.length < 6 ? 'Minimum 6 caractères' : ''}
                  rightAction={
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => handleGeneratePassword('edit')}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Générer">
                        <Wand2 size={13} />
                      </button>
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all">
                        {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  }
                />
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                <button onClick={() => { setEditUser(null); setEditError(''); }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <button onClick={handleUpdateUser} disabled={saving || !isEditFormValid}
                  className="px-5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2">
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" />Enregistrement…</>
                    : <><CheckCircle2 size={14} strokeWidth={2.5} />Enregistrer</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════
            ADD MODAL
        ═══════════════════════════════ */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setShowAddModal(false); setAddError(''); setCreatedCredentials(null); }}>
            <div onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]">

              <div className="px-6 py-5 bg-gradient-to-br from-[#1e2a5e] to-[#0c1530]">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                    <UserCircle size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Création de compte</p>
                    <h2 className="text-base font-bold text-white">Nouvel utilisateur</h2>
                    <p className="text-[11px] text-white/50 mt-0.5">L'utilisateur recevra ces identifiants pour se connecter</p>
                  </div>
                  <button onClick={() => { setShowAddModal(false); setAddError(''); setCreatedCredentials(null); }}
                    className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {createdCredentials ? (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 shadow-md">
                      <CheckCircle2 size={17} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-800">Compte créé avec succès</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">Communiquez ces identifiants à l'utilisateur.</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Mail size={10} />Email</p>
                        <button onClick={() => copyToClipboard(createdCredentials.email)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"><Copy size={12} /></button>
                      </div>
                      <p className="font-mono text-sm font-bold text-slate-800 break-all">{createdCredentials.email}</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1"><Key size={10} />Mot de passe temporaire</p>
                        <button onClick={() => copyToClipboard(createdCredentials.password)}
                          className="flex items-center gap-1 px-2 py-1 bg-white border border-amber-200 hover:border-amber-300 text-amber-700 text-[10px] font-bold rounded-lg transition-all">
                          {copiedPwd ? <><CheckCircle2 size={10} />Copié</> : <><Copy size={10} />Copier</>}
                        </button>
                      </div>
                      <p className="font-mono text-sm font-bold text-amber-900 break-all">{createdCredentials.password}</p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-start gap-2">
                      <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
                      <span>L'utilisateur pourra changer son mot de passe après sa première connexion.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
                    <span>
                      Créez un compte <strong>Super Admin</strong>, <strong>Admin DG</strong>,{' '}
                      <strong>Responsable d'Unité</strong> ou <strong>Chargé d'Unité</strong>.
                    </span>
                  </div>

                  {addError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />{addError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <ProInput label="Prénom" value={addForm.prenom}
                      onChange={v => setAddForm(f => ({ ...f, prenom: v }))} required icon={User} placeholder="Ahmed" />
                    <ProInput label="Nom" value={addForm.nom}
                      onChange={v => setAddForm(f => ({ ...f, nom: v }))} required icon={User} placeholder="Benali" />
                  </div>

                  <ProInput label="Email" value={addForm.email}
                    onChange={v => setAddForm(f => ({ ...f, email: v.toLowerCase().trim() }))}
                    type="email" required icon={Mail} placeholder="prenom.nom@setram.dz"
                    hint="Servira d'identifiant de connexion" />

                  <ProInput label="Mot de passe initial" value={addForm.password}
                    onChange={v => setAddForm(f => ({ ...f, password: v }))}
                    type={showNewPassword ? 'text' : 'password'}
                    required icon={Key} placeholder="Minimum 6 caractères"
                    hint="Cliquez sur la baguette pour générer un mot de passe fort"
                    error={addForm.password && addForm.password.length < 6 ? 'Minimum 6 caractères' : ''}
                    rightAction={
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => handleGeneratePassword('add')}
                          className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Générer">
                          <Wand2 size={13} />
                        </button>
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all">
                          {showNewPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    }
                  />

                  {/* Role cards */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">
                      Rôle <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {CREATABLE_ROLES.map(r => {
                        const cfg = ROLE_CONFIG[r.value];
                        const Icon = cfg?.icon || Shield;
                        const active = addForm.role === r.value;
                        return (
                          <button key={r.value} type="button"
                            onClick={() => setAddForm(f => ({
                              ...f, role: r.value as Role,
                              // On repart d'une unité/atelier vides à chaque changement de rôle
                              atelier_id: '',
                              unite_id: ROLES_NEEDING_UNITE.includes(r.value) ? f.unite_id : '',
                            }))}
                            className={`group relative p-3 rounded-xl text-left border transition-all overflow-hidden active:scale-95 ${
                              active
                                ? 'border-[#1e2a5e]/40 bg-[#1e2a5e]/5 shadow-md ring-2 ring-[#1e2a5e]/20'
                                : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'
                            }`}>
                            <div className="relative flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cfg?.gradient} flex items-center justify-center shadow-sm shrink-0 transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                                <Icon size={15} className="text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className={`text-xs font-bold truncate ${active ? 'text-blue-900' : 'text-slate-700'}`}>{r.label}</p>
                                {active && (
                                  <p className="text-[9px] text-blue-600 font-semibold flex items-center gap-1 mt-0.5">
                                    <CheckCircle2 size={9} />Sélectionné
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {addForm.role && ROLE_CONFIG[addForm.role] && (
                    <div className={`p-3 rounded-xl border ${ROLE_CONFIG[addForm.role].badge} flex items-start gap-2`}>
                      {(() => { const I = ROLE_CONFIG[addForm.role].icon; return <I size={14} className="shrink-0 mt-0.5" />; })()}
                      <div>
                        <p className="text-xs font-bold">{ROLE_CONFIG[addForm.role].label}</p>
                        <p className="text-[11px] mt-0.5 opacity-80">{ROLE_CONFIG[addForm.role].description}</p>
                      </div>
                    </div>
                  )}

                  {/* Unité — seulement si rôle le nécessite (responsable ou chargé) */}
                  {ROLES_NEEDING_UNITE.includes(addForm.role) && (
                    <>
                      <ProSelect label="Unité d'affectation" value={addForm.unite_id}
                        onChange={v => setAddForm(f => ({ ...f, unite_id: v, atelier_id: '' }))}
                        required icon={Building2} placeholder="Sélectionner une unité..."
                        options={unites.map(u => ({ value: String(u.id), label: `${u.code} — ${u.nom}` }))} />

                      {!addForm.unite_id && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          Le rôle <strong>{ROLE_CONFIG[addForm.role]?.label}</strong> nécessite une unité.
                        </div>
                      )}
                    </>
                  )}

                  {/* Atelier — uniquement pour charge_unite, filtré par l'unité sélectionnée */}
                  {ROLES_NEEDING_ATELIER.includes(addForm.role) && (
                    <>
                      <ProSelect
                        label="Atelier d'affectation"
                        value={addForm.atelier_id}
                        onChange={v => setAddForm(f => ({ ...f, atelier_id: v }))}
                        required icon={HardHat}
                        disabled={!addForm.unite_id}
                        placeholder={addForm.unite_id ? "Sélectionner un atelier..." : "Choisissez d'abord une unité"}
                        options={addAteliersOptions.map(a => ({
                          value: String(a.id),
                          label: `${a.code} — ${a.nom}`
                        }))}
                      />

                      {addForm.unite_id && addAteliersOptions.length === 0 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          Cette unité ne possède aucun atelier.
                        </div>
                      )}

                      {addForm.unite_id && !addForm.atelier_id && addAteliersOptions.length > 0 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-start gap-1.5">
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          Sélectionnez un atelier pour ce chargé d'unité.
                        </div>
                      )}

                      <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-[11px] text-cyan-700 flex items-start gap-2">
                        <Info size={12} className="shrink-0 mt-0.5 text-cyan-500" />
                        <span>
                          Ce chargé ne visualisera que <strong>son atelier uniquement</strong>,
                          contrairement au responsable qui accède à tous les ateliers de l'unité.
                        </span>
                      </div>
                    </>
                  )}

                  {/* Info responsable */}
                  {addForm.role === 'responsable_unite' && addForm.unite_id && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-700 flex items-start gap-2">
                      <Info size={12} className="shrink-0 mt-0.5 text-blue-500" />
                      <span>
                        Ce responsable accède à <strong>tous les {addAteliersOptions.length} atelier(s)</strong> de son unité.
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                {createdCredentials ? (
                  <button onClick={() => { setShowAddModal(false); setCreatedCredentials(null); }}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-sm font-bold shadow-sm shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2">
                    <CheckCircle2 size={14} strokeWidth={2.5} />Terminer
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setShowAddModal(false); setAddError(''); }}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                      Annuler
                    </button>
                    <button onClick={handleAddUser} disabled={saving || !isAddFormValid}
                      className="px-5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2">
                      {saving
                        ? <><Loader2 size={14} className="animate-spin" />Création…</>
                        : <><Plus size={14} strokeWidth={2.5} />Créer le compte</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}