/** Renderiza ==trechos== como marca-texto. */
export function Marked({ text }: { text: string }) {
  const parts = text.split(/==(.+?)==/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="hl">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function stripMarks(text: string) {
  return text.replace(/==(.+?)==/g, "$1");
}
