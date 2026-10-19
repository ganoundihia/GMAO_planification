import { motion } from 'framer-motion';
import { UploadCloud, TrendingUp, ShieldCheck, FileClock, Gauge } from 'lucide-react';
import SectionHeader from '../../../components/ui/SectionHeader';
import { ModuleCard } from '../../../components/ui/card-21';

const stagger = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 0.9, 0.32, 1] as [number, number, number, number] } },
};

// HSL equivalents of the site's design tokens (steel / copper / clear /
// amber / steel-dark), cycled per card so the grid isn't monochrome.
const TOOLS = [
  {
    to: '/ingenierie/import',
    icon: UploadCloud,
    title: "Centre d'Import",
    tag: 'Import centralisé',
    description: 'Importez vos fichiers une seule fois — chaque outil les récupère automatiquement.',
    themeColor: '205 42% 35%', // steel
  },
  {
    to: '/ingenierie/mbf',
    icon: TrendingUp,
    title: 'Analyse MBF',
    tag: 'Interface classique',
    description: 'Analyse Pareto, MTBF, AMDEC des indicateurs de maintenance.',
    themeColor: '26 60% 44%', // copper
  },
  {
    to: '/ingenierie/ram',
    icon: ShieldCheck,
    title: 'Analyse RAM',
    tag: 'Interface classique',
    description: 'Audit maintenance GMAO — fiabilité, disponibilité, maintenabilité.',
    themeColor: '157 67% 37%', // clear/green
  },
  {
    to: '/ingenierie/rapport-journalier',
    icon: FileClock,
    title: 'Rapport Journalier',
    tag: 'Interface classique',
    description: 'Analyseur RJE pour le service maintenance.',
    themeColor: '43 86% 55%', // amber
  },
  {
    to: '/ingenierie/performances',
    icon: Gauge,
    title: 'Suivi des Performances',
    tag: 'Interface classique',
    description: 'Indicateurs GMAO — préventif, correctif, efficience RH, matériel roulant.',
    themeColor: '205 54% 30%', // steel-dark
  },
];

export default function IngenierieHome() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeader
        eyebrow="Direction de l'ingénierie de la maintenance"
        title="Ingénierie"
        description="Analyse Pareto, MTBF, AMDEC, audit RAM et rapport journalier — suivi des indicateurs GMAO du matériel roulant."
      />
      <motion.div
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="shown"
        variants={stagger}
      >
        {TOOLS.map((tool) => (
          <motion.div key={tool.to} variants={fadeUp}>
            <ModuleCard
              icon={tool.icon}
              title={tool.title}
              tag={tool.tag}
              description={tool.description}
              href={tool.to}
              themeColor={tool.themeColor}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
