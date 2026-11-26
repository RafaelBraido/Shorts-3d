"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, FileText, ImageIcon, LoaderCircle, Plus, X } from "lucide-react";
import { imageCount, type MaterialItem } from "@/lib/extract";
import { LIMITS } from "@/lib/types";

export function Uploader({
  items,
  focus,
  notice,
  error,
  onFocusChange,
  onFiles,
  onRemove,
  onSubmit,
}: {
  items: MaterialItem[];
  focus: string;
  notice: string | null;
  error: string | null;
  onFocusChange: (v: string) => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Colar prints com Ctrl/Cmd+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  const ready = items.some((i) => i.status === "ready");
  const reading = items.some((i) => i.status === "reading");
  const hasItems = items.length > 0;

  return (
    <div className="upload">
      <div className="hero">
        <h1 className="hero-title">
          Do PDF à prova <span className="swipe">em um minuto</span>
        </h1>
        <p className="hero-sub">
          Envie PDFs ou prints do conteúdo. O Study It resume e monta uma prova no nível que você escolher.
        </p>
      </div>

      <div className="card upload-card">
        <button
          type="button"
          className="drop"
          data-dragging={dragging}
          data-compact={hasItems}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <span className="drop-icon" aria-hidden>
            <Plus size={22} strokeWidth={1.75} />
          </span>
          <span className="drop-title">{hasItems ? "Adicionar mais arquivos" : "Solte PDFs ou prints aqui"}</span>
          <span className="drop-hint">
            {hasItems ? "PDF, PNG, JPG ou WebP" : "ou clique para escolher. Também dá para colar um print com Ctrl+V."}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        {hasItems && (
          <ul className="files" aria-label="Arquivos adicionados">
            {items.map((it) => (
              <li key={it.id} className="file" data-status={it.status}>
                <span className="file-thumb" aria-hidden>
                  {it.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.preview} alt="" />
                  ) : it.kind === "pdf" ? (
                    <FileText size={18} strokeWidth={1.75} />
                  ) : (
                    <ImageIcon size={18} strokeWidth={1.75} />
                  )}
                </span>
                <span className="file-meta">
                  <span className="file-name">{it.name}</span>
                  <span className="file-detail">
                    {it.status === "reading" && "Lendo…"}
                    {it.status === "ready" && it.detail}
                    {it.status === "error" && it.error}
                  </span>
                </span>
                {it.status === "reading" && <LoaderCircle className="spin" size={18} strokeWidth={1.75} aria-label="Lendo" />}
                {it.status === "error" && <AlertCircle size={18} strokeWidth={1.75} className="file-err" aria-hidden />}
                <button type="button" className="icon-btn" onClick={() => onRemove(it.id)} aria-label={`Remover ${it.name}`}>
                  <X size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasItems && (
          <div className="field">
            <label htmlFor="focus">Quer focar em algo? (opcional)</label>
            <input
              id="focus"
              type="text"
              maxLength={300}
              value={focus}
              onChange={(e) => onFocusChange(e.target.value)}
              placeholder="Ex.: só o capítulo 3, ou as fórmulas"
            />
          </div>
        )}

        {(notice || error) && (
          <p className="msg" data-kind={error ? "error" : "info"} role={error ? "alert" : "status"}>
            {error ?? notice}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-lg" disabled={!ready || reading} onClick={onSubmit}>
          {reading ? "Lendo arquivos…" : "Resumir material"}
          {!reading && <ArrowRight size={18} strokeWidth={1.75} aria-hidden />}
        </button>
        <p className="fine">
          Até {LIMITS.maxImages} imagens por vez{imageCount(items) > 0 ? ` (${imageCount(items)} em uso)` : ""}. Seus arquivos são lidos no
          navegador; só o conteúdo vai para a IA gerar o resumo.
        </p>
      </div>
    </div>
  );
}
