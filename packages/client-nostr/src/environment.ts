import { z, ZodError } from 'zod';
import { IAgentRuntime, parseBooleanFromText } from '@elizaos/core';

/**
 * The user must provide:
 *   - NOSTR_CONTENT_TOPIC (string, no default)
 *   - NOSTR_TOPIC (string, no default)
 *   - NOSTR_RELAY_WSS (string, no default)
 */
const nostrEnvSchema = z.object({
  NOSTR_CONTENT_TOPIC: z
    .string()
    .min(1, 'NOSTR_CONTENT_TOPIC is required'),
  NOSTR_TOPIC: z
    .string()
    .min(1, 'NOSTR_TOPIC is required'),
  NOSTR_RELAY_WSS: z
    .string()
    .min(1, 'NOSTR_RELAY_WSS is required'),

});

export type NostrConfig = z.infer<typeof nostrEnvSchema>;

export async function validateNostrConfig(
  runtime: IAgentRuntime
): Promise<NostrConfig> {
  try {
    const nostrConfig = {
      NOSTR_CONTENT_TOPIC: runtime.getSetting('NOSTR_CONTENT_TOPIC'),
      NOSTR_TOPIC: runtime.getSetting('NOSTR_TOPIC'),
      NOSTR_RELAY_WSS: runtime.getSetting('NOSTR_RELAY_WSS'),
    };

    return nostrEnvSchema.parse(nostrConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Nostr configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}
