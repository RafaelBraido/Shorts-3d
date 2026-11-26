import { LIMITS, type SourceImage } from "@/lib/types";

export interface MaterialItem {
  id: string;
  name: string;
  kind: "pdf" | "image";
  status: "reading" | "ready" | "error";
  detail?: string; // "12 páginas", "imagem"
  error?: string;
  text: string;
  images: SourceImage[];
  preview?: string; // object URL (imagens)
}

const MAX_PDF_RENDERED_PAGES = 6;
const MIN_CHARS_PER_PAGE = 40;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newItem(file: File): MaterialItem {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  return {
    id: uid(),
    name: file.name || (isPdf ? "documento.pdf" : "print.png"),
    kind: isPdf ? "pdf" : "image",
    status: "reading",
    text: "",
    images: [],
    preview: isPdf ? undefined : URL.createObjectURL(file),
  };
}

function canvasToJpegBase64(canvas: HTMLCanvasElement): string {
  // Reduz a qualidade até caber no limite por imagem.
  for (const q of [0.82, 0.7, 0.58, 0.45]) {
    const url = canvas.toDataURL("image/jpeg", q);
    const data = url.slice(url.indexOf(",") + 1);
    if (data.length <= LIMITS.maxImageBase64) return data;
  }
  // Ainda grande: encolhe pela metade e tenta de novo.
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * 0.7);
  small.height = Math.round(canvas.height * 0.7);
  small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
  return canvasToJpegBase64(small);
}

function drawScaled(source: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNG transparente vira fundo branco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function loadBitmap(file: File): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file);
    return { source: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, w: img.naturalWidth, h: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function readImage(file: File): Promise<SourceImage> {
  const { source, w, h } = await loadBitmap(file);
  const canvas = drawScaled(source, w, h, 1600);
  return { mediaType: "image/jpeg", data: canvasToJpegBase64(canvas) };
}

export async function readPdf(file: File): Promise<{ text: string; images: SourceImage[]; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  const parts: string[] = [];
  const sparsePages: number[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    const pageText = lines.join("\n").replace(/[ \t]+/g, " ").trim();
    if (pageText.length < MIN_CHARS_PER_PAGE) sparsePages.push(p);
    if (pageText) parts.push(`[página ${p}]\n${pageText}`);
  }

  // Páginas escaneadas ou só com figuras: renderiza como imagem para a IA enxergar.
  const images: SourceImage[] = [];
  for (const p of sparsePages.slice(0, MAX_PDF_RENDERED_PAGES)) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1500 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push({ mediaType: "image/jpeg", data: canvasToJpegBase64(canvas) });
  }

  const pages = doc.numPages;
  await task.destroy();
  return { text: parts.join("\n\n"), images, pages };
}

export async function processFile(file: File, item: MaterialItem): Promise<MaterialItem> {
  try {
    if (item.kind === "pdf") {
      const { text, images, pages } = await readPdf(file);
      if (!text.trim() && images.length === 0) throw new Error("Não achei conteúdo legível nesse PDF.");
      const extra = images.length ? ` · ${images.length} ${images.length === 1 ? "página lida como imagem" : "páginas lidas como imagem"}` : "";
      return { ...item, status: "ready", text, images, detail: `${pages} ${pages === 1 ? "página" : "páginas"}${extra}` };
    }
    const img = await readImage(file);
    return { ...item, status: "ready", images: [img], detail: "Imagem" };
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "Não consegui ler esse arquivo.";
    return { ...item, status: "error", error: message };
  }
}

export function combine(items: MaterialItem[]) {
  const ready = items.filter((i) => i.status === "ready");
  let text = ready
    .filter((i) => i.text)
    .map((i) => (ready.length > 1 ? `=== ${i.name} ===\n${i.text}` : i.text))
    .join("\n\n");
  let truncated = false;
  if (text.length > LIMITS.maxTextChars) {
    text = text.slice(0, LIMITS.maxTextChars);
    truncated = true;
  }
  const images = ready.flatMap((i) => i.images).slice(0, LIMITS.maxImages);
  return { text, images, truncated };
}

export function imageCount(items: MaterialItem[]) {
  return items.reduce((n, i) => n + (i.status === "error" ? 0 : i.kind === "image" ? 1 : i.images.length), 0);
}
