/** Random id that also works outside secure contexts (crypto.randomUUID needs https/localhost). */
export function newId(prefix = 'tx'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 });

export const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
