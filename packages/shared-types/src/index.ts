export type PaymentGateway =
  "OPLATI" | "ERIP_EPOS" | "BEPAY_WEBPAY" | "SKNO_TITAN_PLUS";

export interface PaymentGatewayStatus {
  gateway: PaymentGateway;
  connected: boolean;
}

export type PaymentGatewayCredentials =
  | { gateway: "OPLATI"; merchantId: string }
  | { gateway: "ERIP_EPOS"; serviceId: string; secret: string }
  | {
      gateway: "BEPAY_WEBPAY";
      provider: "bepaid" | "webpay";
      shopId: string;
      secret: string;
      environment: "TEST" | "PROD";
    }
  | {
      gateway: "SKNO_TITAN_PLUS";
      cashRegisterSerialNumber: string;
      unp: string;
    };

export interface SavePaymentOnboardingRequest {
  gateways: PaymentGatewayCredentials[];
}

export interface PaymentOnboardingStatusResponse {
  gateways: PaymentGatewayStatus[];
}
