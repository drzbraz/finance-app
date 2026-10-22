import { makeRule, suggestKeyword } from '@finance/shared';
import { useState } from 'react';
import { useToast } from './layout/Toast';
import { addRuleAndApply } from '../api/repo';

interface Props {
  description: string;
  category: string;
  onClose: () => void;
}

/** After a manual category change: offer a keyword rule, applied to matching entries right away. */
export default function RulePrompt({ description, category, onClose }: Props) {
  const [keyword, setKeyword] = useState(suggestKeyword(description));
  const toast = useToast();

  const create = async () => {
    const changed = await addRuleAndApply(makeRule(keyword, category));
    toast(`Regra criada: “${keyword}” → ${category}. ${changed} lançamento(s) recategorizado(s).`);
    onClose();
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 rounded-2xl border border-accent/40 bg-surface p-4 shadow-2xl sm:left-auto sm:w-96 lg:bottom-6">
      <p className="text-sm font-semibold">Sempre usar {category} para descrições com esta palavra?</p>
      <input className="input mt-2" value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="Palavra-chave" />
      <p className="mt-1 text-xs text-ink-3">Termine com * para casar o começo da palavra (ex.: jant*).</p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Agora não</button>
        <button className="btn-primary" disabled={!keyword.trim()} onClick={create}>Criar regra</button>
      </div>
    </div>
  );
}
