import { NextResponse } from "next/server";
import { generateQuiz, rateLimit, readUserKey, UserFacingError, validateSource } from "@/lib/server/ai";
import { MOCK, mockQuiz } from "@/lib/server/mock";
import { LEVELS, LIMITS, QUESTION_COUNTS, type LevelId, type Summary } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > LIMITS.maxBodyBytes) throw new UserFacingError("O material ficou grande demais.", 413);

    rateLimit((req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim());
    const body = await req.json().catch(() => null);
    if (!body) throw new UserFacingError("Pedido inválido.");

    const level = body.level as LevelId;
    const count = Number(body.count);
    if (!LEVELS.some((l) => l.id === level)) throw new UserFacingError("Nível inválido.");
    if (!(QUESTION_COUNTS as readonly number[]).includes(count)) throw new UserFacingError("Número de questões inválido.");
    const summary = body.summary as Summary | undefined;
    if (!summary || typeof summary.title !== "string") throw new UserFacingError("Resumo ausente.");
    const source = validateSource(body.source ?? { text: "", images: [] });
    const avoid: string[] = Array.isArray(body.avoid) ? body.avoid.filter((q: unknown) => typeof q === "string").slice(-80) : [];

    if (MOCK) {
      await new Promise((r) => setTimeout(r, 1200));
      return NextResponse.json({ questions: mockQuiz(level, count, avoid.length) });
    }
    const questions = await generateQuiz({ summary, source, level, count, avoid, userKey: readUserKey(req) });
    return NextResponse.json({ questions });
  } catch (err) {
    const e = err instanceof UserFacingError ? err : new UserFacingError("Erro inesperado. Tente de novo.", 500);
    if (!(err instanceof UserFacingError)) console.error(err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
