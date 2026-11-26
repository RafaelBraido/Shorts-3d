"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Flame, RotateCcw, Repeat, Feather } from "lucide-react";
import { LEVELS, type LevelId, type Question } from "@/lib/types";

function useCountUp(target: number, ms = 700) {
  const instant = () => typeof window === "undefined" || target === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [value, setValue] = useState(() => (instant() ? target : 0));
  useEffect(() => {
    if (instant()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return value;
}

export function Results({
  questions,
  answers,
  level,
  error,
  onLevel,
  onRetryWrong,
  onWrite,
  onSummary,
  onNew,
}: {
  questions: Question[];
  answers: number[];
  level: LevelId;
  error: string | null;
  onLevel: (l: LevelId) => void;
  onRetryWrong: () => void;
  onWrite: () => void;
  onSummary: () => void;
  onNew: () => void;
}) {
  const total = questions.length;
  const score = questions.filter((q, i) => answers[i] === q.answerIndex).length;
  const pct = Math.round((score / total) * 100);
  const shown = useCountUp(score);

  const idx = LEVELS.findIndex((l) => l.id === level);
  const harder = LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
  const easier = LEVELS[Math.max(idx - 1, 0)];
  const canHarder = idx < LEVELS.length - 1;
  const canEasier = idx > 0;
  const wrong = total - score;

  const primary: "harder" | "easier" | "same" = pct >= 80 ? "harder" : pct < 50 && canEasier ? "easier" : "same";

  const verdict =
    pct === 100
      ? "Gabaritou. Esse nível ficou pequeno para você."
      : pct >= 80
        ? "Muito bom. Dá para apertar mais."
        : pct >= 50
          ? "No caminho. Revise os erros e tente de novo."
          : "Esse nível pediu mais do que você sabe hoje. Releia o resumo ou desça um nível.";

  return (
    <div className="results">
      <div className="score card">
        <p className="score-label">Seu resultado</p>
        <p className="score-num" tabIndex={-1} data-focus aria-label={`${score} de ${total} questões certas`}>
          <span className="score-big">{shown}</span>
          <span className="score-total">/{total}</span>
        </p>
        <div className="progress progress-lg" aria-hidden>
          {questions.map((q, i) => (
            <span key={i} className="seg-bar" data-state={answers[i] === q.answerIndex ? "right" : "wrong"} style={{ "--k": i } as React.CSSProperties} />
          ))}
        </div>
        <p className="verdict">{verdict}</p>
      </div>

      <div className="next card">
        <h2 className="panel-title">E agora?</h2>
        <div className="next-grid">
          {canHarder && (
            <button type="button" className={`btn ${primary === "harder" ? "btn-primary" : "btn-soft"} btn-lg`} onClick={() => onLevel(harder.id)}>
              <Flame size={18} strokeWidth={1.75} aria-hidden /> Mais difícil
              <span className="btn-sub">{harder.label}</span>
            </button>
          )}
          {canEasier && (
            <button type="button" className={`btn ${primary === "easier" ? "btn-primary" : "btn-soft"} btn-lg`} onClick={() => onLevel(easier.id)}>
              <Feather size={18} strokeWidth={1.75} aria-hidden /> Mais fácil
              <span className="btn-sub">{easier.label}</span>
            </button>
          )}
          <button type="button" className={`btn ${primary === "same" ? "btn-primary" : "btn-soft"} btn-lg`} onClick={() => onLevel(level)}>
            <Repeat size={18} strokeWidth={1.75} aria-hidden /> Novas questões
            <span className="btn-sub">{LEVELS[idx].label}</span>
          </button>
          {wrong > 0 && (
            <button type="button" className="btn btn-soft btn-lg" onClick={onRetryWrong}>
              <RotateCcw size={18} strokeWidth={1.75} aria-hidden /> Refazer erradas
              <span className="btn-sub tabular">{wrong}</span>
            </button>
          )}
        </div>
        {error && (
          <p className="msg" data-kind="error" role="alert">
            {error}
          </p>
        )}
        <div className="next-links">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSummary}>
            Voltar ao resumo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onWrite}>
            Escrever de memória
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onNew}>
            Novo material
          </button>
        </div>
      </div>

      <section className="review" aria-labelledby="review-title">
        <h2 id="review-title" className="block-title">
          Revisão
        </h2>
        <ol className="review-list">
          {questions.map((q, i) => {
            const ok = answers[i] === q.answerIndex;
            return (
              <li key={i}>
                <details className="rev" data-ok={ok}>
                  <summary>
                    <span className="rev-dot" aria-hidden />
                    <span className="rev-q">{q.question}</span>
                    <span className="sr-only">{ok ? " Acertou." : " Errou."}</span>
                    <ChevronDown className="rev-chev" size={16} strokeWidth={1.75} aria-hidden />
                  </summary>
                  <div className="rev-body">
                    {!ok && (
                      <p>
                        <b>Você marcou:</b> {q.options[answers[i]]}
                      </p>
                    )}
                    <p>
                      <b>Correta:</b> {q.options[q.answerIndex]}
                    </p>
                    {q.explanation && <p className="rev-exp">{q.explanation}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
