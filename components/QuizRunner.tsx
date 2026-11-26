"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { LEVELS, type LevelId, type Question } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

export function QuizRunner({
  questions,
  level,
  onFinish,
  onExit,
}: {
  questions: Question[];
  level: LevelId;
  onFinish: (answers: number[]) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);

  const q = questions[index];
  const answered = selected !== null;
  const last = index === questions.length - 1;
  const levelLabel = LEVELS.find((l) => l.id === level)!.label;

  const choose = useCallback(
    (i: number) => {
      if (selected !== null) return;
      setSelected(i);
    },
    [selected],
  );

  const next = useCallback(() => {
    if (selected === null) return;
    const all = [...answers, selected];
    if (last) {
      onFinish(all);
      return;
    }
    setAnswers(all);
    setSelected(null);
    setIndex((n) => n + 1);
  }, [selected, answers, last, onFinish]);

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const byLetter = ["a", "b", "c", "d"].indexOf(k);
      const byNumber = ["1", "2", "3", "4"].indexOf(k);
      const i = byLetter >= 0 ? byLetter : byNumber;
      if (i >= 0 && selected === null) {
        e.preventDefault();
        choose(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, selected]);

  const correct = answered && selected === q.answerIndex;

  return (
    <div className="quiz">
      <div className="quiz-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
          <X size={15} strokeWidth={1.75} aria-hidden /> Sair
        </button>
        <span className="chip">{levelLabel}</span>
        <span className="quiz-count" aria-live="polite">
          <b>{index + 1}</b> de {questions.length}
        </span>
      </div>

      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + (answered ? 1 : 0)}>
        {questions.map((_, i) => {
          const state =
            i < index ? (answers[i] === questions[i].answerIndex ? "right" : "wrong") : i === index ? (answered ? (correct ? "right" : "wrong") : "current") : "todo";
          return <span key={i} className="seg-bar" data-state={state} />;
        })}
      </div>

      <div className="q-card card" key={index}>
        {q.topic && <p className="q-topic">{q.topic}</p>}
        <h2 className="q-text" tabIndex={-1} data-focus>
          {q.question}
        </h2>

        <div className="options" role="group" aria-label="Alternativas">
          {q.options.map((opt, i) => {
            let state = "idle";
            if (answered) {
              if (i === q.answerIndex) state = "right";
              else if (i === selected) state = "wrong";
              else state = "dim";
            }
            return (
              <button
                key={i}
                type="button"
                className="option"
                data-state={state}
                aria-disabled={answered}
                onClick={() => choose(i)}
              >
                <span className="option-key" aria-hidden>
                  {state === "right" ? <Check size={15} strokeWidth={2.25} /> : state === "wrong" ? <X size={15} strokeWidth={2.25} /> : LETTERS[i]}
                </span>
                <span className="option-text">{opt}</span>
                {state === "right" && <span className="sr-only"> (correta)</span>}
                {state === "wrong" && <span className="sr-only"> (sua resposta, errada)</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="feedback" data-correct={correct} role="status">
            <p className="feedback-title">{correct ? "Acertou" : "Não foi dessa vez"}</p>
            {q.explanation && <p className="feedback-text">{q.explanation}</p>}
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={next}>
              {last ? "Ver resultado" : "Próxima"} <ArrowRight size={17} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </div>
      {!answered && <p className="fine kbd-hint">Atalhos: teclas A a D ou 1 a 4.</p>}
    </div>
  );
}
