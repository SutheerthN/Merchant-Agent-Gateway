import { useEffect, useState } from 'react';

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

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [policyDecision, setPolicyDecision] = useState<PolicyDecisionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [testLoading, setTestLoading] = useState<boolean>(false);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
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

        // Run default scenario on startup
        const defaultRes = await fetch('/api/capabilities/validate_policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ sku: 'SKU-BP-001', quantity: 1 }],
            userAuth: { maxSpendInPaise: 300000, maxDeliveryDays: 3 },
          }),
        }).then((r) => r.json());

        if (defaultRes.status === 'success') {
          setPolicyDecision(defaultRes.data);
        }
      } catch (err) {
        console.error('Error loading initial data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  const runPolicyScenario = async (
    scenario: 'legitimate' | 'adversarial' | 'tamper_price' | 'bundle_allow'
  ) => {
    setTestLoading(true);
    try {
      let payload: any;
      if (scenario === 'legitimate') {
        payload = {
          items: [{ sku: 'SKU-BP-001', quantity: 1 }],
          userAuth: { maxSpendInPaise: 300000, maxDeliveryDays: 3 },
        };
      } else if (scenario === 'adversarial') {
        payload = {
          items: [{ sku: 'SKU-ADV-999', quantity: 1 }],
          userAuth: { maxSpendInPaise: 300000 },
        };
      } else if (scenario === 'tamper_price') {
        payload = {
          items: [
            {
              sku: 'SKU-BP-001',
              quantity: 1,
              claimedPriceInPaise: 100, // Untrusted agent claims ₹1.00
              claimedTotalInPaise: 100,
            },
          ],
          userAuth: { maxSpendInPaise: 200000 }, // Budget ₹2,000 (real price ₹2,799 will be blocked)
        };
      } else {
        payload = {
          items: [
            { sku: 'SKU-BP-001', quantity: 1 },
            { sku: 'SKU-PO-003', quantity: 1 },
          ],
          applyEligibleBundles: true,
          userAuth: { maxSpendInPaise: 300000 },
        };
      }

      const res = await fetch('/api/capabilities/validate_policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.status === 'success') {
        setPolicyDecision(res.data);
      }
    } catch (err: any) {
      console.error('Error executing policy scenario:', err);
    } finally {
      setTestLoading(false);
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
            MODE: TEST / DEMO
          </span>
          <span className="badge badge-live">
            GATEWAY ONLINE v{manifest?.gatewayVersion || '0.1.0'}
          </span>
        </div>
      </header>

      {/* Top Status Cards */}
      <div className="status-grid">
        <div className="status-card">
          <div className="status-card-label">Gateway Service</div>
          <div className="status-card-value" style={{ color: '#38bdf8' }}>
            {health?.status === 'healthy' ? 'Active & Healthy' : 'Connecting...'}
          </div>
        </div>

        <div className="status-card">
          <div className="status-card-label">Deterministic Policy Engine</div>
          <div className="status-card-value" style={{ color: '#fbbf24' }}>
            Types Ready (Milestone 2)
          </div>
        </div>

        <div className="status-card">
          <div className="status-card-label">Razorpay Test Integration</div>
          <div className="status-card-value" style={{ color: '#94a3b8' }}>
            Planned (Milestone 3)
          </div>
        </div>

        <div className="status-card">
          <div className="status-card-label">Active Capabilities</div>
          <div className="status-card-value" style={{ color: '#34d399' }}>
            {manifest?.capabilities?.length || 5} Implemented
          </div>
        </div>
      </div>

      {/* Machine-Readable Capabilities */}
      <section>
        <div className="section-header">
          <div>
            <h2 className="section-title">Machine-Readable Merchant Capabilities</h2>
            <p className="section-description">
              Exposed for AI Buyer autonomous orchestration with deterministic schemas.
            </p>
          </div>
        </div>

        <div className="capabilities-grid">
          {manifest?.capabilities.map((cap) => (
            <div key={cap.name} className="capability-card">
              <span className="capability-badge">{cap.httpMethod} {cap.name}</span>
              <h3 className="capability-name">{cap.name.replace(/_/g, ' ')}</h3>
              <p className="capability-desc">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Deterministic Policy Engine Inspector & Adversarial Demos */}
      <section className="tester-panel" style={{ border: '1px solid rgba(99, 102, 241, 0.4)' }}>
        <div className="section-header" style={{ marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-demo" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#818cf8' }}>
                🛡️ SECURITY CORE (ZERO LLM)
              </span>
              <h3 className="section-title" style={{ fontSize: '18px' }}>
                Deterministic Policy Engine Inspector
              </h3>
            </div>
            <p className="section-description">
              Prove mathematical policy enforcement before any money movement occurs.
            </p>
          </div>
        </div>

        <div className="tester-controls">
          <button
            className="btn btn-primary"
            onClick={() => runPolicyScenario('legitimate')}
            disabled={testLoading}
            style={{ background: '#059669' }}
          >
            🟢 Scenario 1: Valid Purchase (₹2,799 ≤ ₹3,000 Limit) → ALLOW
          </button>
          <button
            className="btn btn-primary"
            onClick={() => runPolicyScenario('adversarial')}
            disabled={testLoading}
            style={{ background: '#e11d48' }}
          >
            🔴 Scenario 2: Adversarial Catalog Bag (₹12,999 &gt; ₹3,000 Limit) → BLOCK
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => runPolicyScenario('tamper_price')}
            disabled={testLoading}
          >
            ⚠️ Scenario 3: LLM Price Tamper (Claims ₹1 on ₹2,799 Bag) → SERVER ENFORCED
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => runPolicyScenario('bundle_allow')}
            disabled={testLoading}
          >
            🏷️ Scenario 4: Bundle with Discount (₹2,998 ≤ ₹3,000) → ALLOW
          </button>
        </div>

        {policyDecision && (
          <div className="policy-results-card">
            <div className={`decision-banner ${policyDecision.status === 'ALLOW' ? 'banner-allow' : 'banner-block'}`}>
              <div className="banner-left">
                <span className="decision-title">
                  DECISION: {policyDecision.status === 'ALLOW' ? '✅ ALLOW (TRANSACTION PERMITTED)' : '🚫 BLOCKED (TRANSACTION INTERCEPTED)'}
                </span>
                <span className="decision-sub">
                  Razorpay Payment Call: <strong>NOT EXECUTED (Gated Behind Policy)</strong>
                </span>
              </div>
              <div className="banner-right">
                <span className="audit-id-badge">
                  Audit ID: {policyDecision.auditEventId.substring(0, 18)}...
                </span>
              </div>
            </div>

            {/* Financial & Fact Resolution Comparison */}
            <div className="policy-metrics-grid">
              <div className="metric-box">
                <span className="metric-lbl">Requested Items</span>
                <span className="metric-val">
                  {policyDecision.proposal.items.map((i) => `${i.sku} (x${i.quantity})`).join(', ')}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">Trusted Server Price</span>
                <span className="metric-val" style={{ color: '#34d399' }}>
                  {formatRupees(policyDecision.trustedTransaction.finalTotalInPaise)}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">User Spend Limit</span>
                <span className="metric-val" style={{ color: '#38bdf8' }}>
                  {formatRupees(policyDecision.userPolicy.maxSpendInPaise)}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-lbl">Max Delivery ETA</span>
                <span className="metric-val">
                  {policyDecision.trustedTransaction.maxDeliveryDays} days (Limit: {policyDecision.userPolicy.maxDeliveryDays}d)
                </span>
              </div>
            </div>

            {/* 10-Rule Deterministic Evaluation Checklist */}
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Deterministic Rule Evaluations ({policyDecision.ruleResults.filter(r => r.passed).length}/{policyDecision.ruleResults.length} Passed)
            </h4>

            <div className="rules-list">
              {policyDecision.ruleResults.map((rule) => (
                <div key={rule.ruleId} className={`rule-row ${rule.passed ? 'rule-pass' : 'rule-fail'}`}>
                  <div className="rule-badge">{rule.passed ? 'PASS' : 'FAIL'}</div>
                  <div className="rule-content">
                    <span className="rule-name">[{rule.ruleId}] {rule.ruleName}</span>
                    <span className="rule-reason">{rule.reason}</span>
                  </div>
                </div>
              ))}
            </div>

            {policyDecision.violationReasons.length > 0 && (
              <div className="violation-box">
                <strong>Policy Violation Reasons:</strong>
                <ul>
                  {policyDecision.violationReasons.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Merchant Product Catalog */}
      <section>
        <div className="section-header">
          <div>
            <h2 className="section-title">Merchant Catalog ({products.length} Products)</h2>
            <p className="section-description">
              Realistic merchant inventory with machine-readable specifications and adversarial data isolation.
            </p>
          </div>
        </div>

        {loading ? (
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
                        ⚠️ <strong>Adversarial Data Detected:</strong> Contains simulated injection text in description. Evaluated strictly as untrusted data string.
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

      {/* Milestone Roadmap Notice */}
      <div className="roadmap-banner">
        <div className="roadmap-text">
          <h4>Milestone 1 Complete — Foundation & Capabilities Ready</h4>
          <p>
            Next: Milestone 2 (Deterministic Policy Engine) → Milestone 3 (Razorpay Test Mode Integration) → Milestone 4 (Agent Reasoning Loop & SSE Stream).
          </p>
        </div>
      </div>
    </div>
  );
}
