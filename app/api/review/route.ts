import { NextResponse } from "next/server";
import { generateReview, rateLimit, UserFacingError, validateReferences, validateSource, validateWriting } from "@/lib/server/ai";
import { MOCK, mockReview } from "@/lib/server/mock";
import { LIMITS, type Summary } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > LIMITS.maxBodyBytes) throw new UserFacingError("O material ficou grande demais.", 413);

    rateLimit((req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim());
    const body = await req.json().catch(() => null);
    if (!body) throw new UserFacingError("Pedido inválido.");

    const writing = validateWriting(body.writing);
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 120) : "";
    const summary = body.summary as Summary | undefined;
    const references = validateReferences(body.references);

    let source;
    if (summary) {
      if (typeof summary.title !== "string") throw new UserFacingError("Resumo inválido.");
      source = validateSource(body.source ?? { text: "", images: [] });
    } else if (!topic) {
      throw new UserFacingError("Diga sobre qual tema você escreveu.");
    }

    if (MOCK) {
      await new Promise((r) => setTimeout(r, 1000));
      return NextResponse.json({ review: mockReview });
    }
    const review = await generateReview({ writing, topic: topic || undefined, summary, source, references });
    return NextResponse.json({ review });
  } catch (err) {
    const e = err instanceof UserFacingError ? err : new UserFacingError("Erro inesperado. Tente de novo.", 500);
    if (!(err instanceof UserFacingError)) console.error(err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
