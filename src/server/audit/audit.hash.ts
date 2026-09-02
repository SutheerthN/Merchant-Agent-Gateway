import crypto from 'crypto';
import { AuditEvent } from './audit.types.js';

export const GENESIS_PREVIOUS_HASH = 'GENESIS';

/**
 * Deterministically sorts object keys recursively to produce canonical JSON representation.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const keyValues = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalStringify((obj as Record<string, unknown>)[k])}`
  );
  return '{' + keyValues.join(',') + '}';
}

/**
 * Computes the SHA-256 hash of an audit event (excluding the hash field itself).
 */
export function computeEventHash(
  event: Omit<AuditEvent, 'hash'>
): string {
  const canonicalPayload = canonicalStringify({
    id: event.id,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    transactionId: event.transactionId || '',
    eventType: event.eventType,
    actor: event.actor,
    data: event.data,
    previousHash: event.previousHash,
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}
