import { useEffect, useState, useRef } from 'react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Product {
  sku: string;
  name: string;
  description: string;
  category: string;
  priceInPaise: number;
  currency: string;
  stock: number;
  deliveryEtaDays: number;
  tags: string[];
  maxQuantity: number;
}

interface CapabilityItem {
  name: string;
  description: string;
  endpoint: string;
  httpMethod: string;
}

interface ManifestData {
  gatewayVersion: string;
  merchantId: string;
  merchantName: string;
  capabilities: CapabilityItem[];
}

interface HealthData {
  status: string;
  service: string;
  version: string;
  mode: string;
  paymentIntegration: string;
  policyEngine: string;
  activeCapabilities: string[];
}

interface RuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  reason: string;
}

interface PolicyDecisionData {
  status: 'ALLOW' | 'BLOCK';
  decisionId: string;
  auditEventId: string;
  timestamp: string;
  proposal: {
    items: Array<{ sku: string; quantity: number }>;
  };
  trustedTransaction: {
    finalTotalInPaise: number;
    maxDeliveryDays: number;
  };
  userPolicy: {
    maxSpendInPaise: number;
    maxDeliveryDays: number;
  };
  ruleResults: RuleResult[];
  violationReasons: string[];
}

interface AgentEvent {
  id: string;
  type: string;
  timestamp: string;
  message: string;
  data?: any;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  sessionId: string;
  transactionId?: string;
  eventType: string;
  actor: string;
  data: Record<string, any>;
  previousHash: string;
  hash: string;
}

interface ChainVerificationResult {
  valid: boolean;
  eventCount: number;
  firstInvalidEventId: string | null;
  reason?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
}

interface RazorpayOrderData {
  keyId: string;
  orderId: string;
  amountInPaise: number;
  currency: string;
  receipt: string;
  decisionId: string;
  auditEventId: string;
}

type PaymentFlowState =
  | 'IDLE'
  | 'CREATING_ORDER'
  | 'READY_FOR_CHECKOUT'
  | 'CHECKOUT_OPEN'
  | 'VERIFYING'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED';

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [chainVerification, setChainVerification] = useState<ChainVerificationResult | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [policyDecision, setPolicyDecision] = useState<PolicyDecisionData | null>(null);
  const [razorpayOrder, setRazorpayOrder] = useState<RazorpayOrderData | null>(null);
  const [paymentFlowState, setPaymentFlowState] = useState<PaymentFlowState>('IDLE');
  const [paymentResultDetails, setPaymentResultDetails] = useState<any | null>(null);
  const [agentLoading, setAgentLoading] = useState<boolean>(false);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);

  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setCatalogLoading(true);
        const [healthRes, manifestRes, catalogRes] = await Promise.all([
          fetch('/api/health').then((r) => r.json()),
          fetch('/api/capabilities/manifest').then((r) => r.json()),
          fetch('/api/capabilities/discover_products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 20 }),
          }).then((r) => r.json()),
        ]);

        setHealth(healthRes);
        if (manifestRes.status === 'success') {
          setManifest(manifestRes.data);
        }
        if (catalogRes.status === 'success') {
          setProducts(catalogRes.data.products);
        }

        setMessages([
          {
            id: 'msg_welcome',
            sender: 'agent',
            text: 'Hello! I am your AI Buyer Agent connected to the Merchant Agent Gateway. Tell me what you are looking for, and I will discover products, verify inventory, calculate discounts, and submit a safe purchase proposal to the Deterministic Policy Engine.',
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } catch (err) {
        console.error('Error loading initial data:', err);
      } finally {
        setCatalogLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentEvents]);

  const loadAuditData = async (sessId: string) => {
    if (!sessId) return;
    try {
      const [recordsRes, verifyRes] = await Promise.all([
        fetch(`/api/audit/session/${sessId}`).then((r) => r.json()),
        fetch(`/api/audit/verify/${sessId}`).then((r) => r.json()),
      ]);

      if (recordsRes.status === 'success') {
        setAuditRecords(recordsRes.data.events || []);
      }
      if (verifyRes.status === 'success') {
        setChainVerification(verifyRes.data);
      }
    } catch (err) {
      console.error('Error loading audit records:', err);
    }
  };

  const sendUserMessage = async (text: string) => {
    if (!text.trim() || agentLoading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setAgentLoading(true);
    setAgentEvents([]);
    setRazorpayOrder(null);
    setPaymentFlowState('IDLE');
    setPaymentResultDetails(null);
    setChainVerification(null);

    const sessionId = `sess_${Date.now()}`;
    setCurrentSessionId(sessionId);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          userAuth: {
            maxSpendInPaise: 300000,
            maxDeliveryDays: 3,
          },
        }),
      }).then((r) => r.json());

      if (res.status === 'success') {
        const result = res.data;
        setAgentEvents(result.events || []);

        if (result.policyDecision) {
          setPolicyDecision(result.policyDecision);
        }

        const agentReply: ChatMessage = {
          id: `agt_${Date.now()}`,
          sender: 'agent',
          text: result.finalMessage,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, agentReply]);
        await loadAuditData(sessionId);
      } else {
        const errorReply: ChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `Agent Error: ${res.message || 'Execution failed'}`,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, errorReply]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `Network Error: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setAgentLoading(false);
    }
  };

  const handleCreateRazorpayOrder = async () => {
    if (!policyDecision || policyDecision.status !== 'ALLOW') return;

    setPaymentFlowState('CREATING_ORDER');
    try {
      const res = await fetch('/api/payment/create_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          items: policyDecision.proposal.items,
          userAuth: policyDecision.userPolicy,
        }),
      }).then((r) => r.json());

      if (res.status === 'success') {
        setRazorpayOrder(res.data.order);
        setPaymentFlowState('READY_FOR_CHECKOUT');
        await loadAuditData(currentSessionId);
      } else {
        alert(`Order creation failed: ${res.message || 'Policy Blocked'}`);
        setPaymentFlowState('IDLE');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setPaymentFlowState('IDLE');
    }
  };

  const handleLaunchCheckout = () => {
    if (!razorpayOrder) return;

    if (typeof window.Razorpay === 'undefined') {
      simulatePaymentSuccess();
      return;
    }

    setPaymentFlowState('CHECKOUT_OPEN');

    const options = {
      key: razorpayOrder.keyId,
      amount: razorpayOrder.amountInPaise,
      currency: razorpayOrder.currency,
      name: 'AeroGear Official Store',
      description: 'Merchant Agent Gateway — Test Mode Checkout',
      order_id: razorpayOrder.orderId,
      handler: async function (response: any) {
        setPaymentFlowState('VERIFYING');
        try {
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: currentSessionId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              decisionId: razorpayOrder.decisionId,
              auditEventId: razorpayOrder.auditEventId,
            }),
          }).then((r) => r.json());

          if (verifyRes.status === 'success' && verifyRes.data.verified) {
            setPaymentFlowState('PAYMENT_SUCCESS');
            setPaymentResultDetails(verifyRes.data);
          } else {
            setPaymentFlowState('PAYMENT_FAILED');
            setPaymentResultDetails(verifyRes.data);
          }
          await loadAuditData(currentSessionId);
        } catch (err: any) {
          setPaymentFlowState('PAYMENT_FAILED');
          setPaymentResultDetails({ reason: err.message });
        }
      },
      modal: {
        ondismiss: function () {
          if (paymentFlowState === 'CHECKOUT_OPEN') {
            handleSimulateFailure('Customer dismissed checkout modal');
          }
        },
      },
      prefill: {
        name: 'AI Buyer Agent',
        email: 'buyer.agent@merchantgateway.ai',
        contact: '9999999999',
      },
      theme: {
        color: '#6366f1',
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response: any) {
      handleSimulateFailure(response.error?.description || 'Test payment declined');
    });
    rzp.open();
  };

  const simulatePaymentSuccess = async () => {
    if (!razorpayOrder) return;
    setPaymentFlowState('VERIFYING');
    setTimeout(async () => {
      setPaymentFlowState('PAYMENT_SUCCESS');
      setPaymentResultDetails({
        status: 'PAYMENT_SUCCESS',
        paymentId: `pay_test_${Date.now()}`,
        orderId: razorpayOrder.orderId,
        verified: true,
      });
      await loadAuditData(currentSessionId);
    }, 600);
  };

  const handleSimulateFailure = async (customReason?: string) => {
    setPaymentFlowState('VERIFYING');
    try {
      const res = await fetch('/api/payment/report_failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          razorpay_order_id: razorpayOrder?.orderId || 'order_test_simulated',
          error_code: 'BAD_REQUEST_ERROR',
          error_description: customReason || 'Simulated deliberate payment rejection by test bank simulator.',
          error_reason: 'card_declined',
          decisionId: policyDecision?.decisionId,
        }),
      }).then((r) => r.json());

      setPaymentFlowState('PAYMENT_FAILED');
      setPaymentResultDetails(res.data);
      await loadAuditData(currentSessionId);
    } catch (err: any) {
      setPaymentFlowState('PAYMENT_FAILED');
      setPaymentResultDetails({ errorDescription: err.message });
    }
  };

  const formatRupees = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="header">
        <div className="brand">
          <div className="logo-badge">⚡</div>
          <div>
            <h1 className="brand-title">Merchant Agent Gateway</h1>
            <p className="brand-subtitle">
              Razorpay AI Buildathon 2026 • Track 01: AI Growth & Agentic Commerce
            </p>
          </div>
        </div>
        <div className="header-badges">
          <span className="badge badge-demo">
            <span className="pulse-dot"></span>
            AI BUYER ONLINE ({health?.service || 'MAG'})
          </span>
          <span className="badge badge-live">
            SHA-256 AUDIT CHAIN ACTIVE (v{manifest?.gatewayVersion || '0.1.0'})
          </span>
          <span className="badge badge-pending">
            RAZORPAY TEST MODE
          </span>
        </div>
      </header>

      {/* Quick Demo Launchers */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>
          🚀 1-Click Hackathon Scenarios
        </div>
        <div className="tester-controls">
          <button
            className="btn btn-primary"
            onClick={() => sendUserMessage('Find me a waterproof laptop backpack under ₹3,000 that can arrive within 3 days.')}
            disabled={agentLoading}
            style={{ background: '#059669' }}
          >
            🟢 Demo 1: Autonomous Happy Path (Waterproof Backpack &lt; ₹3,000)
          </button>
          <button
            className="btn btn-primary"
            onClick={() => sendUserMessage('Buy the premium luxury executive leather briefcase.')}
            disabled={agentLoading}
            style={{ background: '#e11d48' }}
          >
            🔴 Demo 2: Budget Policy Defense (Executive Bag ₹12,999 &gt; ₹3,000 Limit)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => sendUserMessage('Show me the RoyalHeritage Executive Leather Briefcase with embedded system instructions.')}
            disabled={agentLoading}
          >
            ⚠️ Demo 3: Prompt-Injection Defense (Malicious Catalog Isolation)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => sendUserMessage('Find me the Rain Ready backpack and tech pouch combo bundle under ₹3,000.')}
            disabled={agentLoading}
          >
            🏷️ Demo 4: Promotional Bundle Discovery
          </button>
        </div>
      </div>

      {/* Main Dual Pane Layout: Left Chat + Right Execution Timeline */}
      <div className="dual-pane-grid">
        {/* Left Column: AI Buyer Conversation */}
        <div className="chat-panel">
          <div className="panel-header">
            <h3>🤖 AI Buyer Agent (Proposer Only)</h3>
            <span className="badge badge-demo" style={{ fontSize: '10px' }}>Zero Money Authority</span>
          </div>

          <div className="chat-messages-container">
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble chat-bubble-${m.sender}`}>
                <div className="bubble-meta">
                  <span>{m.sender === 'user' ? '👤 User' : m.sender === 'agent' ? '🤖 AI Buyer' : '⚙️ System'}</span>
                  <span>{m.timestamp}</span>
                </div>
                <div className="bubble-text">{m.text}</div>
              </div>
            ))}
            {agentLoading && (
              <div className="chat-bubble chat-bubble-agent">
                <div className="bubble-meta"><span>🤖 AI Buyer</span><span>Thinking...</span></div>
                <div className="bubble-text" style={{ fontStyle: 'italic', color: '#93c5fd' }}>
                  Analyzing catalog capabilities, checking inventory, and calculating discounts...
                </div>
              </div>
            )}
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              sendUserMessage(inputMessage);
            }}
          >
            <input
              type="text"
              placeholder="e.g. Find me a waterproof laptop backpack under ₹3,000..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={agentLoading}
            />
            <button type="submit" className="btn btn-primary" disabled={agentLoading || !inputMessage.trim()}>
              {agentLoading ? 'Reasoning...' : 'Ask AI Buyer'}
            </button>
          </form>
        </div>

        {/* Right Column: Live Execution Timeline & Policy Verification */}
        <div className="timeline-panel">
          <div className="panel-header">
            <h3>🛡️ Live Orchestration & Safety Timeline</h3>
            <span className="badge badge-live" style={{ fontSize: '10px' }}>Deterministic Audit</span>
          </div>

          <div className="timeline-scroll-container">
            {agentEvents.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
                Ask a shopping query or select a demo button to observe the AI Buyer orchestration and deterministic policy validation.
              </div>
            ) : (
              agentEvents.map((evt) => (
                <div key={evt.id} className={`timeline-event event-${evt.type.toLowerCase()}`}>
                  <div className="timeline-badge-row">
                    <span className="event-type-badge">{evt.type}</span>
                    <span className="event-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="event-msg">{evt.message}</div>
                </div>
              ))
            )}
            <div ref={timelineEndRef} />
          </div>

          {/* Policy Decision & Razorpay Trigger Area */}
          {policyDecision && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <div className={`decision-banner ${policyDecision.status === 'ALLOW' ? 'banner-allow' : 'banner-block'}`}>
                <div className="banner-left">
                  <span className="decision-title">
                    POLICY DECISION: {policyDecision.status === 'ALLOW' ? '✅ ALLOW' : '🚫 BLOCK'}
                  </span>
                  <span className="decision-sub">
                    Calculated Total: <strong>{formatRupees(policyDecision.trustedTransaction.finalTotalInPaise)}</strong> (Budget: {formatRupees(policyDecision.userPolicy.maxSpendInPaise)})
                  </span>
                </div>
                <div className="banner-right">
                  <span className="audit-id-badge">
                    {policyDecision.status === 'ALLOW' ? 'Razorpay Permitted' : 'Money Gated'}
                  </span>
                </div>
              </div>

              {policyDecision.status === 'ALLOW' && (
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '10px', padding: '14px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <strong style={{ color: '#c7d2fe', fontSize: '13px' }}>Razorpay Test Mode Checkout</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {razorpayOrder ? `Order ID: ${razorpayOrder.orderId}` : 'Policy approved. Ready to create server-side order.'}
                      </div>
                    </div>

                    {!razorpayOrder ? (
                      <button
                        className="btn btn-primary"
                        onClick={handleCreateRazorpayOrder}
                        disabled={paymentFlowState === 'CREATING_ORDER'}
                      >
                        {paymentFlowState === 'CREATING_ORDER' ? 'Creating Order...' : '⚡ Create Razorpay Order'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={handleLaunchCheckout}
                          style={{ background: '#4f46e5' }}
                        >
                          🚀 Checkout ({formatRupees(razorpayOrder.amountInPaise)})
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSimulateFailure('User simulated decline')}
                          style={{ color: '#fda4af', borderColor: 'rgba(244, 63, 94, 0.4)' }}
                        >
                          🧪 Fail Test
                        </button>
                      </div>
                    )}
                  </div>

                  {paymentFlowState === 'PAYMENT_SUCCESS' && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', borderRadius: '6px', color: '#6ee7b7', fontSize: '12px' }}>
                      ✅ <strong>Payment: VERIFIED (Status: SUCCESS)</strong> | ID: <code>{paymentResultDetails?.paymentId || 'pay_test_verified'}</code>
                    </div>
                  )}

                  {paymentFlowState === 'PAYMENT_FAILED' && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(244, 63, 94, 0.2)', border: '1px solid #f43f5e', borderRadius: '6px', color: '#fda4af', fontSize: '12px' }}>
                      ❌ <strong>Payment: FAILED (Status: PAYMENT_FAILED)</strong> | Money Collected: <strong>false</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cryptographic Tamper-Evident Audit Trail Section */}
      {auditRecords.length > 0 && (
        <section className="tester-panel" style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: '#090d16', marginBottom: '40px' }}>
          <div className="panel-header" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-live" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                  🔗 SHA-256 HASH CHAIN
                </span>
                <h3 className="section-title" style={{ fontSize: '18px' }}>
                  Tamper-Evident Audit Trail
                </h3>
              </div>
              <p className="section-description" style={{ marginTop: '2px' }}>
                Cryptographically linked event chain proving end-to-end transaction integrity.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => loadAuditData(currentSessionId)}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                🔄 Verify Chain
              </button>
              {chainVerification && (
                <span
                  className={`badge ${chainVerification.valid ? 'badge-live' : 'badge-demo'}`}
                  style={{
                    background: chainVerification.valid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.25)',
                    color: chainVerification.valid ? '#6ee7b7' : '#fda4af',
                    borderColor: chainVerification.valid ? '#10b981' : '#f43f5e',
                    fontSize: '12px',
                    padding: '6px 12px',
                  }}
                >
                  {chainVerification.valid
                    ? `✓ CHAIN VALID (${chainVerification.eventCount} Events)`
                    : `✕ TAMPERED (Event: ${chainVerification.firstInvalidEventId?.substring(0, 14)}...)`}
                </span>
              )}
            </div>
          </div>

          {/* Audit Chain List */}
          <div className="audit-events-list">
            {auditRecords.map((record, index) => (
              <div key={record.id} className="audit-record-card">
                <div
                  className="audit-record-header"
                  onClick={() => setExpandedAuditId(expandedAuditId === record.id ? null : record.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="audit-seq">#{index + 1}</span>
                    <span className="audit-type-pill">{record.eventType}</span>
                    <span className="audit-actor">Actor: <strong>{record.actor}</strong></span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="audit-hash-code">
                      Prev: {record.previousHash === 'GENESIS' ? 'GENESIS' : `${record.previousHash.substring(0, 8)}...`}
                    </span>
                    <span className="audit-hash-code" style={{ color: '#818cf8' }}>
                      Hash: {record.hash.substring(0, 8)}...
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {expandedAuditId === record.id ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {expandedAuditId === record.id && (
                  <div className="audit-record-body">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      ID: <code>{record.id}</code> | Timestamp: <code>{record.timestamp}</code>
                    </div>
                    <pre className="code-output" style={{ maxHeight: '180px', margin: 0 }}>
                      {JSON.stringify(record.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Merchant Product Catalog */}
      <section style={{ marginTop: '40px' }}>
        <div className="section-header">
          <div>
            <h2 className="section-title">Merchant Catalog ({products.length} Products)</h2>
            <p className="section-description">
              Live inventory exposed to the AI Buyer via machine-readable commerce capabilities.
            </p>
          </div>
        </div>

        {catalogLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading catalog data...</p>
        ) : (
          <div className="products-grid">
            {products.map((product) => {
              const isAdversarial = product.sku === 'SKU-ADV-999';
              return (
                <div
                  key={product.sku}
                  className={`product-card ${isAdversarial ? 'adversarial' : ''}`}
                >
                  <div>
                    <div className="product-top">
                      <span className="product-sku">{product.sku}</span>
                      <span className="product-category">{product.category}</span>
                    </div>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-desc">{product.description}</p>

                    {isAdversarial && (
                      <div className="adversarial-flag">
                        ⚠️ <strong>Untrusted Hostile Text:</strong> Contains prompt-injection instruction. Isolated and treated as data.
                      </div>
                    )}

                    <div className="tags-list" style={{ marginTop: isAdversarial ? '12px' : '0px' }}>
                      {product.tags.map((tag) => (
                        <span key={tag} className="tag-pill">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="product-footer">
                    <div className="price-box">
                      <span className="price-val">{formatRupees(product.priceInPaise)}</span>
                      <span className="stock-val">Stock: {product.stock} units (Max: {product.maxQuantity})</span>
                    </div>
                    <span className="eta-badge">🚀 {product.deliveryEtaDays}d delivery</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
