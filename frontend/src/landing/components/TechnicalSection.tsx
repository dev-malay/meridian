import { technicalPoints } from "../landingContent";

export function TechnicalSection() {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-6 py-16 md:py-20">
      <div className="max-w-[720px]">
        <p className="text-[13px] font-medium tracking-wide text-[var(--m-dim)]">
          How the pipeline actually works
        </p>
        <h2
          className="mt-3 max-w-[28ch] text-[28px] font-medium leading-tight tracking-[-0.01em] text-[var(--m-text)] md:text-[32px]"
          style={{ textWrap: "balance" }}
        >
          Built like payments infrastructure, not a demo.
        </h2>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {technicalPoints.map((point) => (
          <div
            key={point.title}
            className="rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)] p-6 transition-colors hover:border-[var(--m-border)]"
          >
            <span className="font-mono text-[12px] font-medium tracking-wide text-[var(--m-green)]">
              {point.stat}
            </span>
            <h3 className="mt-3 text-[15px] font-medium text-[var(--m-text)]">
              {point.title}
            </h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--m-muted)]">
              {point.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
