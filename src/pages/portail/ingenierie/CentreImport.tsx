import { useEffect, useState, useCallback } from 'react';
import { UploadCloud, X } from 'lucide-react';
import {
  importSlotGet,
  importSlotAddFiles,
  importSlotRemoveFile,
  formatFileSize,
  type PackedFile,
} from '../../../lib/importHub';

interface SlotConfig {
  id: string;
  label: string;
  tag: string;
  hint: string;
  multi: boolean;
  accept: string;
}

interface SlotGroup {
  title: string;
  badge?: string;
  description: string;
  slots: SlotConfig[];
}

// Ported 1:1 from the legacy Centre d'Import (slot ids, accept types, and
// grouping are load-bearing — the other Ingénierie tools look up files by
// these exact slot ids via the shared import hub).
const GROUPS: SlotGroup[] = [
  {
    title: 'Maintenance Corrective',
    badge: 'fichier partagé',
    description:
      "Un seul import, utilisé automatiquement par Analyse MBF, Analyse RAM et Suivi des Performances. Déposez un fichier par site/unité (ALG, ORN, SBA, CST, STF, ORG, MGM…) — le nom du fichier doit contenir l'unité pour que les outils qui en ont besoin (Suivi des Performances) puissent l'identifier automatiquement.",
    slots: [
      {
        id: 'corrective',
        label: 'Exports GMAO — Corrective',
        tag: '.xlsx, plusieurs fichiers acceptés',
        hint: '.xlsx — plusieurs fichiers acceptés, un par site/unité',
        multi: true,
        accept: '.xlsx,.xls',
      },
    ],
  },
  {
    title: 'Maintenance Préventive',
    badge: 'fichier partagé',
    description:
      'Un seul import, utilisé automatiquement par Analyse MBF, Analyse RAM et Suivi des Performances. Mêmes règles que pour la Corrective : un fichier par site/unité, avec le nom de l\'unité dans le nom du fichier.',
    slots: [
      {
        id: 'preventif',
        label: 'Exports GMAO — Préventif',
        tag: '.xlsx, plusieurs fichiers acceptés',
        hint: '.xlsx — plusieurs fichiers acceptés, un par site/unité',
        multi: true,
        accept: '.xlsx,.xls',
      },
    ],
  },
  {
    title: 'Matériel Roulant (MR)',
    description:
      'Fichiers utilisés par l\'outil « Suivi des Performances » — page MR — Rames. Chargez les fichiers MR ALG, MR ORN, MR SBA, MR CST, MR STF, MR ORG, MR MGM.',
    slots: [
      {
        id: 'materiel-roulant',
        label: 'Exports GMAO — Matériel Roulant',
        tag: '.xlsx, plusieurs fichiers acceptés',
        hint: '.xlsx — plusieurs fichiers acceptés, un par rame/unité',
        multi: true,
        accept: '.xlsx,.xls,.csv,.xlsm',
      },
    ],
  },
  {
    title: 'Efficience RH',
    badge: 'fichiers dédiés',
    description:
      'Fichiers utilisés uniquement par l\'outil « Suivi des Performances » — page Efficience RH. Ce sont des exports distincts de la Corrective/Préventif ci-dessus : chargez un fichier par site/unité, avec le code de l\'unité (ALG, ORN, SBA, CST, STF, ORG, MGM) dans le nom du fichier.',
    slots: [
      {
        id: 'rh-corretif',
        label: 'Efficience RH — Correctif',
        tag: '.xlsx, plusieurs fichiers acceptés',
        hint: '.xlsx — un fichier par site/unité',
        multi: true,
        accept: '.xlsx,.xls',
      },
      {
        id: 'rh-preventif',
        label: 'Efficience RH — Préventif',
        tag: '.xlsx, plusieurs fichiers acceptés',
        hint: '.xlsx — un fichier par site/unité',
        multi: true,
        accept: '.xlsx,.xls',
      },
    ],
  },
  {
    title: 'Analyse RAM — document complémentaire',
    description: 'Fichier utilisé uniquement par l\'outil « Analyse RAM · Audit Maintenance GMAO ».',
    slots: [
      {
        id: 'ram-audit',
        label: "Document d'Audit RAM",
        tag: '.docx',
        hint: '.docx — un seul fichier',
        multi: false,
        accept: '.docx',
      },
    ],
  },
  {
    title: 'Analyse Rapport Journalier',
    description: 'Fichier utilisé par l\'outil « Analyseur RJE · Service Maintenance ».',
    slots: [
      {
        id: 'rje-pdf',
        label: 'Rapport Journalier',
        tag: '.pdf',
        hint: '.pdf — un seul fichier',
        multi: false,
        accept: 'application/pdf',
      },
    ],
  },
];

function ImportSlot({ config }: { config: SlotConfig }) {
  const [files, setFiles] = useState<PackedFile[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isOver, setIsOver] = useState(false);

  const refresh = useCallback(async () => {
    const record = await importSlotGet(config.id);
    setFiles(record?.files ?? []);
    setSavedAt(record?.savedAt ?? null);
  }, [config.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = async (list: FileList) => {
    await importSlotAddFiles(config.id, Array.from(list), config.multi);
    refresh();
  };

  const removeFile = async (index: number) => {
    await importSlotRemoveFile(config.id, index);
    refresh();
  };

  return (
    <div className="mb-4 flex flex-col gap-2.5 last:mb-0">
      <div className="text-[12.5px] font-semibold text-ink">
        {config.label} <span className="font-normal text-ink-muted">{config.tag}</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => document.getElementById(`file-${config.id}`)?.click()}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && document.getElementById(`file-${config.id}`)?.click()
        }
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer items-center gap-3.5 rounded-lg border-[1.5px] border-dashed p-4
          transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel
          ${isOver ? 'border-steel bg-steel/5' : 'border-line bg-paper/60 hover:border-steel/40'}`}
      >
        <UploadCloud className="shrink-0 text-steel" size={20} aria-hidden="true" />
        <div className="text-[12.5px]">
          <div className="font-semibold text-ink">
            {config.multi ? 'Glissez vos fichiers ici, ou cliquez pour parcourir' : 'Glissez le fichier ici, ou cliquez pour parcourir'}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted">{config.hint}</div>
        </div>
        <input
          id={`file-${config.id}`}
          type="file"
          multiple={config.multi}
          accept={config.accept}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-xs"
            >
              <span className="flex-1 truncate text-ink">{f.name}</span>
              <span className="text-ink-muted">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Retirer ${f.name}`}
                className="cursor-pointer rounded p-0.5 text-ink-muted hover:text-fault focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11.5px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${files.length ? 'bg-clear' : 'bg-line'}`} />
        {files.length ? (
          <span className="text-clear">
            {files.length} fichier{files.length > 1 ? 's' : ''} importé{files.length > 1 ? 's' : ''} ·{' '}
            {savedAt && new Date(savedAt).toLocaleString('fr-FR')}
          </span>
        ) : (
          <span className="italic text-ink-muted">Aucun fichier importé pour l'instant.</span>
        )}
      </div>
    </div>
  );
}

export default function CentreImport() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-20 pt-10">
      <p className="mb-8 text-[13px] leading-relaxed text-ink-muted">
        Déposez ici les fichiers utilisés par les outils du portail. Ils sont conservés{' '}
        <b className="text-ink">dans votre navigateur</b> (aucun envoi à un serveur) et rechargés
        automatiquement à l'ouverture de chaque outil — vous n'avez plus besoin de les réimporter à
        chaque fois. Revenez sur cette page quand vous devez remplacer un fichier par une version plus
        récente.
      </p>

      {GROUPS.map((group) => (
        <div key={group.title} className="mb-5 rounded-2xl border border-line bg-panel p-6">
          <h2 className="mb-1 text-sm font-bold text-ink">
            {group.title}
            {group.badge && <span className="ml-1.5 text-xs font-medium text-ink-muted">— {group.badge}</span>}
          </h2>
          <p className="mb-4 text-[12.5px] leading-relaxed text-ink-muted">{group.description}</p>
          {group.slots.map((slot) => (
            <ImportSlot key={slot.id} config={slot} />
          ))}
        </div>
      ))}
    </div>
  );
}
