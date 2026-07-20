import { useState } from "react";
import { apiPost } from "../hooks/useApi";
import { useToast } from "./Toast";
import type { CreatePaymentResponse, Payment } from "../types";
import { Send, Zap, Gauge, TrendingUp } from "lucide-react";

interface Props {
  onCreated: (payment: Payment) => void;
  onSelect: (id: string) => void;
}

const presets = [
  { label: "Low", amount: 500, icon: Zap, desc: "<1k" },
  { label: "Standard", amount: 5000, icon: Gauge, desc: "1k–10k" },
  { label: "Critical", amount: 25000, icon: TrendingUp, desc: "≥10k" },
];

function uid(): string {
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function PaymentForm({ onCreated, onSelect }: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(uid);
  const [busy, setBusy] = useState(false);

  const submit = async (a: string, k: string) => {
    setBusy(true);
    try {
      const res = await apiPost<CreatePaymentResponse>("/v1/payments", {
        amount: parseInt(a, 10),
        idempotency_key: k,
      });
      const p = res.payment;
      onCreated(p);
      toast(res.created ? "Payment created and queued" : "Duplicate — returned existing payment");
      if (res.created) { setAmount(""); setKey(uid()); }
      onSelect(p.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount && key) submit(amount, key);
  };

  const handlePreset = (a: number) => submit(String(a), uid());

  const inputBase = "input text-sm";

  return (
    <div className="card p-6 animate-mount">
      <div className="mb-6">
        <h2 className="text-sm font-[500] text-white">Create Payment</h2>
        <p className="text-xs font-[400] text-[var(--color-gray-400)] mt-1">New payment via transactional outbox</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 mb-5">
          <div>
            <label className="label mb-1.5 block">Amount</label>
            <input
              type="number" min={1} placeholder="e.g. 12500"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              required className={inputBase}
            />
          </div>
          <div>
            <label className="label mb-1.5 block">Idempotency Key</label>
            <input
              type="text" placeholder="unique-key"
              value={key} onChange={(e) => setKey(e.target.value)}
              required className={inputBase}
            />
          </div>
        </div>

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? (
            <span className="w-3.5 h-3.5 border-[1.5px] border-black/30 border-t-black rounded-full" style={{ animation: "spin-slow 0.6s linear infinite" }} />
          ) : (
            <Send size={13} />
          )}
          {busy ? "Processing…" : "Submit Payment"}
        </button>
      </form>

      <div className="mt-5 pt-5 divider" />

      <div className="mt-5">
        <span className="label block mb-3">Quick presets</span>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.amount)}
              disabled={busy}
              className="btn-ghost flex-col gap-0.5 py-2.5 leading-tight text-xs disabled:opacity-25"
            >
              <p.icon size={13} className="text-[var(--color-gray-400)]" />
              <span className="font-[500] text-[var(--color-gray-200)]">{p.label}</span>
              <span className="font-[400] text-[var(--color-gray-500)]">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
