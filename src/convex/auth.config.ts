import type { AuthConfig } from "convex/server";

// Optional federated sign-in for deployments that issue their own JWTs.
// It stays disabled until the deployment sets a real issuer URL.
const federatedIssuer = process.env.VLY_CONVEX_AUTH_ISSUER;
// `VLY_CONVEX_AUTH_ISSUER` is the deployment auth issuer. Set it only if you
// add federated sign-in. Otherwise leave it empty so the federated path stays
// disabled and your JWTs keep using the deployment's own provider.

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
// `vly-convex` is the deployment's default app id. Replace it with your own
// application id when you add a custom federated provider.
            algorithm: "RS256" as const,
          },
        ]
      : []),
  ],
} satisfies AuthConfig;
