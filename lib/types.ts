export type LevelId = "facil" | "medio" | "dificil" | "desafio";

export interface LevelInfo {
  id: LevelId;
  label: string;
  hint: string;
}

export const LEVELS: LevelInfo[] = [
  { id: "facil", label: "Fácil", hint: "Lembrar fatos e definições do material." },
  { id: "medio", label: "Médio", hint: "Entender e aplicar as ideias em situações novas." },
  { id: "dificil", label: "Difícil", hint: "Analisar, comparar e inferir. Alternativas muito próximas." },
  { id: "desafio", label: "Desafio", hint: "Casos complexos, várias etapas de raciocínio, pegadinhas." },
];

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;

export interface SummarySection {
  heading: string;
  bullets: string[];
}

export interface Summary {
  title: string;
  tldr: string;
  keyPoints: string[];
  sections: SummarySection[];
  keyTerms: { term: string; definition: string }[];
}

export interface Question {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  topic: string;
}

export interface Review {
  score: number; // 0 a 100
  verdict: string;
  covered: string[];
  missing: string[];
  mistakes: { said: string; correction: string }[];
  tip: string;
}

export interface SourceImage {
  mediaType: "image/jpeg";
  data: string; // base64, sem prefixo
}

export interface SourcePayload {
  text: string;
  images: SourceImage[];
  focus?: string;
}

export const LIMITS = {
  maxImages: 10,
  maxTextChars: 150_000,
  maxImageBase64: 330_000,
  maxBodyBytes: 4_300_000,
  minWriteChars: 40,
  maxWriteChars: 6000,
} as const;
