import React, { useState, useMemo, useRef } from 'react';

export function EvidenceGraphView({ evidenceData, reportData, currentAgent }) {
  const [activeTab, setActiveTab] = useState('visual'); // 'visual' | 'chains' | 'report' | 'json'
  const [filterType, setFilterType] = useState('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const svgRef = useRef(null);

  if (!evidenceData) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '56px 24px', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '14px',
            background: 'var(--bg-inset)',
            color: 'var(--ink-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '1px solid var(--border-default)'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M6 9v6M9 6h6M18 9v6" />
            </svg>
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink-primary)', marginBottom: '8px' }}>
            No Evidence Graph Available for {currentAgent || 'this agent'}
          </h3>
          <p style={{ color: 'var(--ink-muted)', fontSize: '14.5px', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
            Run the pipeline on this agent to execute <strong>Stage 7 (Evidence & Report)</strong> and synthesize the audit graph.
          </p>
        </div>
      </div>
    );
  }

  const nodes = evidenceData.nodes || [];
  const edges = evidenceData.edges || [];
  const stats = evidenceData.stats || {};

  // Group nodes by kind
  const modelEntries = useMemo(() => nodes.filter(n => n.kind === 'model_entry'), [nodes]);
  const codeLocations = useMemo(() => nodes.filter(n => n.kind === 'code_location'), [nodes]);
  const developerRules = useMemo(() => nodes.filter(n => n.kind === 'developer_rule'), [nodes]);
  const testSpecs = useMemo(() => nodes.filter(n => n.kind === 'test_spec'), [nodes]);
  const traces = useMemo(() => nodes.filter(n => n.kind === 'trace'), [nodes]);
  const findings = useMemo(() => nodes.filter(n => n.kind === 'finding'), [nodes]);

  // Node Map
  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Compute Active/Connected Subgraph when a node is selected or hovered
  const activeFocusId = selectedNodeId || hoveredNodeId;
  const connectedIds = useMemo(() => {
    if (!activeFocusId) return new Set();
    const set = new Set([activeFocusId]);

    // Direct incoming and outgoing edges
    edges.forEach(e => {
      if (e.from === activeFocusId) set.add(e.to);
      if (e.to === activeFocusId) set.add(e.from);
    });

    // 2-hop traversal so full chain lights up
    edges.forEach(e => {
      if (set.has(e.from)) set.add(e.to);
      if (set.has(e.to)) set.add(e.from);
    });

    return set;
  }, [activeFocusId, edges]);

  // -----------------------------------------------------------------
  // 2D GRAPH LAYOUT COMPUTATION FOR VISUAL CANVAS
  // -----------------------------------------------------------------
  const layout = useMemo(() => {
    // 4 Columns:
    // Col 0: Sources (Code Locations + Rules)
    // Col 1: Claims (Model Entries)
    // Col 2: Tests & Traces
    // Col 3: Findings
    const colX = [40, 420, 800, 1140];
    const nodeWidth = 260;
    const nodeHeight = 64;
    const verticalGap = 16;

    // Filter nodes if filterType is active
    const filteredNodes = nodes.filter(n => {
      if (filterType === 'CAPABILITY') return n.entry_type === 'capability';
      if (filterType === 'CONSTRAINT') return n.entry_type === 'constraint' || n.kind === 'developer_rule';
      if (filterType === 'WORKFLOW') return n.entry_type === 'workflow';
      if (filterType === 'FINDINGS') return n.kind === 'finding';
      return true;
    });

    const col0 = [...developerRules, ...codeLocations].filter(n => filteredNodes.some(fn => fn.id === n.id));
    const col1 = [...modelEntries].filter(n => filteredNodes.some(fn => fn.id === n.id));
    const col2 = [...testSpecs, ...traces].filter(n => filteredNodes.some(fn => fn.id === n.id));
    const col3 = [...findings].filter(n => filteredNodes.some(fn => fn.id === n.id));

    const maxColCount = Math.max(col0.length, col1.length, col2.length, col3.length, 6);
    const canvasHeight = Math.max(680, maxColCount * (nodeHeight + verticalGap) + 80);

    const positions = new Map();

    const placeCol = (items, cIdx) => {
      const totalH = items.length * (nodeHeight + verticalGap) - verticalGap;
      let startY = Math.max(50, (canvasHeight - totalH) / 2);
      items.forEach((item, rIdx) => {
        const y = startY + rIdx * (nodeHeight + verticalGap);
        positions.set(item.id, {
          x: colX[cIdx],
          y,
          width: nodeWidth,
          height: nodeHeight,
          node: item,
          col: cIdx
        });
      });
    };

    placeCol(col0, 0);
    placeCol(col1, 1);
    placeCol(col2, 2);
    placeCol(col3, 3);

    return {
      canvasWidth: 1450,
      canvasHeight,
      positions,
      colX,
      nodeWidth,
      nodeHeight
    };
  }, [nodes, codeLocations, developerRules, modelEntries, testSpecs, traces, findings, filterType]);

  // Selected node object
  const selectedNodeObj = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

  // -----------------------------------------------------------------
  // PDF REPORT DOWNLOAD HANDLER
  // -----------------------------------------------------------------
  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate and download the PDF report.');
      return;
    }

    const reportContent = reportData?.report || '';
    const dateStr = new Date().toLocaleString();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>GreatTest Audit Report - ${currentAgent}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 18mm 20mm 18mm;
              @bottom-right {
                content: counter(page);
                font-size: 9pt;
                color: #888;
              }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              line-height: 1.5;
              padding: 0;
              margin: 0;
              font-size: 11pt;
            }
            .header-banner {
              border-bottom: 3px solid #E05D38;
              padding-bottom: 12px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .title {
              font-size: 24pt;
              font-weight: 800;
              color: #000;
              margin: 0;
            }
            .subtitle {
              font-size: 11pt;
              color: #4B5563;
              margin-top: 4px;
            }
            .meta {
              text-align: right;
              font-size: 9pt;
              color: #6B7280;
            }
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 24px;
            }
            .kpi-card {
              border: 1px solid #D1D5DB;
              border-radius: 6px;
              padding: 10px 14px;
              background: #F9FAFB;
            }
            .kpi-label {
              font-size: 8pt;
              text-transform: uppercase;
              font-weight: 700;
              color: #6B7280;
            }
            .kpi-value {
              font-size: 18pt;
              font-weight: 800;
              color: #111827;
              margin-top: 2px;
            }
            h2 {
              font-size: 14pt;
              font-weight: 800;
              color: #1F2937;
              border-bottom: 1.5px solid #E5E7EB;
              padding-bottom: 6px;
              margin-top: 28px;
              margin-bottom: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 14px 0 24px;
              font-size: 9.5pt;
            }
            th, td {
              border: 1px solid #E5E7EB;
              padding: 8px 10px;
              text-align: left;
            }
            th {
              background-color: #F3F4F6;
              font-weight: 700;
              color: #374151;
            }
            tr:nth-child(even) {
              background-color: #FAFAFA;
            }
            .badge {
              display: inline-block;
              padding: 2px 7px;
              border-radius: 4px;
              font-weight: 700;
              font-size: 8pt;
              font-family: monospace;
            }
            .badge-verified { background: #DCFCE7; color: #166534; }
            .badge-fail { background: #FEE2E2; color: #991B1B; }
            .badge-rule { background: #DBEAFE; color: #1E40AF; }
            .badge-cap { background: #F3E8FF; color: #6B21A8; }
            .footer-note {
              margin-top: 40px;
              padding-top: 12px;
              border-top: 1px dashed #D1D5DB;
              font-size: 8.5pt;
              color: #9CA3AF;
              text-align: center;
            }
            @media print {
              .no-print { display: none !important; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="background: #111827; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-radius: 6px;">
            <div style="font-size: 13px; font-weight: 700;">
              📄 Print Preview — Click the button or press Ctrl+P / Cmd+P to save as PDF
            </div>
            <button onclick="window.print()" style="background: #E05D38; color: #fff; border: none; padding: 8px 18px; font-weight: 700; border-radius: 4px; cursor: pointer;">
              Print / Save as PDF
            </button>
          </div>

          <div class="header-banner">
            <div>
              <h1 class="title">GreatTest Audit Report</h1>
              <div class="subtitle">Evidence-based adaptive testing framework for conversational agents</div>
            </div>
            <div class="meta">
              <strong>Agent:</strong> ${currentAgent}<br />
              <strong>Generated:</strong> ${dateStr}<br />
              <strong>Framework:</strong> GreatTest v0.2.1
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Graph Nodes</div>
              <div class="kpi-value">${stats.nodes || nodes.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Directed Edges</div>
              <div class="kpi-value">${stats.edges || edges.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Model Claims</div>
              <div class="kpi-value">${modelEntries.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Code Evidence</div>
              <div class="kpi-value">${codeLocations.length}</div>
            </div>
          </div>

          <h2>1. Executive Summary & Graph Metrics</h2>
          <table>
            <thead>
              <tr><th>Node Classification</th><th>Quantity</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Behavioral Model Entries</strong></td><td>${modelEntries.length}</td><td>Capabilities, workflows, and constraint assertions in Model V0/V1</td></tr>
              <tr><td><strong>Code Location Foundations</strong></td><td>${codeLocations.length}</td><td>AST-extracted function tools and line boundaries</td></tr>
              <tr><td><strong>Phase 0 Developer Rules</strong></td><td>${developerRules.length}</td><td>Contractual constraints stated during Phase 0 specification</td></tr>
              <tr><td><strong>Test Scenarios & Traces</strong></td><td>${testSpecs.length + traces.length}</td><td>Adversarial test cases and recorded conversation traces</td></tr>
              <tr><td><strong>Reconciliation Findings</strong></td><td>${findings.length}</td><td>Verified passes or contradicted failure findings</td></tr>
            </tbody>
          </table>

          <h2>2. Behavioral Claims & Traceable Evidence</h2>
          <table>
            <thead>
              <tr><th>Claim ID</th><th>Type</th><th>Name</th><th>Status</th><th>Confidence</th><th>Detected By</th></tr>
            </thead>
            <tbody>
              ${modelEntries.map(e => `
                <tr>
                  <td><code>${e.id}</code></td>
                  <td><span class="badge badge-cap">${e.entry_type}</span></td>
                  <td><strong>${e.name}</strong></td>
                  <td><span class="badge ${e.status === 'confirmed' ? 'badge-verified' : 'badge-rule'}">${e.status}</span></td>
                  <td>${(e.confidence * 100).toFixed(0)}%</td>
                  <td>${e.detected_by || 'rule'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>3. Reconciliation Findings</h2>
          ${findings.length === 0 ? '<p><em>No failure findings recorded. All active claims unverified or confirmed.</em></p>' : `
            <table>
              <thead>
                <tr><th>Finding ID</th><th>Target</th><th>Result</th><th>Severity</th><th>Description</th></tr>
              </thead>
              <tbody>
                ${findings.map(f => `
                  <tr>
                    <td><code>${f.finding_id || f.id}</code></td>
                    <td><code>${f.target_id || '-'}</code></td>
                    <td><span class="badge ${f.result === 'fail' ? 'badge-fail' : 'badge-verified'}">${f.result}</span></td>
                    <td><strong>${f.severity}</strong></td>
                    <td>${f.description || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}

          <div class="footer-note">
            GreatTest Evidence Traceability Report &bull; Verified against JSON Schema Draft 2020-12
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadMarkdown = () => {
    const text = reportData?.report || `# Evidence Report — ${currentAgent}\n\nNo report data available.`;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${currentAgent}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1360px', margin: '16px auto 80px', padding: '0 24px' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--accent)',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: '6px'
          }}>
            <span>✦</span> Phase 3: Evidence Graph & Audit Trail
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.6px', margin: 0 }}>
            Evidence Traceability Graph
          </h1>
          <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px', maxWidth: '780px' }}>
            Interactive visual flow connecting source code AST foundations and Phase 0 specs to Behavioral Model claims and runtime findings.
          </p>
        </div>

        {/* Action Button: Download as PDF only */}
        <div>
          <button
            onClick={handleDownloadPDF}
            style={{
              background: '#000000',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 22px',
              borderRadius: 'var(--radius-full)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <span>Download as PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Total Nodes</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '2px' }}>
            {stats.nodes || nodes.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>{stats.edges || edges.length} directed edges</div>
        </div>

        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Code Evidence</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
            {codeLocations.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>AST source lines</div>
        </div>

        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Model Claims</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: 'var(--accent)', marginTop: '2px' }}>
            {modelEntries.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>Caps, Wfs & Constraints</div>
        </div>

        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Phase 0 Rules</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: '#3B82F6', marginTop: '2px' }}>
            {developerRules.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>Developer contracts</div>
        </div>

        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Test Findings</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: findings.length > 0 ? '#DC2626' : '#6B7280', marginTop: '2px' }}>
            {findings.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>Runtime verdicts</div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1.5px solid var(--border-default)',
        marginBottom: '20px',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'visual', label: '✦ Visual Graph Canvas' },
            { id: 'chains', label: 'Traceability Flow Cards' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '10px 16px',
                fontSize: '13.5px',
                fontWeight: activeTab === tab.id ? 800 : 600,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--ink-secondary)',
                borderBottom: activeTab === tab.id ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Chips for Visual & Chain views */}
        {(activeTab === 'visual' || activeTab === 'chains') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Filter:</span>
            {['ALL', 'CAPABILITY', 'CONSTRAINT', 'WORKFLOW'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  border: filterType === type ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                  background: filterType === type ? 'var(--accent-light)' : '#fff',
                  color: filterType === type ? 'var(--accent)' : 'var(--ink-secondary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer'
                }}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: INTERACTIVE SVG VISUAL GRAPH CANVAS                       */}
      {/* ============================================================== */}
      {activeTab === 'visual' && (
        <div style={{
          background: '#fff',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Canvas Toolbar & Legend */}
          <div style={{
            padding: '12px 20px',
            background: 'var(--bg-surface-soft)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Column Labels */}
            <div style={{ display: 'flex', gap: '24px', fontSize: '11.5px', fontWeight: 800 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10B981' }} />
                <span style={{ color: 'var(--ink-primary)' }}>1. Evidence Sources</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#E05D38' }} />
                <span style={{ color: 'var(--ink-primary)' }}>2. Model Claims</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#F59E0B' }} />
                <span style={{ color: 'var(--ink-primary)' }}>3. Tests & Traces</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#DC2626' }} />
                <span style={{ color: 'var(--ink-primary)' }}>4. Reconciliation Findings</span>
              </div>
            </div>

            {/* Canvas Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>Zoom: {(zoomLevel * 100).toFixed(0)}%</span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(1.5, prev + 0.1))}
                style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                +
              </button>
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.1))}
                style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                -
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                Reset
              </button>
              {selectedNodeId && (
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: 'var(--ink-secondary)', cursor: 'pointer' }}
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>

          {/* SVG Canvas Area with horizontal scrolling */}
          <div style={{
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight: '720px',
            background: '#F8FAFC',
            position: 'relative',
            padding: '24px'
          }}>
            <svg
              ref={svgRef}
              width={layout.canvasWidth * zoomLevel}
              height={layout.canvasHeight * zoomLevel}
              viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
              style={{ display: 'block', margin: '0 auto', transition: 'width 0.1s ease, height 0.1s ease' }}
            >
              <defs>
                {/* Background dot grid pattern */}
                <pattern id="ev-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="12" cy="12" r="1" fill="#E2E8F0" />
                </pattern>

                {/* Arrowhead marker - Normal */}
                <marker id="ev-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94A3B8" />
                </marker>

                {/* Arrowhead marker - Highlighted */}
                <marker id="ev-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#E05D38" />
                </marker>

                {/* Drop shadow filter */}
                <filter id="node-shadow" x="-5%" y="-10%" width="110%" height="125%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.06" />
                </filter>
                <filter id="node-glow" x="-10%" y="-15%" width="120%" height="135%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#E05D38" floodOpacity="0.45" />
                </filter>
              </defs>

              <rect width={layout.canvasWidth} height={layout.canvasHeight} fill="#F8FAFC" />
              <rect width={layout.canvasWidth} height={layout.canvasHeight} fill="url(#ev-grid)" />

              {/* Column Guides */}
              {layout.colX.map((x, idx) => (
                <line
                  key={idx}
                  x1={x + layout.nodeWidth / 2}
                  y1={20}
                  x2={x + layout.nodeWidth / 2}
                  y2={layout.canvasHeight - 20}
                  stroke="#E2E8F0"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />
              ))}

              {/* EDGES: Bezier Curves */}
              {edges.map((edge, eIdx) => {
                const src = layout.positions.get(edge.from);
                const dst = layout.positions.get(edge.to);
                if (!src || !dst) return null;

                const startX = src.x + src.width;
                const startY = src.y + src.height / 2;
                const endX = dst.x;
                const endY = dst.y + dst.height / 2;

                const dx = Math.max(50, (endX - startX) * 0.45);
                const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

                const isEdgeActive = activeFocusId && (
                  (edge.from === activeFocusId || edge.to === activeFocusId) ||
                  (connectedIds.has(edge.from) && connectedIds.has(edge.to))
                );

                const isDimmed = activeFocusId && !isEdgeActive;

                return (
                  <g key={`edge-${eIdx}`} opacity={isDimmed ? 0.15 : 1} style={{ transition: 'opacity 0.2s ease' }}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isEdgeActive ? '#E05D38' : '#94A3B8'}
                      strokeWidth={isEdgeActive ? 2.5 : 1.5}
                      markerEnd={isEdgeActive ? 'url(#ev-arrow-active)' : 'url(#ev-arrow)'}
                    />
                    {/* Relation text on middle of curve */}
                    <text
                      x={(startX + endX) / 2}
                      y={(startY + endY) / 2 - 6}
                      textAnchor="middle"
                      fill={isEdgeActive ? '#E05D38' : '#64748B'}
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      {edge.relation}
                    </text>
                  </g>
                );
              })}

              {/* NODES: Rich Interactive SVG Cards */}
              {Array.from(layout.positions.values()).map(({ x, y, width, height, node }) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isConnected = activeFocusId && connectedIds.has(node.id);
                const isDimmed = activeFocusId && !isConnected;

                // Color accent by kind
                let accentColor = '#64748B';
                let headerBg = '#F1F5F9';
                let iconText = 'N';

                if (node.kind === 'code_location') {
                  accentColor = '#10B981';
                  headerBg = '#ECFDF5';
                  iconText = 'C';
                } else if (node.kind === 'developer_rule') {
                  accentColor = '#3B82F6';
                  headerBg = '#EFF6FF';
                  iconText = 'R';
                } else if (node.kind === 'model_entry') {
                  accentColor = node.entry_type === 'constraint' ? '#E05D38' : '#8B5CF6';
                  headerBg = node.entry_type === 'constraint' ? '#FCEFEA' : '#F5F3FF';
                  iconText = node.entry_type === 'constraint' ? '!' : 'M';
                } else if (node.kind === 'finding') {
                  accentColor = node.result === 'fail' ? '#DC2626' : '#16A34A';
                  headerBg = node.result === 'fail' ? '#FEE2E2' : '#DCFCE7';
                  iconText = node.result === 'fail' ? '✕' : '✓';
                }

                const displayName = node.name || (node.file ? `${node.file}:${node.lines}` : (node.description || node.id));

                return (
                  <g
                    key={node.id}
                    transform={`translate(${x}, ${y})`}
                    opacity={isDimmed ? 0.25 : 1}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    {/* Node Background Box */}
                    <rect
                      width={width}
                      height={height}
                      rx={8}
                      fill="#FFFFFF"
                      stroke={isSelected ? '#E05D38' : (isHovered ? accentColor : '#CBD5E1')}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      filter={isSelected ? 'url(#node-glow)' : 'url(#node-shadow)'}
                    />

                    {/* Left Accent Color Strip */}
                    <rect
                      x={0}
                      y={0}
                      width={5}
                      height={height}
                      rx={2}
                      fill={accentColor}
                    />

                    {/* Node Kind Badge Circle */}
                    <rect
                      x={12}
                      y={10}
                      width={18}
                      height={18}
                      rx={4}
                      fill={headerBg}
                      stroke={accentColor}
                      strokeWidth={1}
                    />
                    <text
                      x={21}
                      y={23}
                      textAnchor="middle"
                      fill={accentColor}
                      fontSize="10"
                      fontWeight="800"
                    >
                      {iconText}
                    </text>

                    {/* Node ID */}
                    <text
                      x={36}
                      y={23}
                      fill="#0F172A"
                      fontSize="11.5"
                      fontFamily="monospace"
                      fontWeight="800"
                    >
                      {node.id.length > 24 ? node.id.slice(0, 22) + '..' : node.id}
                    </text>

                    {/* Node Label / Name */}
                    <text
                      x={14}
                      y={46}
                      fill="#334155"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {displayName.length > 32 ? displayName.slice(0, 30) + '...' : displayName}
                    </text>

                    {/* Confidence or Status badge if model_entry */}
                    {node.kind === 'model_entry' && (
                      <g transform={`translate(${width - 65}, 10)`}>
                        <rect width={55} height={16} rx={3} fill={node.status === 'confirmed' ? '#DCFCE7' : '#F1F5F9'} />
                        <text x={27} y={12} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#475569">
                          {(node.confidence * 100).toFixed(0)}% conf
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Node Inspector Bottom Drawer / Card */}
          {selectedNodeObj && (
            <div style={{
              padding: '16px 24px',
              background: '#FFFFFF',
              borderTop: '1.5px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                  fontWeight: 800,
                  fontSize: '11px',
                  textTransform: 'uppercase'
                }}>
                  {selectedNodeObj.kind}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                  {selectedNodeObj.id}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--ink-secondary)' }}>
                  {selectedNodeObj.name || selectedNodeObj.description || selectedNodeObj.file}
                </span>
                {selectedNodeObj.confidence !== undefined && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--ink-muted)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px' }}>
                    Confidence: {(selectedNodeObj.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--ink-muted)' }}>
                  Connected to {connectedIds.size - 1} node(s) in evidence chain
                </span>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-default)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11.5px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TRACEABILITY FLOW CARDS                                  */}
      {/* ============================================================== */}
      {activeTab === 'chains' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {modelEntries.map(entry => {
            const upstream = edges.filter(e => e.to === entry.id).map(e => ({ node: nodeMap.get(e.from), rel: e.relation })).filter(x => x.node);
            const downstreamFindings = edges.filter(e => e.from === entry.id && e.relation === 'has_finding').map(e => nodeMap.get(e.to)).filter(Boolean);

            return (
              <div
                key={entry.id}
                style={{
                  background: '#fff',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--border-default)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-card)'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800, background: 'var(--bg-inset)', padding: '3px 8px', borderRadius: '6px' }}>
                      {entry.id}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-light)', padding: '2px 8px', borderRadius: '4px' }}>
                      {entry.entry_type}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-primary)' }}>
                      {entry.name}
                    </span>
                  </div>

                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--ink-secondary)' }}>
                    Confidence: {(entry.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* 3-Column Visual Chain Flow */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: '14px', background: 'var(--bg-surface-soft)', padding: '16px', borderRadius: '8px' }}>
                  {/* Left: Foundation */}
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      1. Evidence Foundation
                    </div>
                    {upstream.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No static source node linked</div>
                    ) : (
                      upstream.map(({ node, rel }, i) => (
                        <div key={i} style={{ background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-default)', marginBottom: '4px' }}>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>{rel}</span>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
                            {node.file ? `${node.file}:${node.lines}` : (node.description || node.id)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ fontSize: '18px', color: 'var(--ink-muted)' }}>→</div>

                  {/* Center: Claim */}
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1.5px solid var(--border-default)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>2. Verified Claim</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '2px' }}>
                      {entry.id}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-secondary)', marginTop: '2px' }}>Status: <strong>{entry.status}</strong></div>
                  </div>

                  <div style={{ fontSize: '18px', color: 'var(--ink-muted)' }}>→</div>

                  {/* Right: Finding Verdict */}
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      3. Test Verdict
                    </div>
                    {downstreamFindings.length === 0 ? (
                      <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px dashed var(--border-default)', fontSize: '11.5px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                        Unchallenged (No findings)
                      </div>
                    ) : (
                      downstreamFindings.map((f, i) => (
                        <div key={i} style={{ background: f.result === 'fail' ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${f.result === 'fail' ? '#FCA5A5' : '#86EFAC'}`, padding: '8px', borderRadius: '6px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, color: f.result === 'fail' ? '#DC2626' : '#16A34A' }}>
                            {f.finding_id || f.id} [{f.result}]
                          </span>
                          <div style={{ fontSize: '11px', color: 'var(--ink-secondary)', marginTop: '2px' }}>{f.description}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
