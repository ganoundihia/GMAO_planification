export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

/**
 * Presentational-only table shell. For tables with 100+ rows, wrap `rows`
 * with react-window (FixedSizeList) at the call site rather than rendering
 * every <tr> — see ui-ux-pro-max guidance in the Phase 1 plan.
 */
export default function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  emptyLabel = 'Aucune donnée',
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-paper">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`font-data px-4 py-3 text-[11px] font-semibold uppercase tracking-wide
                  text-ink-muted ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-ink ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
