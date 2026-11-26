import Anthropic from "@anthropic-ai/sdk";
import { LEVELS, LIMITS, type LevelId, type Question, type SourcePayload, type Summary } from "@/lib/types";

export const MODEL = process.env.STUDY_IT_MODEL || "claude-sonnet-5-5";

export class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserFacingError(
      "A chave ANTHROPIC_API_KEY não está configurada no servidor. Adicione-a nas variáveis de ambiente da Vercel e faça um novo deploy.",
      500,
    );
  }
  client ??= new Anthropic();
  return client;
}

/* ---------- limite simples por IP (melhor esforço, em memória) ---------- */
const hits = new Map<string, number[]>();
export function rateLimit(ip: string, max = 30, windowMs = 10 * 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    throw new UserFacingError("Muitas requisições em pouco tempo. Espere alguns minutos e tente de novo.", 429);
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
}

/* ---------- entrada ---------- */
export function validateSource(src: unknown): SourcePayload {
  const s = src as Partial<SourcePayload> | null;
  if (!s || typeof s !== "object") throw new UserFacingError("Material inválido.");
  const text = typeof s.text === "string" ? s.text.slice(0, LIMITS.maxTextChars) : "";
  const images = Array.isArray(s.images) ? s.images.slice(0, LIMITS.maxImages) : [];
  for (const img of images) {
    if (!img || img.mediaType !== "image/jpeg" || typeof img.data !== "string" || img.data.length > LIMITS.maxImageBase64 * 1.5) {
      throw new UserFacingError("Uma das imagens é inválida ou grande demais.");
    }
  }
  if (text.trim().length < 20 && images.length === 0) {
    throw new UserFacingError("Não encontrei conteúdo para estudar. Envie um PDF com texto ou prints legíveis.");
  }
  const focus = typeof s.focus === "string" ? s.focus.slice(0, 300) : undefined;
  return { text, images, focus };
}

function sourceBlocks(src: SourcePayload): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (src.text.trim()) {
    blocks.push({ type: "text", text: `<material_de_estudo>\n${src.text}\n</material_de_estudo>` });
  }
  src.images.forEach((img, i) => {
    blocks.push({ type: "text", text: `Imagem ${i + 1} do material:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  });
  if (src.focus?.trim()) {
    blocks.push({ type: "text", text: `Foco pedido pelo estudante: ${src.focus.trim()}` });
  }
  return blocks;
}

async function callTool<T>(opts: {
  system: string;
  content: Anthropic.Messages.ContentBlockParam[];
  tool: Anthropic.Messages.Tool;
  maxTokens: number;
}): Promise<T> {
  const anthropic = getClient();
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [{ role: "user", content: opts.content }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new UserFacingError("A IA não devolveu uma resposta utilizável. Tente de novo.", 502);
    return block.input as T;
  } catch (err) {
    if (err instanceof UserFacingError) throw err;
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      if (err.status === 401) throw new UserFacingError("A chave da API da Anthropic é inválida.", 500);
      if (err.status === 429) throw new UserFacingError("A IA está sobrecarregada agora. Tente de novo em instantes.", 429);
      if (err.status === 404) throw new UserFacingError(`O modelo "${MODEL}" não foi encontrado. Ajuste STUDY_IT_MODEL.`, 500);
      throw new UserFacingError("Não consegui falar com a IA agora. Tente de novo.", 502);
    }
    console.error(err);
    throw new UserFacingError("Algo deu errado ao gerar o conteúdo. Tente de novo.", 500);
  }
}

/* ---------- resumo ---------- */
const SUMMARY_SYSTEM = `Você é o motor de resumos do Study It, um app de estudo.
Receba o material (texto extraído de PDFs e/ou imagens de prints) e produza um resumo que faça o estudante aprender rápido.

Regras:
- Escreva no mesmo idioma do material. Se não estiver claro, use português do Brasil.
- Use só o que está no material. Não invente fatos. Se algo estiver ilegível, ignore.
- Seja denso e claro: frases curtas, sem enrolação, sem introduções do tipo "Este documento fala sobre".
- Nos textos (tldr, pontos, bullets) marque com ==dois sinais de igual== os 1 a 3 termos ou ideias mais importantes de cada item, como um marca-texto. Não marque mais que isso.
- key_points: de 5 a 8 ideias centrais, cada uma em uma frase.
- sections: de 2 a 6 seções na ordem lógica do material, cada uma com 2 a 5 bullets.
- key_terms: de 4 a 12 termos que o estudante precisa saber, com definição curta.
- Se o estudante pediu um foco, priorize esse foco sem ignorar o resto.`;

const SUMMARY_TOOL: Anthropic.Messages.Tool = {
  name: "submit_summary",
  description: "Entrega o resumo final do material.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título curto do assunto (até 70 caracteres)." },
      tldr: { type: "string", description: "Resumo em 2 a 3 frases." },
      key_points: { type: "array", items: { type: "string" } },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: { heading: { type: "string" }, bullets: { type: "array", items: { type: "string" } } },
          required: ["heading", "bullets"],
        },
      },
      key_terms: {
        type: "array",
        items: {
          type: "object",
          properties: { term: { type: "string" }, definition: { type: "string" } },
          required: ["term", "definition"],
        },
      },
    },
    required: ["title", "tldr", "key_points", "sections", "key_terms"],
  },
};

interface RawSummary {
  title?: string;
  tldr?: string;
  key_points?: string[];
  sections?: { heading?: string; bullets?: string[] }[];
  key_terms?: { term?: string; definition?: string }[];
}

export async function generateSummary(src: SourcePayload): Promise<Summary> {
  const raw = await callTool<RawSummary>({
    system: SUMMARY_SYSTEM,
    content: [...sourceBlocks(src), { type: "text", text: "Gere o resumo chamando a ferramenta submit_summary." }],
    tool: SUMMARY_TOOL,
    maxTokens: 4096,
  });
  const summary: Summary = {
    title: (raw.title ?? "Resumo").trim(),
    tldr: (raw.tldr ?? "").trim(),
    keyPoints: (raw.key_points ?? []).filter(Boolean),
    sections: (raw.sections ?? [])
      .filter((s) => s.heading && s.bullets?.length)
      .map((s) => ({ heading: s.heading!.trim(), bullets: s.bullets!.filter(Boolean) })),
    keyTerms: (raw.key_terms ?? [])
      .filter((t) => t.term && t.definition)
      .map((t) => ({ term: t.term!.trim(), definition: t.definition!.trim() })),
  };
  if (!summary.tldr && summary.keyPoints.length === 0) {
    throw new UserFacingError("Não consegui extrair um resumo desse material. Tente com outro arquivo.", 502);
  }
  return summary;
}

/* ---------- prova ---------- */
const LEVEL_RUBRIC: Record<LevelId, string> = {
  facil:
    "FÁCIL: reconhecer e lembrar fatos, definições e nomes que aparecem diretamente no material. Enunciados curtos e diretos. Alternativas erradas claramente distintas da correta.",
  medio:
    "MÉDIO: compreender e aplicar. Peça explicar relações, causas, diferenças e exemplos novos. Alternativas erradas plausíveis, que exigem ter entendido (não só decorado).",
  dificil:
    "DIFÍCIL: analisar, comparar e inferir. Enunciados com situação-problema ou cenário. Alternativas muito próximas, em que a errada soa certa para quem estudou superficialmente. Cobrar exceções, condições e consequências.",
  desafio:
    "DESAFIO: nível de prova final de concorrência. Casos complexos que combinam vários conceitos do material, raciocínio em múltiplas etapas, inferências não ditas literalmente, pegadinhas de negação e de generalização indevida. Todas as alternativas parecem plausíveis; só uma resiste a uma análise cuidadosa.",
};

const QUIZ_TOOL = (count: number): Anthropic.Messages.Tool => ({
  name: "submit_quiz",
  description: "Entrega a prova final.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: `Exatamente ${count} questões.`,
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" }, description: "Exatamente 4 alternativas, sem letras na frente." },
            answer_index: { type: "integer", description: "Índice (0 a 3) da alternativa correta." },
            explanation: { type: "string", description: "Por que a correta está certa e, se útil, por que a mais tentadora está errada. 1 a 3 frases." },
            topic: { type: "string", description: "Tópico do material cobrado (2 a 4 palavras)." },
          },
          required: ["question", "options", "answer_index", "explanation", "topic"],
        },
      },
    },
    required: ["questions"],
  },
});

function quizSystem(level: LevelId, count: number) {
  const label = LEVELS.find((l) => l.id === level)!.label;
  return `Você é o gerador de provas do Study It. Monte uma prova de múltipla escolha com exatamente ${count} questões, nível ${label}.

Nível pedido — ${LEVEL_RUBRIC[level]}

Regras:
- Use só o conteúdo do material. Nada de fatos externos que o material não sustente.
- Escreva no mesmo idioma do material (se não estiver claro, português do Brasil).
- 4 alternativas por questão, só uma correta, com tamanho parecido. Evite "todas as anteriores" e "nenhuma das anteriores".
- Varie a posição da correta e varie o tipo de pergunta. Cubra o material inteiro, sem concentrar em um trecho.
- Cada questão deve fazer sentido sozinha, sem depender de outra e sem citar "o texto" ou "a imagem" como referência vaga.
- Não repita nem reformule as questões listadas em <ja_perguntadas>.
- Se o estudante pediu um foco, concentre a maioria das questões nele.`;
}

interface RawQuestion {
  question?: string;
  options?: string[];
  answer_index?: number;
  explanation?: string;
  topic?: string;
}

export async function generateQuiz(args: {
  summary: Summary;
  source: SourcePayload;
  level: LevelId;
  count: number;
  avoid: string[];
}): Promise<Question[]> {
  const { summary, source, level, count, avoid } = args;
  const summaryText = [
    `# ${summary.title}`,
    summary.tldr,
    ...summary.keyPoints.map((p) => `- ${p}`),
    ...summary.sections.flatMap((s) => [`## ${s.heading}`, ...s.bullets.map((b) => `- ${b}`)]),
    ...summary.keyTerms.map((t) => `${t.term}: ${t.definition}`),
  ].join("\n");

  const content: Anthropic.Messages.ContentBlockParam[] = [
    { type: "text", text: `<resumo_ja_feito>\n${summaryText}\n</resumo_ja_feito>` },
    ...sourceBlocks(source),
  ];
  if (avoid.length) {
    content.push({ type: "text", text: `<ja_perguntadas>\n${avoid.slice(-60).map((q) => `- ${q}`).join("\n")}\n</ja_perguntadas>` });
  }
  content.push({ type: "text", text: `Gere a prova de ${count} questões chamando submit_quiz.` });

  const raw = await callTool<{ questions?: RawQuestion[] }>({
    system: quizSystem(level, count),
    content,
    tool: QUIZ_TOOL(count),
    maxTokens: Math.min(16000, 1200 + count * 450),
  });

  const questions: Question[] = (raw.questions ?? [])
    .filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every(Boolean) &&
        Number.isInteger(q.answer_index) &&
        q.answer_index! >= 0 &&
        q.answer_index! < 4,
    )
    .map((q) => ({
      question: q.question!.trim(),
      options: q.options!.map((o) => String(o).trim()),
      answerIndex: q.answer_index!,
      explanation: (q.explanation ?? "").trim(),
      topic: (q.topic ?? "").trim(),
    }))
    .slice(0, count);

  if (questions.length < Math.max(3, Math.floor(count / 2))) {
    throw new UserFacingError("A IA não conseguiu montar uma prova boa desta vez. Tente de novo.", 502);
  }
  return questions;
}
