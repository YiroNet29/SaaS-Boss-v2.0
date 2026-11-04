export interface SecretDetectionResult {
  hasSecret: boolean;
  matchedPattern?: string;
  warningMessage?: string;
}

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'Stripe Live Key (sk_live_...)', regex: /sk_live_[0-9a-zA-Z]{16,}/ },
  { name: 'Stripe Test Key (sk_test_...)', regex: /sk_test_[0-9a-zA-Z]{16,}/ },
  { name: 'Google API Key (AIza...)', regex: /AIza[0-9A-Za-z\-_]{20,}/ },
  { name: 'GitHub Personal Access Token (ghp_...)', regex: /ghp_[0-9a-zA-Z]{30,}/ },
  { name: 'Slack Token (xox...)', regex: /xox[baprs]-[0-9a-zA-Z]{10,}/ },
  { name: 'Private Key PEM Header', regex: /-----BEGIN\s+([A-Z\s]+)?PRIVATE\s+KEY-----/i },
  { name: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/ },
  { name: 'Telegram Bot Token', regex: /[0-9]{9,10}:[a-zA-Z0-9_-]{35}/ },
  // High-entropy hex or base64 token of 32+ characters without spaces
  { name: 'High-entropy Secret Token', regex: /\b(?:bearer\s+)?[a-zA-Z0-9_\-]{40,}\b/i },
];

export const SECRET_GUARDRAIL_WARNING =
  'This looks like a secret. Store it in your Vault and add a reference instead.';

/**
 * Scans a string for potential API keys, secret tokens, or private credentials.
 */
export function detectSecretInText(text: string): SecretDetectionResult {
  if (!text || typeof text !== 'string') {
    return { hasSecret: false };
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      return {
        hasSecret: true,
        matchedPattern: pattern.name,
        warningMessage: SECRET_GUARDRAIL_WARNING,
      };
    }
  }

  return { hasSecret: false };
}
