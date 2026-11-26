"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookMarked, ClipboardCheck, ListChecks, PenLine, Plus, RotateCcw } from "lucide-react";
import { Marked } from "@/components/Marked";
import { Segmented } from "@/components/Segmented";
import type { HistoryItem } from "@/lib/library";
import { LEVELS, QUESTION_COUNTS, type LevelId, type Summary } from "@/lib/types";

export function SummaryView({
  summary,
  level,
  count,
  error,
  onLevel,
  onCount,
  onStart,
  onWrite,
  history,
  onOpenHistory,
  onNew,
}: {
  summary: Summary;
  level: LevelId;
  count: number;
  error: string | null;
  onLevel: (l: LevelId) => void;
  onCount: (n: number) => void;
  onStart: () => void;
  onWrite: () => void;
  history: HistoryItem[];
  onOpenHistory: (item: HistoryItem) => void;
  onNew: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPanelVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const levelInfo = LEVELS.find((l) => l.id === level)!;

  return (
    <div className="summary">
      <article className="reading">
        <button type="button" className="btn btn-ghost btn-sm back" onClick={onNew}>
          <RotateCcw size={15} strokeWidth={1.75} aria-hidden /> Novo material
        </button>
        <h1 className="summary-title" tabIndex={-1} data-focus>
          {summary.title}
        </h1>
        <p className="lead">
          <Marked text={summary.tldr} />
        </p>

        {summary.keyPoints.length > 0 && (
          <section className="block" style={{ "--s": 1 } as React.CSSProperties}>
            <h2 className="block-title">
              <ListChecks size={18} strokeWidth={1.75} aria-hidden /> O que você precisa saber
            </h2>
            <ul className="points">
              {summary.keyPoints.map((p, i) => (
                <li key={i}>
                  <Marked text={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary.sections.map((s, i) => (
          <section className="block" key={s.heading} style={{ "--s": Math.min(i + 2, 6) } as React.CSSProperties}>
            <h2 className="block-title">{s.heading}</h2>
            <ul className="bullets">
              {s.bullets.map((b, j) => (
                <li key={j}>
                  <Marked text={b} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {history.some((h) => (h.kind === "quiz" ? h.questions : h.review)) && (
          <section className="block" style={{ "--s": 6 } as React.CSSProperties}>
            <h2 className="block-title">
              <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden /> Suas revisões
            </h2>
            <ul className="lib-list">
              {history.map((h, i) => {
                const saved = h.kind === "quiz" ? Boolean(h.questions) : Boolean(h.review);
                if (!saved) return null;
                return (
                  <li key={i} className="lib-item">
                    <button type="button" className="lib-open" onClick={() => onOpenHistory(h)}>
                      <span className="lib-title">
                        {h.kind === "quiz" ? `Prova · ${h.score}/${h.total} · ${LEVELS.find((l) => l.id === h.level)?.label}` : `Escrita · ${h.score}%`}
                      </span>
                      <span className="lib-meta">{new Date(h.at).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {summary.keyTerms.length > 0 && (
          <section className="block" style={{ "--s": 6 } as React.CSSProperties}>
            <h2 className="block-title">
              <BookMarked size={18} strokeWidth={1.75} aria-hidden /> Termos-chave
            </h2>
            <dl className="terms">
              {summary.keyTerms.map((t) => (
                <div key={t.term} className="term">
                  <dt>{t.term}</dt>
                  <dd>{t.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </article>

      <aside className="panel card" ref={panelRef} aria-labelledby="quiz-setup-title">
        <h2 id="quiz-setup-title" className="panel-title">
          Monte sua prova
        </h2>

        <div className="panel-group">
          <span className="panel-label">Dificuldade</span>
          <Segmented label="Dificuldade" value={level} onChange={onLevel} options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
          <p className="panel-hint">{levelInfo.hint}</p>
        </div>

        <div className="panel-group">
          <span className="panel-label">Questões</span>
          <Segmented
            label="Número de questões"
            value={count}
            onChange={onCount}
            options={QUESTION_COUNTS.map((n) => ({ value: n, label: String(n) }))}
          />
        </div>

        {error && (
          <p className="msg" data-kind="error" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
          Começar prova <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
        </button>

        <div className="panel-or" aria-hidden>
          <span>ou</span>
        </div>
        <button type="button" className="btn btn-soft btn-lg" onClick={onWrite}>
          <PenLine size={18} strokeWidth={1.75} aria-hidden /> Escrever de memória
        </button>
      </aside>

      <button
        type="button"
        className="fab btn btn-primary"
        data-hidden={panelVisible}
        tabIndex={panelVisible ? -1 : 0}
        onClick={() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
      >
        <Plus size={18} strokeWidth={1.75} aria-hidden /> Fazer prova
      </button>
    </div>
  );
}
