"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Highlighter } from "lucide-react";
import { Loading } from "@/components/Loading";
import { QuizRunner } from "@/components/QuizRunner";
import { Results } from "@/components/Results";
import { Library } from "@/components/Library";
import { ReviewView } from "@/components/ReviewView";
import { WriteMode } from "@/components/WriteMode";
import { SummaryView } from "@/components/SummaryView";
import { Uploader } from "@/components/Uploader";
import { combine, imageCount, newItem, processFile, type MaterialItem } from "@/lib/extract";
import { addHistory, entrySourceText, removeEntry, saveEntry, useLibrary } from "@/lib/library";
import { LIMITS, type LevelId, type Question, type SourceImage, type Review, type Summary } from "@/lib/types";

type Stage = "upload" | "summarizing" | "summary" | "generating" | "quiz" | "results" | "write" | "reviewing" | "review";

interface Source {
  text: string;
  images: SourceImage[];
  focus: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleQuestion(q: Question): Question {
  const order = shuffle([0, 1, 2, 3]);
  return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Sem conexão. Verifique a internet e tente de novo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Algo deu errado. Tente de novo.");
  return data as T;
}

export function StudyApp() {
  const [stage, setStage] = useState<Stage>("upload");
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [focus, setFocus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [source, setSource] = useState<Source | null>(null);

  const [level, setLevel] = useState<LevelId>("medio");
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [quizKey, setQuizKey] = useState(0);
  const library = useLibrary();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [freeWrite, setFreeWrite] = useState(false);
  const [topic, setTopic] = useState("");
  const [refIds, setRefIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [loadingFrom, setLoadingFrom] = useState<"summary" | "results">("summary");

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const mainRef = useRef<HTMLElement>(null);

  // Ao trocar de tela: volta ao topo e leva o foco para o título (leitores de tela e teclado).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const el = mainRef.current?.querySelector<HTMLElement>("[data-focus]");
    el?.focus({ preventScroll: true });
  }, [stage, quizKey]);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    const accepted = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name) || f.type.startsWith("image/"));
    const rejected = files.length - accepted.length;
    let msg = rejected > 0 ? `${rejected} ${rejected === 1 ? "arquivo ignorado" : "arquivos ignorados"}: só aceito PDF e imagens.` : null;

    let used = imageCount(itemsRef.current);
    const toAdd: { file: File; item: MaterialItem }[] = [];
    for (const file of accepted) {
      const item = newItem(file);
      if (item.kind === "image") {
        if (used >= LIMITS.maxImages) {
          msg = `O limite é ${LIMITS.maxImages} imagens por vez. Remova alguma para adicionar mais.`;
          continue;
        }
        used++;
      }
      toAdd.push({ file, item });
    }
    setNotice(msg);
    if (!toAdd.length) return;

    setItems((prev) => [...prev, ...toAdd.map((t) => t.item)]);
    toAdd.forEach(async ({ file, item }) => {
      const done = await processFile(file, item);
      setItems((prev) => prev.map((p) => (p.id === item.id ? done : p)));
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
    setNotice(null);
  }, []);

  const summarize = async () => {
    const { text, images, truncated } = combine(items);
    if (!text.trim() && images.length === 0) {
      setError("Nenhum arquivo pronto ainda. Aguarde a leitura ou adicione outro.");
      return;
    }
    setError(null);
    setNotice(truncated ? "O material era muito longo; usei o começo dele." : null);
    setStage("summarizing");
    try {
      const { summary } = await postJson<{ summary: Summary }>("/api/summarize", { text, images, focus });
      setSummary(summary);
      setSource({ text, images, focus });
      setCurrentId(saveEntry({ title: summary.title, summary, text, focus }));
      setAsked([]);
      setStage("summary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
      setStage("upload");
    }
  };

  const startQuiz = async (lvl: LevelId, from: "summary" | "results", fresh = true) => {
    if (!summary || !source) return;
    setLevel(lvl);
    setError(null);
    setLoadingFrom(from);
    setStage("generating");
    try {
      const { questions: qs } = await postJson<{ questions: Question[] }>("/api/quiz", {
        summary,
        source,
        level: lvl,
        count,
        avoid: fresh ? asked : [],
      });
      const prepared = qs.map(shuffleQuestion);
      setQuestions(prepared);
      setAnswers([]);
      setAsked((prev) => [...prev, ...prepared.map((q) => q.question)]);
      setQuizKey((k) => k + 1);
      setStage("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
      setStage(from);
    }
  };

  const openEntry = (id: string) => {
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    setSummary(entry.summary);
    setSource({ text: entrySourceText(entry), images: [], focus: entry.focus ?? "" });
    setCurrentId(entry.id);
    setAsked([]);
    setQuestions([]);
    setAnswers([]);
    setError(null);
    setStage("summary");
  };

  const startWrite = (free: boolean) => {
    setFreeWrite(free);
    setDraft("");
    setError(null);
    if (free) {
      setTopic("");
      setRefIds([]);
    }
    setStage("write");
  };

  const submitWriting = async () => {
    if (!freeWrite && (!summary || !source)) return;
    setError(null);
    setStage("reviewing");
    try {
      const payload = freeWrite
        ? {
            writing: draft,
            topic,
            references: library
              .filter((e) => refIds.includes(e.id))
              .map((e) => ({ title: e.title, text: entrySourceText(e) })),
          }
        : { summary, source, writing: draft };
      const { review } = await postJson<{ review: Review }>("/api/review", payload);
      if (!freeWrite) addHistory(currentId, { kind: "write", score: review.score, at: Date.now() });
      setReview(review);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
      setStage("write");
    }
  };

  const retryWrong = () => {
    const wrong = questions.filter((q, i) => answers[i] !== q.answerIndex).map(shuffleQuestion);
    if (!wrong.length) return;
    setQuestions(wrong);
    setAnswers([]);
    setQuizKey((k) => k + 1);
    setStage("quiz");
  };

  const reset = () => {
    items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    setItems([]);
    setFocus("");
    setSummary(null);
    setSource(null);
    setQuestions([]);
    setAnswers([]);
    setAsked([]);
    setDraft("");
    setReview(null);
    setCurrentId(null);
    setFreeWrite(false);
    setError(null);
    setNotice(null);
    setStage("upload");
  };

  return (
    <div className="app">
      <header className="top">
        <div className="shell top-inner">
          <button type="button" className="logo" onClick={stage === "upload" ? undefined : reset} aria-label="Study It">
            <span className="logo-mark" aria-hidden>
              <Highlighter size={17} strokeWidth={1.75} />
            </span>
            <span className="logo-word">Study It</span>
          </button>
        </div>
      </header>

      <main className="shell main" ref={mainRef} data-stage={stage}>
        <div className="stage" key={`${stage}-${quizKey}`}>
          {stage === "upload" && (
            <Uploader
              items={items}
              focus={focus}
              notice={notice}
              error={error}
              onFocusChange={setFocus}
              onFiles={addFiles}
              onRemove={removeItem}
              onSubmit={summarize}
            />
          )}

          {stage === "upload" && (
            <Library entries={library} onOpen={openEntry} onDelete={removeEntry} onWriteFree={() => startWrite(true)} />
          )}

          {stage === "summarizing" && (
            <Loading
              title="Lendo o material"
              steps={["Abrindo os arquivos…", "Separando o que importa…", "Marcando os termos-chave…", "Quase lá, montando o resumo…"]}
            />
          )}

          {stage === "summary" && summary && (
            <SummaryView
              summary={summary}
              level={level}
              count={count}
              error={error}
              onLevel={setLevel}
              onCount={setCount}
              onStart={() => startQuiz(level, "summary")}
              onWrite={() => {
                setError(null);
                setStage("write");
              }}
              onNew={reset}
            />
          )}

          {stage === "generating" && (
            <Loading
              title={`Montando ${count} questões`}
              steps={["Escolhendo o que cobrar…", "Escrevendo as alternativas…", "Misturando as pegadinhas…", "Conferindo o gabarito…"]}
            />
          )}

          {stage === "quiz" && (
            <QuizRunner
              key={quizKey}
              questions={questions}
              level={level}
              onFinish={(a) => {
                setAnswers(a);
                addHistory(currentId, {
                  kind: "quiz",
                  level,
                  score: questions.filter((q, i) => a[i] === q.answerIndex).length,
                  total: questions.length,
                  at: Date.now(),
                });
                setStage("results");
              }}
              onExit={() => setStage("summary")}
            />
          )}

          {stage === "write" && (freeWrite || summary) && (
            <WriteMode
              title={summary?.title ?? topic}
              free={freeWrite}
              topic={topic}
              library={library}
              refIds={refIds}
              value={draft}
              error={error}
              onTopic={setTopic}
              onToggleRef={(id) => setRefIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
              onChange={setDraft}
              onSubmit={submitWriting}
              onExit={() => (freeWrite ? reset() : setStage("summary"))}
            />
          )}

          {stage === "reviewing" && (
            <Loading
              title="Corrigindo seu texto"
              steps={["Lendo o que você escreveu…", "Comparando com o material…", "Separando acertos e lacunas…", "Montando o feedback…"]}
            />
          )}

          {stage === "review" && review && (
            <ReviewView
              review={review}
              writing={draft}
              hasMaterial={!freeWrite}
              onRetry={() => {
                setDraft("");
                setStage("write");
              }}
              onSummary={() => setStage("summary")}
              onQuiz={() => setStage("summary")}
              onNew={reset}
            />
          )}

          {stage === "results" && (
            <Results
              questions={questions}
              answers={answers}
              level={level}
              error={loadingFrom === "results" ? error : null}
              onLevel={(l) => startQuiz(l, "results")}
              onRetryWrong={retryWrong}
              onWrite={() => startWrite(false)}
              onSummary={() => setStage("summary")}
              onNew={reset}
            />
          )}
        </div>
      </main>
    </div>
  );
}
