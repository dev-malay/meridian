import { useEffect, useState, useRef, useCallback } from "react";
import { apiGet, apiPost } from "../hooks/useApi";
import { useToast } from "./Toast";
import type { WebhookConfig, WebhookDelivery } from "../types";
import { RefreshCw, Webhook, RotateCcw, ExternalLink, Check, X as XIcon, AlertTriangle } from "lucide-react";

const PER_PAGE = 15;

function statusMeta(status: string): { css: string; label: string } {
  switch (status) {
    case "delivered": return { css: "tag-success", label: "Delivered" };
    case "failed": return { css: "tag-failed", label: "Failed" };
    default: return { css: "tag-pending", label: "Pending" };
  }
}

export default function Webhooks() {
  const { toast } = useToast();
  const [config, setConfig] = useState<WebhookConfig>({ target_url: "", updated_at: null });
  const [urlInput, setUrlInput] = useState("");
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const mounted = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiGet<{ config: WebhookConfig }>("/v1/webhooks/config");
      setConfig(res.config);
      setUrlInput(res.config.target_url);
    } catch {
      // ignore
    }
  }, []);

  const loadDeliveries = useCallback(async () => {
    try {
      const res = await apiGet<{ deliveries: WebhookDelivery[] }>(
        `/v1/webhooks/deliveries?limit=${PER_PAGE}&offset=${page * PER_PAGE}`,
      );
      setDeliveries(res.deliveries);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; loadConfig(); loadDeliveries(); }
  }, [loadConfig, loadDeliveries]);

  const refresh = () => { loadConfig(); loadDeliveries(); };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiPost("/v1/webhooks/config", { target_url: urlInput });
      setConfig({ target_url: urlInput, updated_at: new Date().toISOString() });
      toast("Webhook URL saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async (deliveryId: string) => {
    try {
      await apiPost(`/v1/webhooks/deliveries/${deliveryId}/retry`, {});
      toast("Webhook delivery retry queued");
      loadDeliveries();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Retry failed", "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(deliveries.length / PER_PAGE));
  const showPagination = deliveries.length >= PER_PAGE;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-base font-[500] text-white tracking-tight flex items-center gap-2">
            <Webhook size={16} className="text-[var(--color-gray-400)]" />
            Webhooks
          </h1>
          <p className="text-xs font-[400] text-[var(--color-gray-500)] mt-1">
            Configure webhook endpoint and monitor delivery history
          </p>
        </div>
        <button onClick={refresh} className="btn-ghost-muted p-1.5" title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ─── Config ─── */}
      <div className="card p-6 mb-6 animate-mount">
        <h2 className="text-sm font-[500] text-white mb-4">Endpoint</h2>
        <div className="flex items-center gap-3">
          <input
            type="url"
            placeholder="https://example.com/webhooks/payment-completed"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="input text-sm flex-1"
          />
          <button onClick={saveConfig} disabled={saving || !urlInput} className="btn btn-primary shrink-0">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {config.updated_at && (
          <p className="text-xs font-[400] text-[var(--color-gray-500)] mt-3">
            Last updated {new Date(config.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* ─── Deliveries ─── */}
      <div className="card p-6 animate-mount" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-sm font-[500] text-white">Deliveries</h2>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <p className="text-sm font-[400] text-[var(--color-gray-400)]">Loading deliveries…</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-[400] text-[var(--color-gray-400)]">No webhook deliveries yet.</p>
            <p className="text-xs font-[400] text-[var(--color-gray-500)] mt-1">Deliveries appear here after a payment reaches a terminal state (success or failed_final).</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {["Status", "Target URL", "Status Code", "Event", "Attempt", "Created", ""].map((h) => (
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
                  {deliveries.map((d) => {
                    const meta = statusMeta(d.status);
                    const isError = d.response_status !== null && (d.response_status < 200 || d.response_status >= 300);
                    return (
                      <tr
                        key={d.id}
                        className="transition-all duration-100"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                      >
                        <td className="px-6 py-3">
                          <span className={`tag ${meta.css}`}>
                            <span className={`dot ${d.status === "delivered" ? "dot-success" : d.status === "failed" ? "dot-failed" : "dot-pending"}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-[400] text-[var(--color-gray-300)] font-mono max-w-[180px] truncate" title={d.target_url}>
                              {d.target_url}
                            </span>
                            {d.target_url && (
                              <a href={d.target_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-gray-500)] hover:text-[var(--color-gray-300)]">
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          {d.response_status !== null ? (
                            <span className={`text-xs font-mono font-[500] ${isError ? "text-[var(--color-red)]" : "text-[var(--color-green)]"}`}>
                              {d.response_status}
                            </span>
                          ) : (
                            <span className="text-xs font-[400] text-[var(--color-gray-500)]">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-xs font-[400] text-[var(--color-gray-400)]">{d.event_type}</td>
                        <td className="px-6 py-3 text-xs font-[400] text-[var(--color-gray-400)]">{d.attempt}</td>
                        <td className="px-6 py-3 text-xs font-[400] text-[var(--color-gray-400)] font-mono">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3 text-right">
                          {d.status === "failed" && (
                            <button onClick={() => handleRetry(d.id)} className="btn-ghost text-xs py-1.5 px-2.5">
                              <RotateCcw size={11} />
                              Retry
                            </button>
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
                  {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, deliveries.length)} of {deliveries.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost-muted p-1.5 disabled:opacity-20 disabled:cursor-not-allowed">‹</button>
                  <span className="text-xs font-[400] text-[var(--color-gray-400)] px-2">{page + 1}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={deliveries.length < PER_PAGE} className="btn-ghost-muted p-1.5 disabled:opacity-20 disabled:cursor-not-allowed">›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
