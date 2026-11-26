"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { LevelId, Question, Review, Summary } from "@/lib/types";

/** Biblioteca de matérias guardada só neste navegador (localStorage). Sem conta, sem custo. */

/** As 5 revisões mais recentes de cada matéria guardam tudo (perguntas, respostas, correção); as antigas guardam só a nota. */
export type HistoryItem =
  | { kind: "quiz"; level: LevelId; score: number; total: number; at: number; questions?: Question[]; answers?: number[] }
  | { kind: "write"; score: number; at: number; writing?: string; review?: Review };

export interface FreeWrite {
  id: string;
  topic: string;
  at: number;
  writing: string;
  review: Review;
}

export interface LibraryEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  summary: Summary;
  text: string; // texto original (cortado); vazio se o material eram só imagens
  focus?: string;
  history: HistoryItem[];
}

const KEY = "studyit.library.v1";
const EVENT = "studyit:library";
const MAX_ENTRIES = 20;
const MAX_TEXT = 40_000;
const MAX_HISTORY = 20;
const FULL_HISTORY = 5;

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function parse(raw: string): LibraryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: LibraryEntry[]): boolean {
  let list = entries.slice(0, MAX_ENTRIES);
  if (list.length === 0) {
    try {
      localStorage.setItem(KEY, "[]");
      window.dispatchEvent(new Event(EVENT));
    } catch {}
    return true;
  }
  // Se estourar a cota do navegador, descarta as matérias mais antigas até caber.
  while (list.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      window.dispatchEvent(new Event(EVENT));
      return list.length === Math.min(entries.length, MAX_ENTRIES);
    } catch {
      list = list.slice(0, -1);
    }
  }
  return false;
}

export function saveEntry(input: { title: string; summary: Summary; text: string; focus?: string }): string {
  const now = Date.now();
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: LibraryEntry = {
    id,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    summary: input.summary,
    text: input.text.slice(0, MAX_TEXT),
    focus: input.focus,
    history: [],
  };
  persist([entry, ...parse(readRaw())]);
  return id;
}

export function removeEntry(id: string) {
  persist(parse(readRaw()).filter((e) => e.id !== id));
}

export function addHistory(id: string | null, item: HistoryItem) {
  if (!id) return;
  const list = parse(readRaw());
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  const history = [item, ...list[i].history].slice(0, MAX_HISTORY).map((h, n) => {
    if (n < FULL_HISTORY) return h;
    if (h.kind === "quiz") return { kind: h.kind, level: h.level, score: h.score, total: h.total, at: h.at } as HistoryItem;
    return { kind: h.kind, score: h.score, at: h.at } as HistoryItem;
  });
  list[i] = { ...list[i], updatedAt: Date.now(), history };
  persist(list);
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useLibrary(): LibraryEntry[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return useMemo(() => parse(raw), [raw]);
}

/** Texto para a IA usar como "material" de uma matéria salva. */
export function entrySourceText(e: LibraryEntry): string {
  if (e.text.trim()) return e.text;
  const s = e.summary;
  return [
    `# ${s.title}`,
    s.tldr,
    ...s.keyPoints.map((p) => `- ${p}`),
    ...s.sections.flatMap((x) => [`## ${x.heading}`, ...x.bullets.map((b) => `- ${b}`)]),
    ...s.keyTerms.map((t) => `${t.term}: ${t.definition}`),
  ]
    .join("\n")
    .replace(/==/g, "");
}

/* ---------- escritas livres (sem matéria) ---------- */
const FREE_KEY = "studyit.free.v1";
const FREE_EVENT = "studyit:free";
const MAX_FREE = 15;

function readFreeRaw(): string {
  try {
    return localStorage.getItem(FREE_KEY) ?? "";
  } catch {
    return "";
  }
}

function parseFree(raw: string): FreeWrite[] {
  try {
    const d = raw ? JSON.parse(raw) : [];
    return Array.isArray(d) ? (d as FreeWrite[]) : [];
  } catch {
    return [];
  }
}

function writeFree(list: FreeWrite[]) {
  let l = list.slice(0, MAX_FREE);
  while (true) {
    try {
      localStorage.setItem(FREE_KEY, JSON.stringify(l));
      break;
    } catch {
      if (!l.length) break;
      l = l.slice(0, -1);
    }
  }
  window.dispatchEvent(new Event(FREE_EVENT));
}

export function saveFreeWrite(input: { topic: string; writing: string; review: Review }) {
  const now = Date.now();
  writeFree([{ id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: now, ...input }, ...parseFree(readFreeRaw())]);
}

export function removeFreeWrite(id: string) {
  writeFree(parseFree(readFreeRaw()).filter((w) => w.id !== id));
}

function subscribeFree(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(FREE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(FREE_EVENT, cb);
  };
}

export function useFreeWrites(): FreeWrite[] {
  const raw = useSyncExternalStore(subscribeFree, readFreeRaw, () => "");
  return useMemo(() => parseFree(raw), [raw]);
}
