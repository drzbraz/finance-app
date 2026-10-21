import { useState } from 'react';
import { addRuleAndApply } from '../db/repo';
import { makeRule, suggestKeyword } from '../rules/engine';

interface Props {
  description: string;
  category: string;
  onClose: () => void;
}

/** Shown after a manual category change: offers to turn it into a rule and apply it retroactively. */
export default function RulePrompt({ description, category, onClose }: Props) {
  const [keyword, setKeyword] = useState(suggestKeyword(description));
  const [result, setResult] = useState<number | null>(null);

  const create = async () => {
    const changed = await addRuleAndApply(makeRule(keyword, category));
    setResult(changed);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed bottom-4 right-4 z-20 w-80 rounded-xl border border-emerald-300 bg-white p-4 shadow-lg">
      {result === null ? (
        <>
          <p className="text-sm">
            Criar regra: descrições com a palavra ao lado → <b>{category}</b>?
          </p>
          <input className="input mt-2 w-full" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Termine com * para casar o começo da palavra (ex.: jant*).</p>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn" onClick={onClose}>Não</button>
            <button className="btn-primary" disabled={!keyword.trim()} onClick={create}>
              Criar regra para “{keyword}”
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm">Regra criada. {result} lançamento(s) recategorizado(s).</p>
      )}
    </div>
  );
}
