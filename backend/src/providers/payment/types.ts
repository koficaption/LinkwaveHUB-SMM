export type PaymentInitInput = {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  callbackUrl?: string | null;
  merchantBearsCost?: boolean;
  feeQuote?: {
    walletAmount: number;
    fee: number;
    vat: number;
    chargedAmount: number;
  };
};

export type PaymentInitResult = {
  reference: string;
  checkoutUrl?: string | null;
  instructions?: string | null;
  providerRef?: string | null;
  autoComplete?: boolean;
};

export type PaymentVerifyResult = {
  success: boolean;
  reference: string;
  providerRef?: string | null;
  amount?: number;
  raw?: unknown;
};

export interface PaymentAdapter {
  code: string;
  initialize(input: PaymentInitInput): Promise<PaymentInitResult>;
  verify(reference: string, config?: Record<string, unknown>): Promise<PaymentVerifyResult>;
}
