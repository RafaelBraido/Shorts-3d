"use client";

import { useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { LIMITS } from "@/lib/types";

export function WriteMode({
  title,
  value,
  error,
  onChange,
  onSubmit,
  onExit,
}: {
  title: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const ready = value.trim().length >= LIMITS.minWriteChars;

  return (
    <div className="write">
      <div className="quiz-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
          <X size={15} strokeWidth={1.75} aria-hidden /> Sair
        </button>
        <span className="chip">Modo escrita</span>
      </div>

      <div className="write-head">
        <h1 className="write-title" tabIndex={-1} data-focus>
          Escreva o que você lembra
        </h1>
        <p className="hero-sub">
          Sem olhar o resumo, explique <b>{title}</b> com suas palavras. Pode ser incompleto: a IA mostra o que você cobriu, o que
          faltou e o que está errado.
        </p>
      </div>

      <div className="card write-card">
        <label htmlFor="writing" className="sr-only">
          Seu resumo de memória
        </label>
        <textarea
          id="writing"
          ref={ref}
          value={value}
          maxLength={LIMITS.maxWriteChars}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) onSubmit();
          }}
          placeholder="Comece por onde você se lembra melhor…"
          rows={10}
          autoFocus
        />
        <div className="write-foot">
          <span className="fine tabular">{words} {words === 1 ? "palavra" : "palavras"}</span>
        </div>
        {error && (
          <p className="msg" data-kind="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-lg" disabled={!ready} onClick={onSubmit}>
          Corrigir meu texto <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {!ready && <p className="fine">Escreva pelo menos {LIMITS.minWriteChars} caracteres. Ctrl+Enter envia.</p>}
      </div>
    </div>
  );
}
