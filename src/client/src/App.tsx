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

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTestResponse, setActiveTestResponse] = useState<string | null>(null);
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
      } catch (err) {
        console.error('Error loading initial data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  const runSampleTest = async (testType: 'budget' | 'bundle' | 'manifest') => {
    setTestLoading(true);
    try {
      let res;
      if (testType === 'budget') {
        res = await fetch('/api/capabilities/discover_products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'waterproof backpack', maxPriceInPaise: 300000, maxDeliveryDays: 3 }),
        }).then((r) => r.json());
      } else if (testType === 'bundle') {
        res = await fetch('/api/capabilities/check_price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              { sku: 'SKU-BP-001', quantity: 1 },
              { sku: 'SKU-PO-003', quantity: 1 },
            ],
            applyEligibleBundles: true,
          }),
        }).then((r) => r.json());
      } else {
        res = await fetch('/api/capabilities/manifest').then((r) => r.json());
      }
      setActiveTestResponse(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setActiveTestResponse(JSON.stringify({ error: err.message }, null, 2));
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

      {/* Interactive Capability Tester */}
      <section className="tester-panel">
        <div className="section-header" style={{ marginBottom: '14px' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '17px' }}>
              Live Machine-Readable Capability Inspector
            </h3>
            <p className="section-description">
              Test capability responses directly via deterministic server endpoints.
            </p>
          </div>
        </div>

        <div className="tester-controls">
          <button
            className="btn btn-primary"
            onClick={() => runSampleTest('budget')}
            disabled={testLoading}
          >
            🔍 Test: Discover Waterproof Backpack (≤ ₹3,000)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => runSampleTest('bundle')}
            disabled={testLoading}
          >
            🏷️ Test: Check Price & Bundle Discount (Backpack + Pouch)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => runSampleTest('manifest')}
            disabled={testLoading}
          >
            📋 Test: Get Capability Manifest
          </button>
        </div>

        {activeTestResponse && (
          <pre className="code-output">{activeTestResponse}</pre>
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
