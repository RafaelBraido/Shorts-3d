/**
 * Proxy de chat para o Ollama local (http://127.0.0.1:11434) com streaming.
 * Chama onText(pedaço) a cada token e resolve quando termina.
 */
export async function streamChat({ url, model, messages, signal, onText }) {
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama respondeu HTTP ${res.status} (modelo "${model}" instalado?)`);

  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.message?.content) onText(j.message.content);
    }
  }
}

export async function listModels(url) {
  const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  return (await res.json()).models.map((m) => m.name);
}
