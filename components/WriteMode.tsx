"use client";

import { useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import type { LibraryEntry } from "@/lib/library";
import { LIMITS } from "@/lib/types";

export function WriteMode({
  title,
  free,
  topic,
  library,
  refIds,
  value,
  error,
  onTopic,
  onToggleRef,
  onChange,
  onSubmit,
  onExit,
}: {
  title: string;
  free: boolean;
  topic: string;
  library: LibraryEntry[];
  refIds: string[];
  value: string;
  error: string | null;
  onTopic: (v: string) => void;
  onToggleRef: (id: string) => void;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const ready = value.trim().length >= LIMITS.minWriteChars && (!free || topic.trim().length >= 2);

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
          {free ? (
            <>Escolha um tema e explique com suas palavras. A IA mostra o que você cobriu, o que faltou e o que está errado.</>
          ) : (
            <>
              Sem olhar o resumo, explique <b>{title}</b> com suas palavras. Pode ser incompleto: a IA mostra o que você cobriu, o que
              faltou e o que está errado.
            </>
          )}
        </p>
      </div>

      {free && (
        <div className="card write-setup">
          <div className="field">
            <label htmlFor="topic">Sobre qual tema você vai escrever?</label>
            <input
              id="topic"
              type="text"
              maxLength={120}
              value={topic}
              onChange={(e) => onTopic(e.target.value)}
              placeholder="Ex.: Revolução Francesa, mitose, juros compostos"
            />
          </div>
          {library.length > 0 ? (
            <fieldset className="refs">
              <legend>Comparar com minhas matérias (opcional)</legend>
              {library.map((m) => (
                <label key={m.id} className="ref" data-on={refIds.includes(m.id)}>
                  <input type="checkbox" checked={refIds.includes(m.id)} onChange={() => onToggleRef(m.id)} />
                  <span>{m.title}</span>
                </label>
              ))}
              <p className="fine refs-note">
                {refIds.length > 0
                  ? "A correção usa só as matérias marcadas."
                  : "Sem nenhuma marcada, a IA corrige pelo que ela sabe do tema e pode errar."}
              </p>
            </fieldset>
          ) : (
            <p className="fine refs-note">Sem matérias salvas ainda: a IA corrige pelo que ela sabe do tema e pode errar.</p>
          )}
        </div>
      )}

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
