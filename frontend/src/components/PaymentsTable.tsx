import { useState, useMemo, useRef, useEffect } from "react";
import { apiGet, apiPost } from "../hooks/useApi";
import { useToast } from "./Toast";
import type { Payment } from "../types";
import { RotateCcw, Database, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  payments: Payment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (p: Payment) => void;
}

const PER_PAGE = 10;

const statusMeta: Record<string, { css: string; label: string }> = {
  pending:         { css: "tag-pending",   label: "Pending" },
  processing:      { css: "tag-processing", label: "Processing" },
  success:         { css: "tag-success",   label: "Success" },
  failed_retryable: { css: "tag-failed",  label: "Failed retryable" },
  failed_final:    { css: "tag-failed",    label: "Failed final" },
};

function matches(p: Payment, query: string): boolean {
  const q = query.toLowerCase();
  if (p.status.toLowerCase().includes(q)) return true;
  if (p.amount.toLocaleString().includes(q) || String(p.amount).includes(q)) return true;
  if (p.id.toLowerCase().includes(q)) return true;
  if (p.idempotency_key.toLowerCase().includes(q)) return true;
  return false;
}

export default function PaymentsTable({ payments, selectedId, onSelect, onUpdate }: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLength = useRef(payments.length);

  const filtered = useMemo(
    () => (query ? payments.filter((p) => matches(p, query)) : payments),
    [payments, query],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = useMemo(
    () => [...filtered].reverse().slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE),
    [filtered, safePage],
  );

  useEffect(() => {
    if (payments.length !== prevLength.current) {
      prevLength.current = payments.length;
      setPage(0);
    }
  }, [payments.length]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const handleRetry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiPost<{ status: string }>(`/v1/payments/${id}/retry`, {});
      toast("Retry initiated — payment re-queued");
      const res = await apiGet<{ payment: Payment }>(`/v1/payments/${id}`);
      onUpdate(res.payment);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Retry failed", "error");
    }
  };

  if (payments.length === 0) {
    return (
      <div className="card p-6 animate-mount" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2 mb-6">
          <Database size={14} className="text-[var(--color-gray-400)]" />
          <h2 className="text-sm font-[500] text-white">Payments</h2>
        </div>
        <div className="py-16 text-center">
          <div className="text-3xl mb-4 opacity-[0.04] select-none">—</div>
          <p className="text-sm font-[400] text-[var(--color-gray-400)]">No payments yet</p>
          <p className="text-xs font-[400] text-[var(--color-gray-500)] mt-1">Create one to get started.</p>
        </div>
      </div>
    );
  }

  const showPagination = filtered.length > PER_PAGE;

  return (
    <div className="card p-6 animate-mount" style={{ animationDelay: "80ms" }}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-2 shrink-0">
          <Database size={14} className="text-[var(--color-gray-400)]" />
          <h2 className="text-sm font-[500] text-white">Payments</h2>
          <span className="text-xs font-[400] text-[var(--color-gray-500)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 rounded">
            {query ? `${filtered.length}/${payments.length}` : payments.length}
          </span>
        </div>

        <div className="relative w-56">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-gray-500)] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by status, amount, ID, key"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg pl-7 pr-3 py-1.5 text-xs font-[400] text-[var(--color-gray-100)] placeholder:text-[var(--color-gray-500)] outline-none transition-all focus:border-[rgba(255,255,255,0.2)] focus:bg-[rgba(255,255,255,0.05)]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-[400] text-[var(--color-gray-400)]">No payments match your search.</p>
          <button onClick={() => { setQuery(""); setPage(0); inputRef.current?.focus(); }} className="btn-ghost text-xs mt-3 py-1.5 px-3">
            Clear search
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["Status", "Amount", "ID", "Key", "Attempts", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-6 py-3 text-xs font-[500] text-[var(--color-gray-400)] whitespace-nowrap"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => {
                  const meta = statusMeta[p.status] ?? statusMeta.pending;
                  const active = selectedId === p.id;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      className="cursor-pointer transition-all duration-100"
                      style={{
                        background: active ? "rgba(255,255,255,0.03)" : undefined,
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                      onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.015)"; (e.currentTarget as HTMLElement).style.borderBottomColor = "rgba(255,255,255,0.06)"; } }}
                      onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.borderBottomColor = ""; } }}
                    >
                      <td className="px-6 py-3">
                        <span className={`tag ${meta.css}`}>
                          <span className={`dot ${p.status === "pending" ? "dot-pending" : p.status === "processing" ? "dot-processing" : p.status === "success" ? "dot-success" : "dot-failed"}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-sm font-[500] text-white">{p.amount.toLocaleString()}</td>
                      <td className="px-6 py-3 font-mono text-xs font-[400] text-[var(--color-gray-400)]">{p.id.slice(0, 8)}<span className="text-[var(--color-gray-600)]">…</span></td>
                      <td className="px-6 py-3 font-mono text-xs font-[400] text-[var(--color-gray-500)] max-w-[100px] truncate" title={p.idempotency_key}>{p.idempotency_key}</td>
                      <td className="px-6 py-3 font-mono text-xs font-[400] text-[var(--color-gray-400)]">{p.attempts}</td>
                      <td className="px-6 py-3 text-right">
                        {p.status === "failed_retryable" || p.status === "failed_final" ? (
                          <button onClick={(e) => handleRetry(p.id, e)} className="btn-ghost text-xs py-1.5 px-2.5">
                            <RotateCcw size={11} />
                            Retry
                          </button>
                        ) : p.status === "pending" ? (
                          <span className="text-xs font-[400] text-[var(--color-gray-500)]">queued</span>
                        ) : (
                          <span className="text-xs font-[400] text-[var(--color-gray-600)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPagination && (
            <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <span className="text-xs font-[400] text-[var(--color-gray-500)]">
                {safePage * PER_PAGE + 1}–{Math.min((safePage + 1) * PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="btn-ghost-muted p-1.5 disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-[400] text-[var(--color-gray-400)] px-2">
                  {safePage + 1} <span className="text-[var(--color-gray-600)]">/ {totalPages}</span>
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="btn-ghost-muted p-1.5 disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
