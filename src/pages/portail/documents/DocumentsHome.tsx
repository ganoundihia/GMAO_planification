import { motion } from 'framer-motion';
import { FileCheck2, FolderClock, GitPullRequestArrow } from 'lucide-react';
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

const CARDS = [
  {
    to: '/documents/validation',
    icon: FileCheck2,
    title: 'Validation des rapports',
    tag: 'Consolidation RAM',
    description: "Suivi de consolidation des rapports d'activité par unité opérationnelle.",
    themeColor: '205 42% 35%', // steel
  },
  {
    to: '/documents/registre',
    icon: FolderClock,
    title: 'Registre des documents',
    tag: 'Documents techniques',
    description: 'Versions, statuts de validité et échéances de révision des documents techniques.',
    themeColor: '26 60% 44%', // copper
  },
  {
    to: '/documents/modifications',
    icon: GitPullRequestArrow,
    title: 'Demandes de modification',
    tag: 'Maintenance préventive',
    description: 'Suivi des demandes de modification de la maintenance préventive.',
    themeColor: '157 67% 37%', // clear/green
  },
];

export default function DocumentsHome() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <SectionHeader
        eyebrow="Documents & validation"
        title="Documents"
        description="Validation des rapports d'activité, registre des documents techniques et suivi des demandes de modification."
      />
      <motion.div
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="shown"
        variants={stagger}
      >
        {CARDS.map((card) => (
          <motion.div key={card.to} variants={fadeUp}>
            <ModuleCard
              icon={card.icon}
              title={card.title}
              tag={card.tag}
              description={card.description}
              href={card.to}
              themeColor={card.themeColor}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
