export type PageId = 'home' | 'transactions' | 'bills' | 'budgets' | 'goals' | 'compare' | 'settings';

export const PAGES: { id: PageId; label: string; icon: string; mobile: boolean }[] = [
  { id: 'home', label: 'Início', icon: '🏠', mobile: true },
  { id: 'transactions', label: 'Transações', icon: '🧾', mobile: true },
  { id: 'bills', label: 'Contas', icon: '🗓️', mobile: true },
  { id: 'budgets', label: 'Orçamentos', icon: '🎯', mobile: true },
  { id: 'goals', label: 'Metas', icon: '🏁', mobile: false },
  { id: 'compare', label: 'Comparar', icon: '📊', mobile: false },
  { id: 'settings', label: 'Configurações', icon: '⚙️', mobile: false },
];
