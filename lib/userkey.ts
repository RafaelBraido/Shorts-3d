"use client";

import { useSyncExternalStore } from "react";

/** Chave pessoal do Gemini (grátis), guardada só no navegador da pessoa. */
const KEY = "studyit.userkey.v1";
const EVENT = "studyit:userkey";

export function getUserKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setUserKey(value: string) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useUserKey(): string {
  return useSyncExternalStore(subscribe, getUserKey, () => "");
}
