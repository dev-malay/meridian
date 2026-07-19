export enum Status {
  Pending = "pending",
  Processing = "processing",
  Success = "success",
  FailedRetryable = "failed_retryable",
  FailedFinal = "failed_final",
}

export interface Payment {
  id: string;
  amount: number;
  status: Status;
  idempotency_key: string;
  provider_ref: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentParams {
  amount: number;
  status: Status;
  idempotency_key: string;
}
