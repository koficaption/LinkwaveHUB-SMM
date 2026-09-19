export type PaymentInitInput = {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  customerReference?: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  callbackUrl?: string | null;
  merchantBearsCost?: boolean;
  channels?: string[];
  defaultChannel?: string;
  feeQuote?: {
    walletAmount: number;
    fee: number;
    vat: number;
    chargedAmount: number;
    checkoutCurrency?: string;
  };
};

export type KorapayStandardCheckout = {
  key: string;
  reference: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  notificationUrl: string;
  narration?: string;
  channels?: string[];
  defaultChannel?: string;
  merchantBearsCost: boolean;
  metadata?: Record<string, string>;
};

export type PaymentInitResult = {
  reference: string;
  checkoutUrl?: string | null;
  instructions?: string | null;
  providerRef?: string | null;
  autoComplete?: boolean;
  standardCheckout?: KorapayStandardCheckout | null;
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
