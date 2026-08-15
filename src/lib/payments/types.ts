export interface BillplzCreateBillParams {
  bookingId: string;
  amountCents: number; // Billplz expects the smallest currency unit
  name: string;
  email: string;
  description: string;
  callbackUrl: string;
  redirectUrl: string;
}

export interface BillplzBillResponse {
  id: string;
  collection_id: string;
  paid: boolean;
  state: string;
  amount: number;
  url: string;
}

export interface BillplzWebhookPayload {
  id: string;
  collection_id: string;
  paid: string; // "true" | "false" as string, per Billplz webhook quirk
  state: string;
  amount: string;
  paid_amount: string;
  x_signature: string;
  [key: string]: string;
}
