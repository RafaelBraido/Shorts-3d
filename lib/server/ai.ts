import { getVercelOidcToken } from "@vercel/oidc";
import { LEVELS, LIMITS, type LevelId, type Question, type Review, type SourcePayload, type Summary } from "@/lib/types";

/** Modelo servido pelo Vercel AI Gateway (sem chave da Anthropic). */
export const MODEL = process.env.STUDY_IT_MODEL || "anthropic/claude-haiku-5-5";
const EFFORT = process.env.STUDY_IT_EFFORT || "medium";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

interface JsonTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function getAuthToken(): Promise<string> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    throw new UserFacingError(
      "A IA ainda não está autenticada. Na Vercel, abra o projeto, ative o AI Gateway e faça um novo deploy. Local: defina AI_GATEWAY_API_KEY.",
      500,
    );
  }
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

function sourceBlocks(src: SourcePayload): Part[] {
  const blocks: Part[] = [];
  if (src.text.trim()) {
    blocks.push({ type: "text", text: `<material_de_estudo>\n${src.text}\n</material_de_estudo>` });
  }
  src.images.forEach((img, i) => {
    blocks.push({ type: "text", text: `Imagem ${i + 1} do material:` });
    blocks.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
  });
  if (src.focus?.trim()) {
    blocks.push({ type: "text", text: `Foco pedido pelo estudante: ${src.focus.trim()}` });
  }
  return blocks;
}

/** Modo estrito de JSON Schema exige additionalProperties:false em todo objeto. */
function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) out[k] = strictify(v);
    if (out.type === "object") out.additionalProperties = false;
    return out;
  }
  return schema;
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1)) as T;
    throw new UserFacingError("A IA devolveu algo fora do formato. Tente de novo.", 502);
  }
}

async function callTool<T>(opts: { system: string; content: Part[]; tool: JsonTool; maxTokens: number }): Promise<T> {
  const token = await getAuthToken();
  const send = (withReasoning: boolean) =>
    fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.tool.name, strict: true, schema: strictify(opts.tool.input_schema) },
        },
        ...(withReasoning && EFFORT !== "none" ? { reasoning: { effort: EFFORT } } : {}),
      }),
    });

  let res: Response;
  try {
    res = await send(true);
    if (res.status === 400) res = await send(false); // se o parâmetro de raciocínio não for aceito, tenta sem
  } catch (err) {
    console.error(err);
    throw new UserFacingError("Não consegui falar com a IA agora. Tente de novo.", 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("AI Gateway error", res.status, detail.slice(0, 500));
    if (res.status === 401 || res.status === 403)
      throw new UserFacingError("O AI Gateway recusou a autenticação. Confirme que ele está ativo no projeto da Vercel.", 500);
    if (res.status === 402)
      throw new UserFacingError("Os créditos do AI Gateway acabaram. Adicione créditos no painel da Vercel.", 402);
    if (res.status === 404) throw new UserFacingError(`O modelo "${MODEL}" não foi encontrado. Ajuste STUDY_IT_MODEL.`, 500);
    if (res.status === 429) throw new UserFacingError("A IA está sobrecarregada agora. Tente de novo em instantes.", 429);
    throw new UserFacingError("Não consegui falar com a IA agora. Tente de novo.", 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new UserFacingError("A IA não devolveu uma resposta utilizável. Tente de novo.", 502);
  return parseJson<T>(text);
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

const SUMMARY_TOOL: JsonTool = {
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
    maxTokens: 8000,
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

const QUIZ_TOOL = (count: number): JsonTool => ({
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

  const content: Part[] = [
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
    maxTokens: Math.min(24000, 4000 + count * 600),
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

/* ---------- modo escrita ---------- */
const REVIEW_SYSTEM = `Você é o corretor do modo escrita do Study It. O estudante escreveu de memória o que lembra do material. Compare com o material e devolva um feedback honesto e útil.

Regras:
- Escreva no mesmo idioma do texto do estudante.
- Fale com o estudante em segunda pessoa ("você"), de forma direta e sem bajular.
- Não penalize palavras diferentes quando a ideia está certa. Avalie ideias, não redação.
- score (0 a 100): cobertura das ideias centrais do material (peso 60) e correção do que foi dito (peso 40). Texto curto que acerta pouco do material fica abaixo de 40; só passe de 90 se cobrir quase tudo sem erros.
- verdict: uma frase curta resumindo o desempenho.
- covered: ideias importantes que o estudante acertou (até 6).
- missing: ideias importantes do material que faltaram (até 6), em frases curtas e específicas.
- mistakes: coisas que o estudante disse e estão erradas ou imprecisas, com a correção segundo o material. Se não houver, devolva lista vazia. Nunca invente erro.
- tip: uma sugestão prática do que revisar primeiro.
- Use só o material como fonte da verdade.`;

const REVIEW_TOOL: JsonTool = {
  name: "submit_review",
  description: "Entrega o feedback da escrita do estudante.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", description: "0 a 100" },
      verdict: { type: "string" },
      covered: { type: "array", items: { type: "string" } },
      missing: { type: "array", items: { type: "string" } },
      mistakes: {
        type: "array",
        items: {
          type: "object",
          properties: { said: { type: "string" }, correction: { type: "string" } },
          required: ["said", "correction"],
        },
      },
      tip: { type: "string" },
    },
    required: ["score", "verdict", "covered", "missing", "mistakes", "tip"],
  },
};

export function validateWriting(text: unknown): string {
  const t = typeof text === "string" ? text.trim() : "";
  if (t.length < LIMITS.minWriteChars) {
    throw new UserFacingError("Escreva um pouco mais antes de enviar. Conte o que você lembra, mesmo que esteja incompleto.");
  }
  return t.slice(0, LIMITS.maxWriteChars);
}

export async function generateReview(args: { summary: Summary; source: SourcePayload; writing: string }): Promise<Review> {
  const { summary, source, writing } = args;
  const summaryText = [
    `# ${summary.title}`,
    summary.tldr,
    ...summary.keyPoints.map((p) => `- ${p}`),
    ...summary.sections.flatMap((s) => [`## ${s.heading}`, ...s.bullets.map((b) => `- ${b}`)]),
  ].join("\n");
  const raw = await callTool<{
    score?: number;
    verdict?: string;
    covered?: string[];
    missing?: string[];
    mistakes?: { said?: string; correction?: string }[];
    tip?: string;
  }>({
    system: REVIEW_SYSTEM,
    content: [
      { type: "text", text: `<resumo_de_referencia>\n${summaryText}\n</resumo_de_referencia>` },
      ...sourceBlocks(source),
      { type: "text", text: `<texto_do_estudante>\n${writing}\n</texto_do_estudante>\n\nCorrija chamando submit_review.` },
    ],
    tool: REVIEW_TOOL,
    maxTokens: 4096,
  });
  const clean = (a?: string[]) => (a ?? []).filter(Boolean).map((x) => x.trim());
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    verdict: (raw.verdict ?? "").trim(),
    covered: clean(raw.covered),
    missing: clean(raw.missing),
    mistakes: (raw.mistakes ?? []).filter((m) => m.said && m.correction).map((m) => ({ said: m.said!.trim(), correction: m.correction!.trim() })),
    tip: (raw.tip ?? "").trim(),
  };
}
