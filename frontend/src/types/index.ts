export interface Payment {
  id: string;
  amount: number;
  status: Status;
  idempotency_key: string;
  provider_ref: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type Status =
  | "pending"
  | "processing"
  | "success"
  | "failed_retryable"
  | "failed_final";

export interface CreatePaymentResponse {
  payment: Payment;
  created: boolean;
  enqueued: boolean;
}

export interface HealthResponse {
  message: string;
}



export interface WebhookConfig {
  target_url: string;
  updated_at: string | null;
}

export interface WebhookDelivery {
  id: string;
  payment_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  target_url: string;
  status: "pending" | "delivered" | "failed";
  attempt: number;
  response_status: number | null;
  response_body: string | null;
  created_at: string;
  delivered_at: string | null;
}
​  
