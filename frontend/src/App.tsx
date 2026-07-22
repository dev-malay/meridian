import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import Header from "./components/Header";
import PaymentForm from "./components/PaymentForm";
import SystemInfo from "./components/SystemInfo";
import PaymentsTable from "./components/PaymentsTable";
import PaymentDetail from "./components/PaymentDetail";
import Logs from "./components/Logs";
import Webhooks from "./components/Webhooks";
import { apiGet } from "./hooks/useApi";
import type { Payment } from "./types";

const STORAGE_KEY = "meridian-payments";

function loadPayments(): Payment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePayments(payments: Payment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function usePayments() {
  const [payments, setPayments] = useState<Payment[]>(loadPayments);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { savePayments(payments); }, [payments]);

  const add = useCallback((p: Payment) => {
    setPayments((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }, []);

  const update = useCallback((p: Payment) => {
    setPayments((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  }, []);

  return { payments, selectedId, setSelectedId, add, update };
}

function useAutoRefresh(
  payments: Payment[],
  selectedId: string | null,
  update: (p: Payment) => void,
) {
  const paymentsRef = useRef(payments);
  paymentsRef.current = payments;

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    const ac = new AbortController();

    const selectedTimer = setInterval(async () => {
      const id = selectedRef.current;
      if (!id) return;
      try {
        const res = await apiGet<{ payment: Payment }>(`/v1/payments/${id}`, ac.signal);
        if (!ac.signal.aborted) updateRef.current(res.payment);
      } catch {
        // ignore
      }
    }, 2000);

    const bulkTimer = setInterval(async () => {
      const snapshot = paymentsRef.current;
      const active = snapshot.filter(
        (p) => p.status === "pending" || p.status === "processing" || p.status === "failed_retryable",
      );
      if (active.length === 0) return;

      const results = await Promise.allSettled(
        active.map((p) =>
          apiGet<{ payment: Payment }>(`/v1/payments/${p.id}`, ac.signal).then((r) => r.payment),
        ),
      );
      if (ac.signal.aborted) return;

      for (const r of results) {
        if (r.status === "fulfilled") {
          updateRef.current(r.value);
        }
      }
    }, 3000);

    return () => {
      ac.abort();
      clearInterval(selectedTimer);
      clearInterval(bulkTimer);
    };
  }, []);
}

function Dashboard() {
  const { payments, selectedId, setSelectedId, add, update } = usePayments();
  useAutoRefresh(payments, selectedId, update);

  const metricsUrl = useMemo(
    () =>
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:8080/metrics"
        : "/metrics",
    [],
  );

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 mb-4 lg:mb-5">
          <PaymentForm onCreated={add} onSelect={setSelectedId} />
          <SystemInfo metricsUrl={metricsUrl} />
        </div>
        <div className="mb-4 lg:mb-5">
          <PaymentsTable
            payments={payments}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={update}
          />
        </div>
        <PaymentDetail
          paymentId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={update}
        />
      </main>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen" style={{ background: "var(--color-base-900)" }}>
        <Header />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/webhooks" element={<Webhooks />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
