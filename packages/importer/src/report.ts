export type ImportRowError = { row: number; message: string; data?: Record<string, string> };

export type ImportReport = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  errors: ImportRowError[];
};

export function emptyReport(): ImportReport {
  return { total: 0, created: 0, updated: 0, skipped: 0, errored: 0, errors: [] };
}
