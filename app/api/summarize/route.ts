import { NextResponse } from "next/server";
import { generateSummary, rateLimit, readUserKey, UserFacingError, validateSource } from "@/lib/server/ai";
import { MOCK, mockSummary } from "@/lib/server/mock";
import { LIMITS } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > LIMITS.maxBodyBytes) throw new UserFacingError("O material ficou grande demais. Envie menos páginas ou menos imagens.", 413);

    rateLimit((req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim());
    const body = await req.json().catch(() => null);
    const source = validateSource(body);

    if (MOCK) {
      await new Promise((r) => setTimeout(r, 1500));
      return NextResponse.json({ summary: mockSummary });
    }
    const summary = await generateSummary(source, readUserKey(req));
    return NextResponse.json({ summary });
  } catch (err) {
    const e = err instanceof UserFacingError ? err : new UserFacingError("Erro inesperado. Tente de novo.", 500);
    if (!(err instanceof UserFacingError)) console.error(err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
