export type SalesReportingProviderKey =
  | "stripe"
  | "authorizenet"
  | "braintree"
  | "razorpay"
  | "paystack"
  | "flutterwave"
  | "mollie"
  | "mercadopago";

export const SALES_REPORTING_PROVIDER_OPTIONS: Array<{ value: SalesReportingProviderKey; label: string }> = [
  { value: "stripe", label: "Stripe" },
  { value: "authorizenet", label: "Authorize.Net" },
  { value: "braintree", label: "Braintree" },
  { value: "razorpay", label: "Razorpay" },
  { value: "paystack", label: "Paystack" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "mollie", label: "Mollie" },
  { value: "mercadopago", label: "Mercado Pago" },
];

export function providerLabel(p: SalesReportingProviderKey): string {
  return SALES_REPORTING_PROVIDER_OPTIONS.find((o) => o.value === p)?.label ?? String(p);
}
