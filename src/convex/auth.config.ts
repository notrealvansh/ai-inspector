import type { AuthConfig } from "convex/server";

// Optional federated sign-in for deployments that issue their own JWTs.
// It is enabled only when the issuer is configured on the Convex deployment.
const federatedIssuer = process.env.VLY_CONVEX_AUTH_ISSUER;

export default {
  providers: [
    // This deployment's own Convex Auth provider (email and guest sign-in,
    // see src/convex/auth.ts). The deployment self-issues JWTs validated via
    // OIDC discovery served by auth.addHttpRoutes() in convex/http.ts. Do not
    // convert this entry to customJwt: those tokens have no `kid` header, so
    // the customJwt path would reject them.
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
    ...(federatedIssuer
      ? [
          {
            type: "customJwt" as const,
            issuer: federatedIssuer,
            jwks: `${federatedIssuer}/api/web/.well-known/jwks.json`,
            applicationID: "vly-convex",
            algorithm: "RS256" as const,
          },
        ]
      : []),
  ],
} satisfies AuthConfig;
