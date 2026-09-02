import { AuditEvent } from './audit.types.js';

export class AuditStore {
  private events: AuditEvent[] = [];
  private sessionIndex: Map<string, AuditEvent[]> = new Map();
  private transactionIndex: Map<string, AuditEvent[]> = new Map();

  public append(event: AuditEvent): void {
    this.events.push(event);

    // Session index
    const sessionList = this.sessionIndex.get(event.sessionId) || [];
    sessionList.push(event);
    this.sessionIndex.set(event.sessionId, sessionList);

    // Transaction index
    if (event.transactionId) {
      const txList = this.transactionIndex.get(event.transactionId) || [];
      txList.push(event);
      this.transactionIndex.set(event.transactionId, txList);
    }
  }

  public getBySession(sessionId: string): AuditEvent[] {
    return this.sessionIndex.get(sessionId) || [];
  }

  public getByTransaction(transactionId: string): AuditEvent[] {
    return this.transactionIndex.get(transactionId) || [];
  }

  public getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
    this.sessionIndex.clear();
    this.transactionIndex.clear();
  }
}
