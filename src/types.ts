export type TxType = 'income' | 'investment' | 'fixed' | 'variable' | 'additional';

export const TX_TYPES: TxType[] = ['income', 'investment', 'fixed', 'variable', 'additional'];

export const TYPE_LABELS: Record<TxType, string> = {
  income: 'Receitas',
  investment: 'Investimentos',
  fixed: 'Despesas fixas',
  variable: 'Despesas variáveis',
  additional: 'Despesas adicionais',
};

export interface CellRef {
  sheet: string;
  cell: string; // A1 address, e.g. "E24"
}

export interface Transaction {
  id: string;
  year: number;
  month: number; // 1-12
  date?: string; // ISO yyyy-mm-dd
  description: string;
  amount: number;
  type: TxType;
  category: string;
  categorySource: 'auto' | 'manual';
  tags: string[];
  paid: boolean;
  subgroup?: string; // fill colour (ARGB) of a highlighted block, e.g. "FFFFF2CC"
  source?: CellRef; // where it came from / goes back to on export
  /** Raw comment header kept for round-trip ("Author    (2025-11-02 11:34:53)"). */
  noteHeader?: string;
  /** Soft delete: kept so export can clear the source cell. */
  deleted?: boolean;
}

export interface CategoryRule {
  id: string;
  keyword: string; // matched case/accent-insensitively
  category: string;
  tags?: string[];
  /** Exact label match (fixed-expense rows) instead of substring match. */
  exact?: boolean;
  priority: number; // higher wins
}

export interface Settings {
  id: 'settings';
  eurBrlRate: number;
  goalBRL: number;
  reserveEUR: number;
  patrimonyBR: number; // BRL
  patrimonyEU: number; // EUR
  savingsRateTarget: number; // 0-1
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  eurBrlRate: 6,
  goalBRL: 0,
  reserveEUR: 0,
  patrimonyBR: 0,
  patrimonyEU: 0,
  savingsRateTarget: 0.3,
};

export type WarningKind =
  | 'no-description'
  | 'text-number'
  | 'stray-value'
  | 'missing-section'
  | 'year'
  | 'config';

export interface ParseWarning {
  kind: WarningKind;
  cell?: string;
  message: string;
}

export interface SectionLayout {
  type: TxType;
  labelRow: number;
  firstRow: number;
  lastRow: number; // inclusive, row before Total
  totalRow?: number;
}

export interface ImportResult {
  year: number | null;
  yearSource: 'option' | 'A1' | 'filename' | null;
  sheetName: string;
  transactions: Transaction[];
  settings: Partial<Settings>;
  warnings: ParseWarning[];
  sections: SectionLayout[];
  /** Totals cached in the sheet's own Total rows, for the "differs from sheet" note. */
  sheetTotals: Partial<Record<TxType, number[]>>;
}
