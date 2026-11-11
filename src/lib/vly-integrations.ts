// VLY Integrations Configuration
// See /integrations.md for usage documentation

import { createVlyIntegrations as createPlatformIntegrations } from '@vly-ai/integrations';

export const vlyIntegrations = createPlatformIntegrations({
  deploymentToken: process.env.VLY_INTEGRATION_KEY!,
  debug: process.env.NODE_ENV === 'development'
});

