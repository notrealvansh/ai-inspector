<!--
This file is part of the hosted workspace tooling. It documents the managed
integrations that the preview environment can use; the app itself does not
depend on them for the demo scenarios.
-->

# Hosted workspace integrations

This project is built on a hosted Vite + Convex environment. That environment
offers optional platform integrations for AI, email, and payments, configured
through keys set on the deployment. They are optional and are not required for
the AI Inspector workbench or the demo scenarios.

## Environment variables

The hosted environment may set these automatically. You do not need to set them
for the demo.

- `VLY_INTEGRATION_KEY`
- `VLY_INTEGRATION_BASE_URL` (defaults to a platform gateway)

## About AI providers

You can call AI providers directly with your own keys. The platform also offers
an integrations layer that is simpler for some hosted-use cases, but it is not
used by the trace inspector package.

## Convex actions

If you add server actions, you can call integrations from a `"use node"` file.

```typescript
"use node";

import { action } from "./_generated/server";

\export const textResponse = action({
  handler: async () => {
    // Replace this stub with your own provider when you wire keys.
    return "connect a model yourself";
  },
});


      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });

    return completion;
  }
});
```

## Available Features

### AI Integration
```typescript
// Create completion
const completion = await vly.ai.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await vly.ai.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await vly.ai.embeddings("Your text here");
```

### Email Integration
```typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

### Payments Integration
```typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await vly.ai.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with `"use node"` directive
4. The integration key should never be exposed to the client
5. **Alternative AI providers:** While you can use OpenAI, OpenRouter, or other AI providers directly with your own API keys, @vly-ai/integrations is simpler as it works out-of-the-box without requiring you to supply and manage API keys

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```
