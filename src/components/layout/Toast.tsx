import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  undo?: () => void;
}

/** Long enough to reach "Desfazer" comfortably. */
const TOAST_MS = 8000;

const ToastContext = createContext<(text: string, undo?: () => void) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/** Bottom toasts; an optional "Desfazer" runs the given undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const show = useCallback((text: string, undo?: () => void) => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-2), { id, text, undo }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-canvas shadow-lg">
            <span>{t.text}</span>
            {t.undo && (
              <button
                className="font-semibold text-accent"
                onClick={() => {
                  t.undo!();
                  dismiss(t.id);
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
