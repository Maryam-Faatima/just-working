import React, { useState, useEffect } from 'react';
import { uploadAgentFile, checkAgentSpecExists } from '../services/api';

export function LaunchRunModal({ isOpen, onClose, onStartRun }) {
  const [sourceMode, setSourceMode] = useState('git'); // 'git' | 'folder' | 'zip'
  const [gitUrl, setGitUrl] = useState('');
  const [localFolder, setLocalFolder] = useState('');
  const [agentName, setAgentName] = useState('');
  const [useLlm, setUseLlm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState('');

  // Spec detection & reuse
  const [hasSavedSpec, setHasSavedSpec] = useState(false);
  const [reuseSaved, setReuseSaved] = useState(true);

  // Questionnaire fields
  const [qPurpose, setQPurpose] = useState('');
  const [qOutOfScope, setQOutOfScope] = useState('');
  const [qAmbiguity, setQAmbiguity] = useState('ask');
  const [qFailureDef, setQFailureDef] = useState('');
  const [qRule1, setQRule1] = useState('');
  const [qRule1Severity, setQRule1Severity] = useState('critical');

  // Infer agent name from source and check if spec already exists
  useEffect(() => {
    let inferred = agentName;
    if (!inferred) {
      if (sourceMode === 'git' && gitUrl) {
        const parts = gitUrl.replace(/\.git$/, '').split('/');
        inferred = parts[parts.length - 1];
      } else if (sourceMode === 'folder' && localFolder) {
        const parts = localFolder.replace(/\/$/, '').split('/');
        inferred = parts[parts.length - 1];
      }
    }

    if (inferred) {
      checkAgentSpecExists(inferred).then(res => {
        if (res.exists && res.spec) {
          setHasSavedSpec(true);
          setReuseSaved(true);
          // Pre-fill answers from saved spec
          setQPurpose(res.spec.purpose || '');
          setQOutOfScope((res.spec.out_of_scope || []).join(', '));
          setQAmbiguity(res.spec.ambiguity_policy || 'ask');
          setQFailureDef(res.spec.failure_definition || '');
          if (res.spec.rules && res.spec.rules.length > 0) {
            setQRule1(res.spec.rules[0].text || '');
            setQRule1Severity(res.spec.rules[0].severity || 'critical');
          }
        } else {
          setHasSavedSpec(false);
        }
      });
    } else {
      setHasSavedSpec(false);
    }
  }, [gitUrl, localFolder, agentName, sourceMode]);

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await uploadAgentFile(file);
      setUploadedPath(res.path);
      const inferred = file.name.replace(/\.[^/.]+$/, '');
      if (!agentName) setAgentName(inferred);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let source = '';
    if (sourceMode === 'git') {
      source = gitUrl.trim();
    } else if (sourceMode === 'folder') {
      source = localFolder.trim();
    } else if (sourceMode === 'zip') {
      source = uploadedPath.trim();
    }

    if (!source) {
      alert('Please provide a repository URL, folder path, or upload a file.');
      return;
    }

    let spec = null;
    if (!reuseSaved || !hasSavedSpec) {
      if (!qPurpose.trim()) {
        alert('Please answer question 1: What is the agent supposed to achieve?');
        return;
      }

      const outOfScopeList = qOutOfScope.split(',').map(s => s.trim()).filter(Boolean);
      const rulesList = [];
      if (qRule1.trim()) {
        rulesList.push({
          id: 'R1',
          text: qRule1.trim(),
          kind: 'must_always',
          severity: qRule1Severity,
          check: 'judge'
        });
      }

      spec = {
        purpose: qPurpose.trim(),
        out_of_scope: outOfScopeList,
        failure_definition: qFailureDef.trim(),
        ambiguity_policy: qAmbiguity,
        rules: rulesList,
        run_config: {
          interface: 'python_module',
          repeats: 3
        }
      };
    }

    onStartRun({
      source,
      name: agentName.trim() || undefined,
      useLlm,
      reuseSavedSpec: hasSavedSpec && reuseSaved,
      spec
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div className="animate-fade-in" style={{
        background: '#fff',
        borderRadius: 'var(--radius-xl)',
        maxWidth: '680px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '30px',
        boxShadow: 'var(--shadow-float)',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            border: 'none',
            background: 'var(--bg-inset)',
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            cursor: 'pointer',
            fontWeight: 800
          }}
        >
          ✕
        </button>

        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Pipeline Runner
          </span>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '2px' }}>
            Configure Agent & Requirements
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
            Add your agent source code, then review or answer the Phase 0 requirements questionnaire.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Source Location */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              1. Source Code Location
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {[
                { id: 'git', label: 'Git Remote URL' },
                { id: 'folder', label: 'Local Folder' },
                { id: 'zip', label: 'Upload .zip' }
              ].map(tab => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setSourceMode(tab.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: sourceMode === tab.id ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                    background: sourceMode === tab.id ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
                    color: sourceMode === tab.id ? 'var(--accent)' : 'var(--ink-secondary)',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {sourceMode === 'git' && (
              <input
                type="text"
                placeholder="https://github.com/AnshikaaaSh/trip-planner-agent"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px'
                }}
              />
            )}

            {sourceMode === 'folder' && (
              <input
                type="text"
                placeholder="e.g. target_agent or /path/to/my_agent"
                value={localFolder}
                onChange={(e) => setLocalFolder(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px'
                }}
              />
            )}

            {sourceMode === 'zip' && (
              <div style={{
                border: '2px dashed var(--border-strong)',
                padding: '24px',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                background: 'var(--bg-surface-soft)'
              }}>
                <input
                  type="file"
                  accept=".zip,.tar.gz"
                  id="agentUpload"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <label
                  htmlFor="agentUpload"
                  style={{
                    display: 'inline-block',
                    background: '#fff',
                    border: '1.5px solid var(--border-default)',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isUploading ? 'Uploading...' : 'Browse .zip File'}
                </label>
                {uploadedPath && (
                  <div style={{ fontSize: '11px', color: 'var(--status-confirmed)', fontWeight: 700, marginTop: '8px' }}>
                    Uploaded: {uploadedPath}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name & LLM Checkbox */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Agent Name
              </label>
              <input
                type="text"
                placeholder="Inferred automatically if empty"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={useLlm}
                  onChange={(e) => setUseLlm(e.target.checked)}
                />
                Enable LLM Inference (Gemini/Groq)
              </label>
            </div>
          </div>

          {/* Saved Spec Reuse Banner */}
          {hasSavedSpec && (
            <div style={{
              background: '#DCFCE7',
              border: '1.5px solid #86EFAC',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#166534' }}>
                  ✓ Found Saved Answers From Previous Run!
                </div>
                <div style={{ fontSize: '12px', color: '#15803D', marginTop: '2px' }}>
                  Phase 0 spec answers already exist for this agent. Reuse them to skip typing questions again.
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={reuseSaved}
                  onChange={(e) => setReuseSaved(e.target.checked)}
                />
                Reuse Saved Answers
              </label>
            </div>
          )}

          {/* Questionnaire Section (Shown if no saved spec or user declined reuse) */}
          {(!hasSavedSpec || !reuseSaved) && (
            <div style={{ border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '18px', background: 'var(--bg-surface-soft)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
                2. Phase 0 Requirements Questionnaire
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                    1. What is the agent supposed to achieve? (Purpose) *
                  </label>
                  <input
                    type="text"
                    value={qPurpose}
                    onChange={(e) => setQPurpose(e.target.value)}
                    placeholder="e.g. Flight and hotel booking for travelers"
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '12.5px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                    2. What should it refuse or stay out of? (Out of Scope, comma-separated)
                  </label>
                  <input
                    type="text"
                    value={qOutOfScope}
                    onChange={(e) => setQOutOfScope(e.target.value)}
                    placeholder="e.g. payment processing, credit card details"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                      When ambiguous, the agent should:
                    </label>
                    <select
                      value={qAmbiguity}
                      onChange={(e) => setQAmbiguity(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '12.5px' }}
                    >
                      <option value="ask">Ask the user (Default)</option>
                      <option value="assume">Assume safe defaults</option>
                      <option value="refuse">Refuse to act</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                      Rule 1 Severity:
                    </label>
                    <select
                      value={qRule1Severity}
                      onChange={(e) => setQRule1Severity(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '12.5px' }}
                    >
                      <option value="critical">Critical</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                    Rule the code does not enforce (Safety Invariant):
                  </label>
                  <input
                    type="text"
                    value={qRule1}
                    onChange={(e) => setQRule1(e.target.value)}
                    placeholder="e.g. Must confirm before cancelling bookings"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '12.5px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid var(--border-default)',
                background: '#fff',
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: 'var(--radius-full)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-glow)'
              }}
            >
              ⚡ Run Pipeline Now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
