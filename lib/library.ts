"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { LevelId, Summary } from "@/lib/types";

/** Biblioteca de matérias guardada só neste navegador (localStorage). Sem conta, sem custo. */

export type HistoryItem =
  | { kind: "quiz"; level: LevelId; score: number; total: number; at: number }
  | { kind: "write"; score: number; at: number };

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
const MAX_HISTORY = 30;

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
  list[i] = { ...list[i], updatedAt: Date.now(), history: [item, ...list[i].history].slice(0, MAX_HISTORY) };
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
