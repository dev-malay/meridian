import { useEffect, useState, useRef } from "react";
import { apiGet, apiPost } from "../hooks/useApi";
import { useToast } from "./Toast";
import type { Payment } from "../types";
import { RotateCcw, Clock, RefreshCw, X } from "lucide-react";

interface Props {
  paymentId: string | null;
  onClose: () => void;
  onUpdate: (p: Payment) => void;
}

const statusMeta: Record<string, { css: string; label: string }> = {
  pending:        { css: "tag-pending",   label: "Pending" },
  processing:     { css: "tag-processing", label: "Processing" },
  success:        { css: "tag-success",   label: "Success" },
  failed_retryable: { css: "tag-failed",  label: "Failed (retryable)" },
  failed_final:   { css: "tag-failed",    label: "Failed (final)" },
};

export default function PaymentDetail({ paymentId, onClose, onUpdate }: Props) {
  const { toast } = useToast();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const res = await apiGet<{ payment: Payment }>(`/v1/payments/${id}`);
      setPayment(res.payment);
      onUpdate(res.payment);
    } catch {
      setPayment(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paymentId) { load(paymentId); mounted.current = true; }
    else { setPayment(null); mounted.current = false; }
  }, [paymentId]);

  const handleRetry = async () => {
    if (!payment) return;
    try {
      await apiPost(`/v1/payments/${payment.id}/retry`, {});
      toast("Retry initiated — payment re-queued");
      load(payment.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Retry failed", "error");
    }
  };

  if (!paymentId || !payment) return null;

  const meta = statusMeta[payment.status] ?? statusMeta.pending;
  const canRetry = payment.status === "failed_retryable" || payment.status === "failed_final";

  const fields = [
    { label: "Payment ID", value: payment.id, mono: true },
    { label: "Status", value: <span className={`tag ${meta.css}`}>{meta.label}</span> },
    { label: "Amount", value: payment.amount.toLocaleString(), mono: true },
    { label: "Idempotency Key", value: payment.idempotency_key, mono: true },
    { label: "Attempts", value: String(payment.attempts), mono: true },
    { label: "Provider Ref", value: payment.provider_ref || "—", mono: true, muted: !payment.provider_ref },
    { label: "Last Error", value: payment.last_error || "—", mono: true, error: !!payment.last_error },
    { label: "Created", value: new Date(payment.created_at).toLocaleString(), mono: true, sm: true },
    { label: "Updated", value: new Date(payment.updated_at).toLocaleString(), mono: true, sm: true },
  ];

  return (
    <div className="card p-6 animate-mount-scale">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[rgba(255,255,255,0.04)]">
            <Clock size={13} className="text-[var(--color-gray-400)]" />
          </div>
          <div>
            <h2 className="text-sm font-[500] text-white">Payment Details</h2>
            <p className="text-xs font-[400] text-[var(--color-gray-500)] font-mono mt-px">{payment.id.slice(0, 16)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => load(payment.id)} disabled={loading} className="btn-ghost-muted p-1.5">
            <RefreshCw size={13} style={loading ? { animation: "spin-slow 0.8s linear infinite" } : undefined} />
          </button>
          <button onClick={onClose} className="btn-ghost-muted p-1.5">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {fields.map((f) => (
          <div key={f.label} className="py-2.5 px-3" style={{ background: "rgba(255,255,255,0.015)", borderRadius: "6px" }}>
            <div className="label mb-1">{f.label}</div>
            <div
              className={`${f.mono ? "font-mono" : ""} ${f.sm ? "text-xs" : "text-sm"} font-[400] ${
                f.error ? "text-[var(--color-red)]" : f.muted ? "text-[var(--color-gray-400)]" : "text-[var(--color-gray-100)]"
              }`}
            >
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {canRetry && (
        <button onClick={handleRetry} className="btn-ghost w-full mt-4 justify-center py-2.5 text-xs">
          <RotateCcw size={12} />
          Retry Payment
        </button>
      )}
    </div>
  )
  
}
