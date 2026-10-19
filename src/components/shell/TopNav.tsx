import { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface SubItem {
  to: string;
  label: string;
}

interface Section {
  to: string;
  label: string;
  children?: SubItem[];
}

const SECTIONS: Section[] = [
  { to: '/planification', label: 'Planification' },
  {
    to: '/ingenierie',
    label: 'Ingénierie',
    children: [
      { to: '/ingenierie', label: "Vue d'ensemble" },
      { to: '/ingenierie/import', label: "Centre d'Import" },
      { to: '/ingenierie/mbf', label: 'Analyse MBF' },
      { to: '/ingenierie/ram', label: 'Analyse RAM' },
      { to: '/ingenierie/rapport-journalier', label: 'Rapport Journalier' },
      { to: '/ingenierie/performances', label: 'Suivi des Performances' },
    ],
  },
  {
    to: '/documents',
    label: 'Documents',
    children: [
      { to: '/documents', label: "Vue d'ensemble" },
      { to: '/documents/validation', label: 'Validation des rapports' },
      { to: '/documents/registre', label: 'Registre des documents' },
      { to: '/documents/modifications', label: 'Demandes de modification' },
    ],
  },
];

function NavItem({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useLocation();
  const isSectionActive = location.pathname.startsWith(section.to);

  const openMenu = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  if (!section.children) {
    return (
      <NavLink
        to={section.to}
        className={({ isActive }) =>
          `relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber
          ${isActive ? 'text-white' : 'text-white/55 hover:text-white/85 hover:bg-white/5'}`
        }
      >
        {({ isActive }) => (
          <>
            {section.label}
            {isActive && (
              <motion.span
                layoutId="topnav-underline"
                className="absolute inset-x-3.5 -bottom-[1px] h-0.5 rounded-full bg-amber"
                transition={{ duration: 0.2, ease: [0.22, 0.9, 0.32, 1] }}
              />
            )}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <NavLink
        to={section.to}
        onFocus={openMenu}
        className={`relative flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber
          ${isSectionActive ? 'text-white' : 'text-white/55 hover:text-white/85 hover:bg-white/5'}`}
      >
        {section.label}
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {isSectionActive && (
          <motion.span
            layoutId="topnav-underline"
            className="absolute inset-x-3.5 -bottom-[1px] h-0.5 rounded-full bg-amber"
            transition={{ duration: 0.2, ease: [0.22, 0.9, 0.32, 1] }}
          />
        )}
      </NavLink>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 0.9, 0.32, 1] }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
            className="absolute left-0 top-full z-50 mt-1.5 min-w-[240px] rounded-xl border border-white/10
              bg-navy p-1.5 shadow-2xl shadow-black/40"
          >
            {section.children.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === section.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber
                  ${isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">
        <NavLink to="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <span className="font-display text-lg font-bold text-white">SETRAM</span>
          <span className="font-data hidden border-l border-white/15 pl-3 text-[9px] uppercase leading-tight tracking-wide text-white/50 sm:block">
            Plateforme<br />Maintenance
          </span>
        </NavLink>
        <nav className="flex items-center gap-1" aria-label="Sections principales">
          {SECTIONS.map((section) => (
            <NavItem key={section.to} section={section} />
          ))}
        </nav>
      </div>
    </header>
  );
}
