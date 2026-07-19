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
