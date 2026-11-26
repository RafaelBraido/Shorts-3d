"use client";

import { BookOpen, PenLine, Trash2 } from "lucide-react";
import { stripMarks } from "@/components/Marked";
import type { LibraryEntry } from "@/lib/library";
import { LEVELS } from "@/lib/types";

function when(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function bestQuiz(e: LibraryEntry) {
  const q = e.history.filter((h) => h.kind === "quiz");
  if (!q.length) return null;
  const best = q.reduce((a, b) => (b.kind === "quiz" && a.kind === "quiz" && b.score / b.total > a.score / a.total ? b : a));
  return best.kind === "quiz" ? `${best.score}/${best.total} · ${LEVELS.find((l) => l.id === best.level)?.label}` : null;
}

function lastWrite(e: LibraryEntry) {
  const w = e.history.find((h) => h.kind === "write");
  return w && w.kind === "write" ? `Escrita ${w.score}%` : null;
}

export function Library({
  entries,
  onOpen,
  onDelete,
  onWriteFree,
}: {
  entries: LibraryEntry[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onWriteFree: () => void;
}) {
  return (
    <div className="lib">
      <button type="button" className="card lib-free" onClick={onWriteFree}>
        <span className="lib-free-icon" aria-hidden>
          <PenLine size={20} strokeWidth={1.75} />
        </span>
        <span className="lib-free-text">
          <b>Escrever sem arquivo</b>
          <span>Escolha um tema, escreva o que lembra e receba a correção. Dá para comparar com suas matérias salvas.</span>
        </span>
      </button>

      {entries.length > 0 && (
        <section aria-labelledby="lib-title">
          <h2 id="lib-title" className="block-title">
            <BookOpen size={18} strokeWidth={1.75} aria-hidden /> Suas matérias
          </h2>
          <ul className="lib-list">
            {entries.map((e) => {
              const stats = [bestQuiz(e), lastWrite(e)].filter(Boolean);
              return (
                <li key={e.id} className="lib-item">
                  <button type="button" className="lib-open" onClick={() => onOpen(e.id)}>
                    <span className="lib-title">{e.title}</span>
                    <span className="lib-meta">
                      {when(e.updatedAt)}
                      {stats.length > 0 && ` · ${stats.join(" · ")}`}
                    </span>
                    <span className="lib-tldr">{stripMarks(e.summary.tldr)}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Apagar ${e.title}`}
                    onClick={() => {
                      if (window.confirm(`Apagar "${e.title}" da sua biblioteca?`)) onDelete(e.id);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="fine lib-note">Salvo só neste navegador. Se você limpar os dados do navegador, as matérias somem.</p>
        </section>
      )}
    </div>
  );
}
