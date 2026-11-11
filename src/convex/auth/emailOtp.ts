import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    try {
      await axios.post(
        emailGatewayUrl(),
        { to: email, otp: token },
        { headers: emailGatewayHeaders() },
      );
    } catch (error) {
      throw emailGatewayError(error);
    }
  },
});

// Sign-in codes are delivered by a small HTTP email gateway. Configure
// AUTH_EMAIL_GATEWAY_URL and AUTH_EMAIL_GATEWAY_KEY on the Convex deployment.
// The VLY_* variables are read as fallbacks so existing deployments keep
// working without a migration.
function emailGatewayUrl(): string {
  const base =
    process.env.AUTH_EMAIL_GATEWAY_URL ?? process.env.VLY_INTEGRATION_BASE_URL;
  if (!base) {
    throw new Error(
      "AUTH_EMAIL_GATEWAY_URL is not set on this Convex deployment, so email sign-in cannot send codes.",
    );
  }
  return `${base.replace(/\/+$/, "")}/v1/email/otp`;
}

function emailGatewayHeaders(): Record<string, string> {
  const key =
    process.env.AUTH_EMAIL_GATEWAY_KEY ?? process.env.VLY_INTEGRATION_KEY;
  if (!key) {
    throw new Error(
      "AUTH_EMAIL_GATEWAY_KEY is not set on this Convex deployment, so email sign-in cannot send codes.",
    );
  }
  return { Authorization: `Bearer ${key}` };
}

// Never stringify the whole request error: it carries the request headers.
function emailGatewayError(error: unknown): Error {
  const response = (
    error as { response?: { status?: number; data?: { error?: unknown } } }
  )?.response;
  if (response) {
    const detail =
      typeof response.data?.error === "string" ? `: ${response.data.error}` : "";
    return new Error(
      `Could not send the sign-in code (HTTP ${response.status})${detail}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not send the sign-in code: ${message}`);
}

