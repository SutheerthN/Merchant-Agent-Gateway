import crypto from 'crypto';
import {
  AuditEvent,
  CreateAuditEventInput,
  ChainVerificationResult,
} from './audit.types.js';
import { computeEventHash, GENESIS_PREVIOUS_HASH } from './audit.hash.js';
import { AuditStore } from './audit.store.js';

export class AuditService {
  private static instance: AuditService;
  private store: AuditStore;

  private constructor() {
    this.store = new AuditStore();
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Appends a trusted, server-generated audit event to the hash chain.
   *
   * SECURITY GUARANTEES:
   * 1. `id`, `timestamp`, `previousHash`, and `hash` are strictly generated server-side.
   * 2. Neither LLM, client, nor external inputs can provide or override hashes.
   * 3. Data is sanitized to exclude secrets or chain-of-thought.
   */
  public appendEvent(input: CreateAuditEventInput): AuditEvent {
    const sessionEvents = this.store.getBySession(input.sessionId);
    const previousHash =
      sessionEvents.length === 0
        ? GENESIS_PREVIOUS_HASH
        : sessionEvents[sessionEvents.length - 1].hash;

    const eventId = `aud_evt_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const sanitizedData = this.sanitizeData(input.data);

    const eventWithoutHash = {
      id: eventId,
      timestamp,
      sessionId: input.sessionId,
      transactionId: input.transactionId,
      eventType: input.eventType,
      actor: input.actor,
      data: sanitizedData,
      previousHash,
    };

    const hash = computeEventHash(eventWithoutHash);

    const fullEvent: AuditEvent = {
      ...eventWithoutHash,
      hash,
    };

    this.store.append(fullEvent);
    return fullEvent;
  }

  public getSessionEvents(sessionId: string): AuditEvent[] {
    return this.store.getBySession(sessionId);
  }

  public getTransactionEvents(transactionId: string): AuditEvent[] {
    return this.store.getByTransaction(transactionId);
  }

  /**
   * Cryptographically verifies the audit event chain for a session.
   * Checks hash integrity and sequential linkage from GENESIS to the latest event.
   */
  public verifyChain(sessionId: string): ChainVerificationResult {
    const events = this.store.getBySession(sessionId);

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        firstInvalidEventId: null,
      };
    }

    let expectedPreviousHash = GENESIS_PREVIOUS_HASH;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // 1. Verify previousHash matches preceding event's hash (or GENESIS)
      if (event.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: event.id,
          reason: `Event index ${i} (${event.id}) has previousHash '${event.previousHash}', expected '${expectedPreviousHash}'.`,
        };
      }

      // 2. Recompute hash for current event data
      const computedHash = computeEventHash({
        id: event.id,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        transactionId: event.transactionId,
        eventType: event.eventType,
        actor: event.actor,
        data: event.data,
        previousHash: event.previousHash,
      });

      // 3. Verify computed hash matches stored hash
      if (computedHash !== event.hash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: event.id,
          reason: `Event index ${i} (${event.id}) has tampered hash '${event.hash}', recomputed '${computedHash}'.`,
        };
      }

      expectedPreviousHash = event.hash;
    }

    return {
      valid: true,
      eventCount: events.length,
      firstInvalidEventId: null,
    };
  }

  public clearForTests(): void {
    this.store.clear();
  }

  /**
   * Sanitizes audit event data to strip sensitive payment credentials or internal chain-of-thought.
   */
  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const forbiddenKeys = [
      'secret',
      'apiKey',
      'key_secret',
      'cardNumber',
      'cvv',
      'password',
      'reasoning',
      'chainOfThought',
      'privateKey',
    ];

    const clean: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data || {})) {
      if (forbiddenKeys.some((fk) => key.toLowerCase().includes(fk.toLowerCase()))) {
        clean[key] = '[REDACTED_SENSITIVE_DATA]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        clean[key] = this.sanitizeData(value as Record<string, unknown>);
      } else {
        clean[key] = value;
      }
    }

    return clean;
  }
}
