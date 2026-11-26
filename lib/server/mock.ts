import { LEVELS, type LevelId, type Question, type Review, type Summary } from "@/lib/types";

/** Só para desenvolvimento local sem chave de API: STUDY_IT_MOCK=1 */
export const MOCK = process.env.STUDY_IT_MOCK === "1" && process.env.NODE_ENV !== "production";

export const mockSummary: Summary = {
  title: "Fotossíntese e respiração celular",
  tldr:
    "A ==fotossíntese== transforma luz, água e CO₂ em glicose e oxigênio nos cloroplastos. A ==respiração celular== faz o caminho inverso nas mitocôndrias, liberando ATP.",
  keyPoints: [
    "A fotossíntese acontece nos ==cloroplastos== e tem duas fases: clara e escura.",
    "A fase clara usa luz para produzir ==ATP e NADPH== na membrana dos tilacoides.",
    "O ==ciclo de Calvin== usa ATP e NADPH para fixar CO₂ em glicose.",
    "A respiração celular tem três etapas: ==glicólise==, ciclo de Krebs e cadeia transportadora de elétrons.",
    "A cadeia transportadora produz a maior parte do ATP, usando ==oxigênio== como aceptor final.",
  ],
  sections: [
    {
      heading: "Fotossíntese",
      bullets: [
        "Equação geral: 6 CO₂ + 6 H₂O + luz → C₆H₁₂O₆ + 6 O₂.",
        "A ==clorofila== absorve principalmente luz azul e vermelha.",
        "O oxigênio liberado vem da ==quebra da água== (fotólise).",
      ],
    },
    {
      heading: "Respiração celular",
      bullets: [
        "A glicólise ocorre no citoplasma e rende 2 ATP por glicose.",
        "O ciclo de Krebs acontece na ==matriz mitocondrial==.",
        "Sem oxigênio, a célula pode recorrer à ==fermentação==, com muito menos ATP.",
      ],
    },
  ],
  keyTerms: [
    { term: "ATP", definition: "Molécula que carrega energia pronta para uso na célula." },
    { term: "Tilacoide", definition: "Membrana interna do cloroplasto onde ocorre a fase clara." },
    { term: "Ciclo de Calvin", definition: "Conjunto de reações que fixa CO₂ e forma açúcar." },
    { term: "Fermentação", definition: "Via sem oxigênio que regenera NAD⁺ com baixo rendimento de ATP." },
  ],
};

export function mockQuiz(level: LevelId, count: number, seed: number): Question[] {
  const label = LEVELS.find((l) => l.id === level)!.label;
  const base: Question[] = [
    {
      question: "Onde ocorre a fase clara da fotossíntese?",
      options: ["Na matriz mitocondrial", "Na membrana dos tilacoides", "No citoplasma", "No núcleo"],
      answerIndex: 1,
      explanation: "A luz é captada pela clorofila nos tilacoides, dentro do cloroplasto.",
      topic: "Fase clara",
    },
    {
      question: "De onde vem o oxigênio liberado na fotossíntese?",
      options: ["Do CO₂", "Da glicose", "Da água", "Do ATP"],
      answerIndex: 2,
      explanation: "A fotólise quebra a molécula de água e libera O₂.",
      topic: "Fotólise",
    },
    {
      question: "Qual etapa da respiração celular produz a maior parte do ATP?",
      options: ["Glicólise", "Ciclo de Krebs", "Fermentação", "Cadeia transportadora de elétrons"],
      answerIndex: 3,
      explanation: "A cadeia transportadora usa o gradiente de prótons para sintetizar ATP em grande quantidade.",
      topic: "Respiração",
    },
    {
      question: "Qual é o papel do oxigênio na respiração celular?",
      options: ["Fornecer carbono", "Ser o aceptor final de elétrons", "Quebrar a glicose", "Ativar a clorofila"],
      answerIndex: 1,
      explanation: "Ao receber os elétrons no fim da cadeia, o O₂ forma água e mantém o fluxo funcionando.",
      topic: "Oxigênio",
    },
    {
      question: "O que o ciclo de Calvin faz?",
      options: ["Fixa CO₂ para formar açúcar", "Quebra a água", "Produz NADPH", "Libera oxigênio"],
      answerIndex: 0,
      explanation: "Ele usa ATP e NADPH da fase clara para transformar CO₂ em glicose.",
      topic: "Calvin",
    },
  ];
  return Array.from({ length: count }, (_, i) => {
    const q = base[(i + seed) % base.length];
    return { ...q, question: `[${label}] ${q.question}${i >= base.length ? ` (${i + 1})` : ""}` };
  });
}

export const mockReview: Review = {
  score: 68,
  verdict: "Você pegou a base da fotossíntese, mas deixou a respiração celular de fora.",
  covered: ["A fotossíntese acontece nos cloroplastos.", "Luz, água e CO₂ viram glicose e oxigênio."],
  missing: ["As duas fases: clara e ciclo de Calvin.", "A cadeia transportadora produz a maior parte do ATP.", "O papel do oxigênio como aceptor final."],
  mistakes: [{ said: "A respiração acontece nos cloroplastos.", correction: "Ela acontece nas mitocôndrias (a glicólise, no citoplasma)." }],
  tip: "Revise as etapas da respiração celular e onde cada uma ocorre.",
};
