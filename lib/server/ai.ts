import { LEVELS, LIMITS, type LevelId, type Question, type Review, type SourcePayload, type Summary } from "@/lib/types";

/** Gemini pela API gratuita do Google AI Studio (endpoint compatível com OpenAI). */
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
const API_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

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

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new UserFacingError(
      "A chave do Gemini não está configurada. Crie uma grátis em aistudio.google.com/apikey e adicione como GEMINI_API_KEY nas variáveis do projeto na Vercel.",
      500,
    );
  }
  return key;
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
  const key = getApiKey();
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];
  let lastStatus = 0;

  for (const model of models) {
    // 1ª tentativa com esquema JSON; se o modelo recusar (400), 2ª pedindo JSON no texto.
    for (const structured of [true, false]) {
      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens,
            messages: [
              {
                role: "system",
                content: structured
                  ? opts.system
                  : `${opts.system}\n\nResponda SOMENTE com um objeto JSON válido, sem texto fora dele, neste formato:\n${JSON.stringify(opts.tool.input_schema)}`,
              },
              { role: "user", content: opts.content },
            ],
            ...(structured
              ? { response_format: { type: "json_schema", json_schema: { name: opts.tool.name, strict: true, schema: opts.tool.input_schema } } }
              : {}),
          }),
        });
      } catch (err) {
        console.error(err);
        throw new UserFacingError("Não consegui falar com a IA agora. Tente de novo.", 502);
      }

      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new UserFacingError("A IA não devolveu uma resposta utilizável. Tente de novo.", 502);
        return parseJson<T>(text);
      }

      lastStatus = res.status;
      const detail = await res.text().catch(() => "");
      console.error("Gemini error", model, res.status, detail.slice(0, 400));
      if (res.status === 400 && structured) continue; // tenta sem esquema
      break; // outro erro: tenta o próximo modelo (ex.: 404, 429)
    }
  }

  if (lastStatus === 401 || lastStatus === 403)
    throw new UserFacingError("A chave do Gemini foi recusada. Confira o valor de GEMINI_API_KEY.", 500);
  if (lastStatus === 429)
    throw new UserFacingError("O limite grátis do Gemini acabou por agora (ele reinicia todo dia). Tente de novo mais tarde.", 429);
  throw new UserFacingError("Não consegui falar com a IA agora. Tente de novo.", 502);
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
    maxTokens: 12000,
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
    maxTokens: Math.min(30000, 6000 + count * 700),
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
function reviewSystem(hasMaterial: boolean) {
  return `Você é o corretor do modo escrita do Study It. O estudante escreveu de memória o que lembra sobre um assunto. Compare com a referência e devolva um feedback honesto e útil.

Regras:
- Escreva no mesmo idioma do texto do estudante.
- Fale com o estudante em segunda pessoa ("você"), de forma direta e sem bajular.
- Não penalize palavras diferentes quando a ideia está certa. Avalie ideias, não redação.
- score (0 a 100): cobertura das ideias centrais (peso 60) e correção do que foi dito (peso 40). Texto curto que acerta pouco fica abaixo de 40; só passe de 90 se cobrir quase tudo sem erros.
- verdict: uma frase curta resumindo o desempenho.
- covered: ideias importantes que o estudante acertou (até 6).
- missing: ideias importantes que faltaram (até 6), em frases curtas e específicas.
- mistakes: coisas ditas pelo estudante que estão erradas ou imprecisas, com a correção. Se não houver, lista vazia. Nunca invente erro.
- tip: uma sugestão prática do que revisar primeiro.
${
    hasMaterial
      ? "- Use só o material de referência como fonte da verdade."
      : "- Não há material de referência: avalie com seu conhecimento geral sobre o tema. Só aponte erro quando tiver certeza, e diga no verdict que a correção não vem de um material do estudante."
  }`;
}

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

export interface ReviewReference {
  title: string;
  text: string;
}

export function validateReferences(refs: unknown): ReviewReference[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .slice(0, 5)
    .filter((r) => r && typeof r.title === "string" && typeof r.text === "string" && r.text.trim())
    .map((r) => ({ title: r.title.slice(0, 120), text: r.text.slice(0, 20_000) }));
}

function flattenSummary(summary: Summary) {
  return [
    `# ${summary.title}`,
    summary.tldr,
    ...summary.keyPoints.map((p) => `- ${p}`),
    ...summary.sections.flatMap((s) => [`## ${s.heading}`, ...s.bullets.map((b) => `- ${b}`)]),
  ].join("\n");
}

export { flattenSummary };

export async function generateReview(args: {
  writing: string;
  topic?: string;
  summary?: Summary;
  source?: SourcePayload;
  references?: ReviewReference[];
}): Promise<Review> {
  const { writing, topic, summary, source, references = [] } = args;
  const content: Part[] = [];
  if (summary) content.push({ type: "text", text: `<resumo_de_referencia>\n${flattenSummary(summary)}\n</resumo_de_referencia>` });
  if (source) content.push(...sourceBlocks(source));
  for (const r of references) {
    content.push({ type: "text", text: `<material titulo="${r.title.replace(/"/g, "'")}">\n${r.text}\n</material>` });
  }
  if (topic) content.push({ type: "text", text: `Tema escolhido pelo estudante: ${topic}` });
  const hasMaterial = Boolean(summary || references.length);
  content.push({ type: "text", text: `<texto_do_estudante>\n${writing}\n</texto_do_estudante>\n\nCorrija gerando o JSON pedido.` });

  const raw = await callTool<{
    score?: number;
    verdict?: string;
    covered?: string[];
    missing?: string[];
    mistakes?: { said?: string; correction?: string }[];
    tip?: string;
  }>({ system: reviewSystem(hasMaterial), content, tool: REVIEW_TOOL, maxTokens: 6000 });

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
