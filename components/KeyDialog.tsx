"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, KeyRound, X } from "lucide-react";
import { setUserKey, useUserKey } from "@/lib/userkey";

export function KeyButton() {
  const saved = useUserKey();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const valid = /^[\w-]{20,120}$/.test(value.trim());

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm key-btn" onClick={() => setOpen(true)} data-on={Boolean(saved)}>
        <KeyRound size={16} strokeWidth={1.75} aria-hidden />
        <span>{saved ? "Chave própria ativa" : "Chave"}</span>
      </button>

      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby="key-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id="key-title">Use a sua chave grátis</h2>
            <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <p>
            O Study It usa uma cota de IA grátis que todo mundo divide, e ela acaba durante o dia. Com a sua própria chave do Gemini
            (também grátis), o uso sai da <b>sua</b> cota e não falta.
          </p>

          <ol className="key-steps">
            <li>
              Abra{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
              </a>{" "}
              e entre com a sua conta Google.
            </li>
            <li>Clique em <b>Create API key</b> e copie a chave.</li>
            <li>Cole aqui embaixo e salve.</li>
          </ol>

          <div className="field">
            <label htmlFor="user-key">Sua chave do Gemini</label>
            <input
              id="user-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={saved ? "Chave salva (cole outra para trocar)" : "AIza…"}
            />
          </div>

          <p className="fine key-note">
            A chave fica só neste navegador. Ela passa pelo nosso servidor apenas para pedir a resposta ao Google, e não é guardada.
          </p>

          <div className="dialog-actions">
            {saved && (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => {
                  setUserKey("");
                  setValue("");
                  setOpen(false);
                }}
              >
                Remover chave
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!valid}
              onClick={() => {
                setUserKey(value.trim());
                setValue("");
                setOpen(false);
              }}
            >
              Salvar chave
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
