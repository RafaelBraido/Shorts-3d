"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CircleCheck, CircleDashed, Lightbulb } from "lucide-react";
import type { Review } from "@/lib/types";

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

export function ReviewView({
  review,
  writing,
  onRetry,
  onSummary,
  onQuiz,
  onNew,
}: {
  review: Review;
  writing: string;
  onRetry: () => void;
  onSummary: () => void;
  onQuiz: () => void;
  onNew: () => void;
}) {
  const shown = useCountUp(review.score);
  return (
    <div className="results">
      <div className="score card">
        <p className="score-label">Seu texto cobriu</p>
        <p className="score-num" tabIndex={-1} data-focus aria-label={`${review.score} de 100`}>
          <span className="score-big">{shown}</span>
          <span className="score-total">%</span>
        </p>
        <div className="meter" aria-hidden>
          <span style={{ width: `${review.score}%` }} />
        </div>
        {review.verdict && <p className="verdict">{review.verdict}</p>}
      </div>

      {review.covered.length > 0 && (
        <section className="fb card" data-kind="good">
          <h2 className="fb-title">
            <CircleCheck size={18} strokeWidth={1.75} aria-hidden /> O que você acertou
          </h2>
          <ul className="fb-list">
            {review.covered.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {review.missing.length > 0 && (
        <section className="fb card" data-kind="missing">
          <h2 className="fb-title">
            <CircleDashed size={18} strokeWidth={1.75} aria-hidden /> O que faltou
          </h2>
          <ul className="fb-list">
            {review.missing.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {review.mistakes.length > 0 && (
        <section className="fb card" data-kind="bad">
          <h2 className="fb-title">
            <AlertTriangle size={18} strokeWidth={1.75} aria-hidden /> O que está errado
          </h2>
          <ul className="fb-list">
            {review.mistakes.map((m, i) => (
              <li key={i}>
                <span className="fb-said">“{m.said}”</span>
                <span>{m.correction}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.tip && (
        <p className="tip">
          <Lightbulb size={18} strokeWidth={1.75} aria-hidden /> {review.tip}
        </p>
      )}

      <details className="rev mine">
        <summary>
          <span className="rev-q">Seu texto</span>
        </summary>
        <div className="rev-body mine-body">
          <p>{writing}</p>
        </div>
      </details>

      <div className="next card">
        <h2 className="panel-title">E agora?</h2>
        <div className="next-grid">
          <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>
            Escrever de novo
          </button>
          <button type="button" className="btn btn-soft btn-lg" onClick={onQuiz}>
            Fazer prova
          </button>
        </div>
        <div className="next-links">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSummary}>
            Ver o resumo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onNew}>
            Novo material
          </button>
        </div>
      </div>
    </div>
  );
}
