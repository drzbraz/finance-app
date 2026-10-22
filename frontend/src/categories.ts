const ICONS: Record<string, string> = {
  Mercado: '🛒',
  Restaurante: '🍽️',
  Viagem: '✈️',
  Transporte: '🚇',
  Presentes: '🎁',
  Saúde: '🩺',
  Lazer: '🎉',
  Assinaturas: '📺',
  Casa: '🏠',
  Educação: '📚',
  Família: '👪',
  Compras: '🛍️',
  Receita: '💼',
  Investimento: '📈',
  Outros: '📌',
};

export function categoryIcon(category: string): string {
  return ICONS[category] ?? '🏷️';
}
