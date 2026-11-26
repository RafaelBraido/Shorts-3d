"use client";

import { useEffect, useState } from "react";

export function Loading({ title, steps }: { title: string; steps: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 2600);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="scan" aria-hidden>
        {[92, 100, 78, 96, 64, 88].map((w, n) => (
          <span key={n} className="scan-line" style={{ width: `${w}%`, "--d": `${n * 0.45}s` } as React.CSSProperties} />
        ))}
      </div>
      <h2 className="loading-title" tabIndex={-1} data-focus>
        {title}
      </h2>
      <p className="loading-step" key={i}>
        {steps[i]}
      </p>
    </div>
  );
}
