import React, { useState, useEffect } from 'react';
import { checkAgentSpecExists, saveAgentSpec, uploadAgentFile } from '../services/api';

const KINDS = [
  { id: 'must_always', label: 'Must Always', desc: 'Invariable safety invariant' },
  { id: 'must_never', label: 'Must Never', desc: 'Strict prohibition / boundary' },
  { id: 'ordering', label: 'Ordering', desc: 'Strict sequence constraint' }
];

const SEVERITIES = [
  { id: 'critical', label: 'Critical', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
  { id: 'major', label: 'Major', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  { id: 'minor', label: 'Minor', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' }
];

const POLICIES = [
  {
    id: 'ask',
    label: 'Ask User (Default)',
    desc: 'When required information is missing or ambiguous, the agent must ask the user instead of guessing.'
  },
  {
    id: 'assume',
    label: 'Assume Sensible Default',
    desc: 'When required information is missing or ambiguous, the agent may assume a default and state what it assumed.'
  },
  {
    id: 'refuse',
    label: 'Refuse Action',
    desc: 'When required information is missing or ambiguous, the agent must decline to continue the action.'
  }
];

const MOCKS = [
  { id: 'none', label: 'Call Real Service (None)', desc: 'Invokes external API directly' },
  { id: 'developer', label: 'Developer Mock', desc: 'Uses developer-supplied mock routines' },
  { id: 'generate', label: 'Auto-Generate Mock', desc: 'Synthesizes mock responses automatically' }
];

const AUDIENCES = [
  { id: 'developer', label: 'Developer', desc: 'Deep stack traces & root-cause details' },
  { id: 'qa', label: 'QA Engineer', desc: 'Failure rates & test coverage matrices' },
  { id: 'manager', label: 'Manager / Lead', desc: 'High-level safety posture & summaries' }
];

export function RequirementsQuestionnaireView({
  currentAgent,
  specData,
  onSaveSpec,
  onRunPipeline,
  onNavigateToSpec,
  onBack
}) {
  // Target Agent & Source
  const [targetAgent, setTargetAgent] = useState(currentAgent || '');
  const [sourceMode, setSourceMode] = useState('git'); // 'git' | 'folder' | 'zip'
  const [gitUrl, setGitUrl] = useState('');
  const [localFolder, setLocalFolder] = useState('');
  const [uploadedPath, setUploadedPath] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [sourceLocation, setSourceLocation] = useState('');
  const [useLlm, setUseLlm] = useState(false);
  const [hasSavedSpec, setHasSavedSpec] = useState(false);
  const [savedSpecRulesCount, setSavedSpecRulesCount] = useState(0);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Question 1: Purpose
  const [purpose, setPurpose] = useState('');
  
  // Question 2: Out of Scope
  const [outOfScopeInput, setOutOfScopeInput] = useState('');
  const [outOfScopeList, setOutOfScopeList] = useState([]);

  // Question 3: Failure Definition
  const [failureDef, setFailureDef] = useState('');

  // Invisible Capabilities
  const [capabilitiesInput, setCapabilitiesInput] = useState('');
  const [capabilitiesList, setCapabilitiesList] = useState([]);

  // Questions 4-6: Rules the code does not enforce
  const [rules, setRules] = useState([]);
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleKind, setNewRuleKind] = useState('must_always');
  const [newRuleSeverity, setNewRuleSeverity] = useState('critical');
  const [newRuleAppliesTo, setNewRuleAppliesTo] = useState('');
  const [newRuleCheck, setNewRuleCheck] = useState('judge');

  // Question 7: Ambiguity Policy
  const [ambiguityPolicy, setAmbiguityPolicy] = useState('ask');

  // Question 8: Weak Spots / Suspected Fragility
  const [weakSpotsText, setWeakSpotsText] = useState('');

  // Question 9: Problematic User Behaviors
  const [userBehaviorsText, setUserBehaviorsText] = useState('');

  // Questions 10-12: External Services
  const [services, setServices] = useState([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceUnsafe, setNewServiceUnsafe] = useState(false);
  const [newServiceMock, setNewServiceMock] = useState('none');
  const [newServiceFailures, setNewServiceFailures] = useState('');

  // Question 13: Quality / Reply Notes
  const [qualityNotes, setQualityNotes] = useState('');

  // Question 14: Pass Thresholds
  const [maxCriticalFailures, setMaxCriticalFailures] = useState(0);
  const [minPassRate, setMinPassRate] = useState('');

  // Question 15: Reference Material
  const [referenceMaterialText, setReferenceMaterialText] = useState('');

  // Question 16: Report Settings
  const [reportAudience, setReportAudience] = useState('developer');
  const [reportEmphasis, setReportEmphasis] = useState('');

  // Run Configuration
  const [entryPoint, setEntryPoint] = useState('');
  const [interfaceType, setInterfaceType] = useState('python_module');
  const [repeats, setRepeats] = useState(3);

  // Sync with currentAgent or loaded specData
  useEffect(() => {
    if (currentAgent) {
      setTargetAgent(currentAgent);
    }
  }, [currentAgent]);

  // Auto-infer targetAgent from Git URL or local folder
  useEffect(() => {
    let inferred = '';
    if (sourceMode === 'git' && gitUrl) {
      const parts = gitUrl.replace(/\.git$/, '').replace(/\/$/, '').split('/');
      inferred = parts[parts.length - 1];
    } else if (sourceMode === 'folder' && localFolder) {
      const parts = localFolder.replace(/\/$/, '').split('/');
      inferred = parts[parts.length - 1];
    }
    if (inferred && (!targetAgent || targetAgent === 'trip-planner-agent')) {
      setTargetAgent(inferred);
    }
  }, [gitUrl, localFolder, sourceMode]);

  // Check if saved spec exists for targetAgent
  useEffect(() => {
    if (targetAgent && targetAgent.trim()) {
      checkAgentSpecExists(targetAgent.trim()).then(res => {
        if (res.exists && res.spec) {
          setHasSavedSpec(true);
          setSavedSpecRulesCount(res.rules_count || res.spec?.rules?.length || 0);
        } else {
          setHasSavedSpec(false);
          setSavedSpecRulesCount(0);
        }
      }).catch(() => {
        setHasSavedSpec(false);
        setSavedSpecRulesCount(0);
      });
    }
  }, [targetAgent]);

  // Reset all questionnaire fields to clear out previous agent data
  const clearFormState = () => {
    setPurpose('');
    setOutOfScopeList([]);
    setOutOfScopeInput('');
    setFailureDef('');
    setCapabilitiesList([]);
    setCapabilitiesInput('');
    setRules([]);
    setAmbiguityPolicy('ask');
    setWeakSpotsText('');
    setUserBehaviorsText('');
    setServices([]);
    setQualityNotes('');
    setMaxCriticalFailures(0);
    setMinPassRate('');
    setReferenceMaterialText('');
    setReportAudience('developer');
    setReportEmphasis('');
    setEntryPoint('');
    setInterfaceType('python_module');
    setRepeats(3);
    setHasSavedSpec(false);
    setSavedSpecRulesCount(0);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await uploadAgentFile(file);
      setUploadedPath(res.path);
      const inferred = file.name.replace(/\.[^/.]+$/, '');
      setTargetAgent(inferred);
      clearFormState(); // Fresh state for newly uploaded agent
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Load existing spec into form fields
  const loadSpecIntoState = (sp) => {
    if (!sp) return;
    setPurpose(sp.purpose || '');
    setOutOfScopeList(sp.out_of_scope || []);
    setOutOfScopeInput((sp.out_of_scope || []).join(', '));
    setFailureDef(sp.failure_definition || '');
    setCapabilitiesList(sp.capabilities || []);
    setCapabilitiesInput((sp.capabilities || []).join(', '));
    setRules(sp.rules || []);
    setAmbiguityPolicy(sp.ambiguity_policy || 'ask');
    setWeakSpotsText((sp.weak_spots || []).join('\n'));
    setUserBehaviorsText((sp.user_behaviors || []).join('\n'));
    setServices(sp.external_services || []);
    
    setQualityNotes(sp.quality?.notes || '');
    setMaxCriticalFailures(sp.quality?.pass_threshold?.max_critical_failures ?? 0);
    setMinPassRate(sp.quality?.pass_threshold?.min_pass_rate !== undefined ? String(sp.quality.pass_threshold.min_pass_rate) : '');

    setReferenceMaterialText((sp.reference_material || []).join('\n'));
    setReportAudience(sp.report?.audience || 'developer');
    setReportEmphasis((sp.report?.emphasis || []).join(', '));

    setEntryPoint(sp.run_config?.entry_point || '');
    setInterfaceType(sp.run_config?.interface || 'python_module');
    setRepeats(sp.run_config?.repeats ?? 3);
  };

  useEffect(() => {
    if (specData) {
      loadSpecIntoState(specData);
    }
  }, [specData]);

  // Load saved spec from server
  const handleLoadSavedSpec = async () => {
    if (!targetAgent) return;
    try {
      const res = await checkAgentSpecExists(targetAgent);
      if (res.exists && res.spec) {
        loadSpecIntoState(res.spec);
        setSaveSuccessMsg(`Loaded saved Phase 0 specification for ${targetAgent}`);
        setTimeout(() => setSaveSuccessMsg(null), 3500);
      } else {
        alert(`No saved spec found for agent '${targetAgent}'.`);
      }
    } catch (err) {
      alert(`Error loading spec: ${err.message}`);
    }
  };

  // Compile full spec object adhering to requirements_spec.schema.json
  const buildSpecPayload = () => {
    const parsedOutOfScope = outOfScopeInput
      ? outOfScopeInput.split(/,|\n/).map(s => s.trim()).filter(Boolean)
      : outOfScopeList;

    const parsedCapabilities = capabilitiesInput
      ? capabilitiesInput.split(/,|\n/).map(s => s.trim()).filter(Boolean)
      : capabilitiesList;

    const parsedWeakSpots = weakSpotsText
      ? weakSpotsText.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const parsedUserBehaviors = userBehaviorsText
      ? userBehaviorsText.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const parsedReference = referenceMaterialText
      ? referenceMaterialText.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const parsedEmphasis = reportEmphasis
      ? reportEmphasis.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      agent: targetAgent.trim() || undefined,
      purpose: purpose.trim(),
      out_of_scope: parsedOutOfScope.length > 0 ? parsedOutOfScope : undefined,
      failure_definition: failureDef.trim() || undefined,
      capabilities: parsedCapabilities.length > 0 ? parsedCapabilities : undefined,
      rules: rules.map((r, i) => ({
        id: r.id || `R${i + 1}`,
        text: r.text,
        kind: r.kind || 'must_always',
        severity: r.severity || 'major',
        applies_to: r.applies_to && r.applies_to.length > 0 ? r.applies_to : undefined,
        check: r.check || 'judge'
      })),
      ambiguity_policy: ambiguityPolicy,
      weak_spots: parsedWeakSpots.length > 0 ? parsedWeakSpots : undefined,
      user_behaviors: parsedUserBehaviors.length > 0 ? parsedUserBehaviors : undefined,
      external_services: services.length > 0 ? services : undefined,
      quality: {
        notes: qualityNotes.trim() || undefined,
        pass_threshold: {
          max_critical_failures: Number(maxCriticalFailures) || 0,
          min_pass_rate: minPassRate !== '' ? parseFloat(minPassRate) : undefined
        }
      },
      reference_material: parsedReference.length > 0 ? parsedReference : undefined,
      report: {
        audience: reportAudience,
        emphasis: parsedEmphasis.length > 0 ? parsedEmphasis : undefined
      },
      run_config: {
        entry_point: entryPoint.trim() || undefined,
        interface: interfaceType,
        repeats: Number(repeats) || 3
      }
    };

    return payload;
  };

  // Rule operations
  const handleAddRule = (e) => {
    e.preventDefault();
    if (!newRuleText.trim() || newRuleText.trim().length < 5) {
      alert('Rule text must be at least 5 characters.');
      return;
    }
    const appliesList = newRuleAppliesTo
      ? newRuleAppliesTo.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const nextId = `R${rules.length + 1}`;
    setRules(prev => [
      ...prev,
      {
        id: nextId,
        text: newRuleText.trim(),
        kind: newRuleKind,
        severity: newRuleSeverity,
        applies_to: appliesList,
        check: newRuleCheck
      }
    ]);
    setNewRuleText('');
    setNewRuleAppliesTo('');
  };

  const handleRemoveRule = (index) => {
    setRules(prev => prev.filter((_, i) => i !== index));
  };

  // Service operations
  const handleAddService = (e) => {
    e.preventDefault();
    if (!newServiceName.trim()) {
      alert('Please enter a service name.');
      return;
    }
    const failuresList = newServiceFailures
      ? newServiceFailures.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    setServices(prev => [
      ...prev,
      {
        name: newServiceName.trim(),
        unsafe_to_hit: newServiceUnsafe,
        mock: newServiceMock,
        failure_modes: failuresList.length > 0 ? failuresList : undefined
      }
    ]);
    setNewServiceName('');
    setNewServiceUnsafe(false);
    setNewServiceMock('none');
    setNewServiceFailures('');
  };

  const handleRemoveService = (index) => {
    setServices(prev => prev.filter((_, i) => i !== index));
  };

  // Save Spec
  const handleSave = async () => {
    if (!purpose.trim()) {
      alert('Question 1 (Purpose) is required and must be at least 5 characters.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = buildSpecPayload();
      await saveAgentSpec(targetAgent, payload);
      setSaveSuccessMsg(`Specification saved successfully to outputs/${targetAgent}/spec.json`);
      if (onSaveSpec) onSaveSpec(targetAgent, payload);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save & Run
  const handleSaveAndRun = async () => {
    let source = '';
    if (sourceMode === 'git') {
      source = gitUrl.trim();
    } else if (sourceMode === 'folder') {
      source = localFolder.trim();
    } else if (sourceMode === 'zip') {
      source = uploadedPath.trim();
    }
    if (!source) {
      source = sourceLocation.trim();
    }
    if (!source && !targetAgent) {
      alert('Please provide a Git repository URL, local folder path, or uploaded file archive.');
      return;
    }
    if (!purpose.trim() || purpose.trim().length < 5) {
      alert('Question 1 (What is the agent supposed to achieve?) is required and must be at least 5 characters.');
      return;
    }
    const payload = buildSpecPayload();
    if (onRunPipeline) {
      onRunPipeline({
        source: source || targetAgent,
        name: targetAgent.trim() || undefined,
        useLlm,
        reuseSavedSpec: false,
        spec: payload
      });
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1240px', margin: '16px auto 100px', padding: '0 24px' }}>
      
      {/* Header Banner */}
      <div style={{ marginBottom: '24px' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              border: '1.5px solid var(--border-default)',
              background: '#fff',
              color: 'var(--ink-secondary)',
              fontWeight: 700,
              fontSize: '12px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>←</span>
            <span>Back</span>
          </button>
        )}
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
          Phase 0 Developer Requirements Specification
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '32px', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.7px' }}>
              Phase 0 Requirements Questionnaire
            </h1>
            <p style={{ color: 'var(--ink-secondary)', fontSize: '14.5px', marginTop: '4px', maxWidth: '780px', lineHeight: 1.5 }}>
              Answer what the source code does not say. Every rule compiles into unverified safety constraints in Behavioral Model V0 and grading criteria in the Rubric.
            </p>
          </div>

          {/* Quick Nav / Spec View Button */}
          {onNavigateToSpec && (
            <button
              onClick={onNavigateToSpec}
              style={{
                border: '1px solid var(--border-default)',
                background: '#fff',
                color: 'var(--ink-secondary)',
                fontWeight: 700,
                fontSize: '12px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>View Compiled Specs & Rubric</span>
              <span>↗</span>
            </button>
          )}
        </div>
      </div>

      {/* Agent Source & Configuration Card */}
      <div style={{
        background: '#fff',
        border: '1.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px 24px',
        boxShadow: 'var(--shadow-card)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              Agent Repository & Source
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)', margin: '2px 0 0' }}>
              Enter the Git repository URL, local folder path, or code archive to analyze.
            </p>
          </div>

          {/* Mode Switcher & Reset Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={clearFormState}
              title="Clear all fields to start a new questionnaire"
              style={{
                border: '1px solid var(--border-default)',
                background: '#fff',
                color: 'var(--ink-muted)',
                fontWeight: 600,
                fontSize: '11px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}
            >
              Clear Fields
            </button>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-inset)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
              {[
                { id: 'git', label: 'Git Repository URL' },
                { id: 'folder', label: 'Local Directory' },
                { id: 'zip', label: 'Upload Archive' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSourceMode(tab.id);
                  }}
                  style={{
                    border: 'none',
                    background: sourceMode === tab.id ? '#fff' : 'transparent',
                    color: sourceMode === tab.id ? 'var(--ink-primary)' : 'var(--ink-muted)',
                    fontWeight: sourceMode === tab.id ? 700 : 500,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    boxShadow: sourceMode === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Source Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.8fr) minmax(200px, 1fr) auto', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {sourceMode === 'git' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Git Repository URL *
              </label>
              <input
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/gaurav-oberoi/support-agent-hitl"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--ink-primary)'
                }}
              />
            </div>
          )}

          {sourceMode === 'folder' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Local Folder Path *
              </label>
              <input
                type="text"
                value={localFolder}
                onChange={(e) => setLocalFolder(e.target.value)}
                placeholder="/home/user/my-agent or ./benchmarks/trip-planner"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--ink-primary)'
                }}
              />
            </div>
          )}

          {sourceMode === 'zip' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Upload Code Archive (.zip) *
              </label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileUpload}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '12px'
                }}
              />
              {isUploading && <span style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', display: 'block' }}>Uploading archive...</span>}
              {uploadedPath && <span style={{ fontSize: '11px', color: '#16A34A', fontFamily: 'var(--font-mono)', marginTop: '4px', display: 'block' }}>✓ Uploaded to server: {uploadedPath}</span>}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Target Agent Identifier
            </label>
            <input
              type="text"
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
              placeholder="e.g. support-agent-hitl"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border-default)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--ink-primary)'
              }}
            />
          </div>

          <div style={{ paddingBottom: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={useLlm}
                onChange={(e) => setUseLlm(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-secondary)' }}>
                Enable LLM Analysis
              </span>
            </label>
          </div>
        </div>

        {/* Existing Spec Detection Banner */}
        {hasSavedSpec && (
          <div style={{
            marginTop: '16px',
            background: 'var(--accent-light)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-primary)' }}>
              Found saved Phase 0 answers for <strong>{targetAgent}</strong> ({savedSpecRulesCount} rules) from an earlier run.
            </div>
            <button
              type="button"
              onClick={handleLoadSavedSpec}
              style={{
                border: '1px solid var(--accent)',
                background: '#fff',
                color: 'var(--accent)',
                fontWeight: 700,
                fontSize: '11.5px',
                padding: '5px 14px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer'
              }}
            >
              Load Saved Answers into Form
            </button>
          </div>
        )}

        {/* Top Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={handleLoadSavedSpec}
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-soft)',
              color: 'var(--ink-primary)',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer'
            }}
          >
            Load Saved Spec
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              border: '1.5px solid var(--accent)',
              background: '#fff',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer'
            }}
          >
            {isSaving ? 'Saving...' : 'Save Spec'}
          </button>

          <button
            type="button"
            onClick={handleSaveAndRun}
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, var(--accent) 0%, #EA580C 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '9px 20px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(224, 93, 56, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Run Pipeline & Analyze Agent</span>
            <span>➔</span>
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div style={{
          background: 'var(--status-confirmed-bg)',
          border: '1px solid var(--status-confirmed-border)',
          color: 'var(--status-confirmed)',
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {saveSuccessMsg}
        </div>
      )}

      {/* Main Questionnaire Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* SECTION 1: CORE PURPOSE & SCOPE */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              SECTION 1
            </span>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              Core Purpose & Boundary Scope
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {/* Q1: Purpose */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                1. What is the agent supposed to achieve for its users? (Purpose) *
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                In a sentence or two. Minimum 5 characters.
              </p>
              <textarea
                rows={3}
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. A trip planning assistant that coordinates flight searches, activity reservations, and budget optimization for travelers."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Q2: Out of Scope */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                2. What should it refuse or stay out of, even if a user asks? (Out of Scope)
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Comma-separated items. The agent must strictly decline these requests.
              </p>
              <input
                type="text"
                value={outOfScopeInput}
                onChange={(e) => setOutOfScopeInput(e.target.value)}
                placeholder="e.g. payment processing, credit card details, medical advice"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px'
                }}
              />
            </div>

            {/* Q3: Failure Definition */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                3. What would make you call a conversation a failure?
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Critical conversational failure conditions (empty to skip).
              </p>
              <input
                type="text"
                value={failureDef}
                onChange={(e) => setFailureDef(e.target.value)}
                placeholder="e.g. Booking flights without user confirmation, exceeding budget"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px'
                }}
              />
            </div>

            {/* Invisible Capabilities */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                Anything the agent must be able to do that the code may not show? (Implicit Capabilities)
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Comma-separated capabilities expected by developers that aren't explicit in AST tool definitions.
              </p>
              <input
                type="text"
                value={capabilitiesInput}
                onChange={(e) => setCapabilitiesInput(e.target.value)}
                placeholder="e.g. currency conversion, multi-city itineraries, polite tone de-escalation"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: SAFETY INVARIANTS & RULES */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
                SECTION 2
              </span>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
                4–6. Rules The Code Does Not Enforce (Safety Invariants)
              </h2>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              {rules.length} {rules.length === 1 ? 'rule configured' : 'rules configured'}
            </span>
          </div>

          <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
            Every rule declared here is mapped into a <code style={{ color: 'var(--accent)', fontWeight: 700 }}>constraint</code> entry in Behavioral Model V0 and an evaluation item in the Rubric, verifying policies that static code might not guard.
          </p>

          {/* Active Rules List */}
          {rules.length === 0 ? (
            <div style={{ background: 'var(--bg-inset)', padding: '20px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '12.5px', marginBottom: '18px' }}>
              No rules added yet. Add at least one rule below (e.g. "Must confirm before cancelling bookings").
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {rules.map((rule, idx) => {
                const sevConfig = SEVERITIES.find(s => s.id === rule.severity) || SEVERITIES[1];
                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-surface-soft)',
                      border: '1.2px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: 'var(--bg-inset)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        color: 'var(--ink-primary)'
                      }}>
                        {rule.id || `R${idx + 1}`}
                      </span>

                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                        {rule.text}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-inset)',
                        color: 'var(--ink-secondary)'
                      }}>
                        {rule.kind}
                      </span>

                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: sevConfig.bg,
                        color: sevConfig.color,
                        border: `1px solid ${sevConfig.border}`
                      }}>
                        {rule.severity}
                      </span>

                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: rule.check === 'deterministic' ? '#ECFDF5' : '#F3E8FF',
                        color: rule.check === 'deterministic' ? '#065F46' : '#6B21A8'
                      }}>
                        check: {rule.check}
                      </span>

                      {rule.applies_to && rule.applies_to.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                          [{rule.applies_to.join(', ')}]
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--ink-muted)',
                          fontSize: '16px',
                          cursor: 'pointer',
                          padding: '4px 8px'
                        }}
                        title="Remove rule"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Rule Form */}
          <div style={{
            background: 'var(--bg-inset)',
            border: '1.5px dashed var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '18px 20px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', marginBottom: '12px' }}>
              + Add Safety Invariant Rule
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
              <div style={{ gridColumn: 'span 2', minWidth: '300px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  Rule Statement (e.g. 'Must confirm before cancelling bookings') *
                </label>
                <input
                  type="text"
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  placeholder="e.g. Must verify budget limit before creating reservation"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  Type of Rule
                </label>
                <select
                  value={newRuleKind}
                  onChange={(e) => setNewRuleKind(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px',
                    background: '#fff'
                  }}
                >
                  {KINDS.map(k => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  Severity if Broken
                </label>
                <select
                  value={newRuleSeverity}
                  onChange={(e) => setNewRuleSeverity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px',
                    background: '#fff'
                  }}
                >
                  {SEVERITIES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  Verification Check Mode
                </label>
                <select
                  value={newRuleCheck}
                  onChange={(e) => setNewRuleCheck(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px',
                    background: '#fff'
                  }}
                >
                  <option value="judge">LLM Judge (Semantic reasoning)</option>
                  <option value="deterministic">Deterministic (From tool calls alone)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  Tool Concerns (Optional)
                </label>
                <input
                  type="text"
                  value={newRuleAppliesTo}
                  onChange={(e) => setNewRuleAppliesTo(e.target.value)}
                  placeholder="e.g. book_hotel, cancel_flight"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px'
                  }}
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddRule}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    background: 'var(--ink-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Rule
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: AMBIGUITY POLICY & SUSPECTED FRAGILITY */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              SECTION 3
            </span>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              7–9. Ambiguity Policy & Fragility Edge Cases
            </h2>
          </div>

          {/* Q7: Ambiguity Policy */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '6px' }}>
              7. When information is missing or ambiguous, the agent should:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {POLICIES.map(p => (
                <div
                  key={p.id}
                  onClick={() => setAmbiguityPolicy(p.id)}
                  style={{
                    border: ambiguityPolicy === p.id ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                    background: ambiguityPolicy === p.id ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <input
                      type="radio"
                      name="ambiguity_policy"
                      checked={ambiguityPolicy === p.id}
                      onChange={() => setAmbiguityPolicy(p.id)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: ambiguityPolicy === p.id ? 'var(--accent)' : 'var(--ink-primary)' }}>
                      {p.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--ink-muted)', margin: 0, paddingLeft: '22px' }}>
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {/* Q8: Weak Spots */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                8. Where do you suspect the agent is fragile or has misbehaved before? (Weak Spots)
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                One per line. Known fragile workflows, loops, or complex tool branches.
              </p>
              <textarea
                rows={3}
                value={weakSpotsText}
                onChange={(e) => setWeakSpotsText(e.target.value)}
                placeholder="e.g.&#10;Looping between hotel booking and budget critic&#10;Date parsing with ambiguous formats like dd/mm vs mm/dd"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            {/* Q9: Problematic User Behaviors */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                9. Which user behaviors cause trouble in practice?
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                One per line (e.g. impatient, vague, changing requirements mid-flight).
              </p>
              <textarea
                rows={3}
                value={userBehaviorsText}
                onChange={(e) => setUserBehaviorsText(e.target.value)}
                placeholder="e.g.&#10;impatient users repeatedly re-asking questions&#10;vague budget without specifying currency&#10;switching destinations midway"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: EXTERNAL SERVICES & MOCKING */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
                SECTION 4
              </span>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
                10–12. External Services & Mocking Strategies
              </h2>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              {services.length} {services.length === 1 ? 'service declared' : 'services declared'}
            </span>
          </div>

          <p style={{ fontSize: '12.5px', color: 'var(--ink-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
            Third-party APIs and services the agent touches. Configure which are unsafe to hit during verification and how failure modes should be injected.
          </p>

          {/* Active Services List */}
          {services.length === 0 ? (
            <div style={{ background: 'var(--bg-inset)', padding: '18px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '12.5px', marginBottom: '18px' }}>
              No external services declared. Add dependent APIs below if your agent connects to external services.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {services.map((srv, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-surface-soft)',
                    border: '1.2px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink-primary)', fontFamily: 'var(--font-mono)' }}>
                      {srv.name}
                    </span>
                    {srv.unsafe_to_hit && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        background: '#FEE2E2',
                        color: '#DC2626',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #FCA5A5'
                      }}>
                        UNSAFE TO CALL FOR REAL
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-secondary)', background: 'var(--bg-inset)', padding: '2px 8px', borderRadius: '4px' }}>
                      Mock: <strong>{srv.mock}</strong>
                    </span>

                    {srv.failure_modes && srv.failure_modes.length > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                        Failures: {srv.failure_modes.join(', ')}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveService(idx)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--ink-muted)',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '4px 8px'
                      }}
                      title="Remove service"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Service Form */}
          <div style={{
            background: 'var(--bg-inset)',
            border: '1.5px dashed var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '18px 20px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-primary)', textTransform: 'uppercase', marginBottom: '12px' }}>
              + Add External Dependency
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  10. Service Name *
                </label>
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="e.g. Stripe, Amadeus Flights, Twilio"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  11. Mocking Strategy
                </label>
                <select
                  value={newServiceMock}
                  onChange={(e) => setNewServiceMock(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px',
                    background: '#fff'
                  }}
                >
                  {MOCKS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                  12. Failures to Test (Comma-separated)
                </label>
                <input
                  type="text"
                  value={newServiceFailures}
                  onChange={(e) => setNewServiceFailures(e.target.value)}
                  placeholder="e.g. timeout, rate_limit, 500 error"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', height: '36px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newServiceUnsafe}
                    onChange={(e) => setNewServiceUnsafe(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: '#DC2626' }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>
                    Unsafe to call during test
                  </span>
                </label>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddService}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    background: 'var(--ink-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  + Add Service
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: QUALITY STANDARDS & FAILURE TOLERANCE */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              SECTION 5
            </span>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              13–14. Quality Standards & Verification Thresholds
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Q13: Quality Notes */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                13. Beyond correctness, what matters in replies?
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Tone, brevity, formatting, or language constraints (empty to skip).
              </p>
              <input
                type="text"
                value={qualityNotes}
                onChange={(e) => setQualityNotes(e.target.value)}
                placeholder="e.g. Concise bullet points, polite tone, zero markdown rendering bugs"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px'
                }}
              />
            </div>

            {/* Q14: Thresholds */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                14. How many critical failures are acceptable?
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Default is 0 (zero tolerance for critical violations).
              </p>
              <input
                type="number"
                min="0"
                max="1000"
                value={maxCriticalFailures}
                onChange={(e) => setMaxCriticalFailures(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                Minimum Pass Rate (0.0 to 1.0)
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                Overall test threshold from 0 to 1 (empty to skip, e.g. 0.95 for 95%).
              </p>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={minPassRate}
                onChange={(e) => setMinPassRate(e.target.value)}
                placeholder="e.g. 0.95"
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
          </div>
        </div>

        {/* SECTION 6: REFERENCE MATERIAL & REPORTING */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              SECTION 6
            </span>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              15–16. Reference Data & Report Configuration
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Q15: Reference Material */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                15. Real conversations, logs or bug reports we can learn from?
              </label>
              <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                File paths (one per line) to transcripts, telemetry, or historical failure cases.
              </p>
              <textarea
                rows={3}
                value={referenceMaterialText}
                onChange={(e) => setReferenceMaterialText(e.target.value)}
                placeholder="e.g.&#10;logs/prod_interactions.jsonl&#10;tests/fixtures/past_failures.txt"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            {/* Q16: Report Audience & Emphasis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                  16. Who will read the report?
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {AUDIENCES.map(aud => (
                    <button
                      type="button"
                      key={aud.id}
                      onClick={() => setReportAudience(aud.id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: reportAudience === aud.id ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                        background: reportAudience === aud.id ? 'var(--accent-light)' : 'var(--bg-surface-soft)',
                        color: reportAudience === aud.id ? 'var(--accent)' : 'var(--ink-primary)',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {aud.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                  Report Emphasis (Comma-separated)
                </label>
                <input
                  type="text"
                  value={reportEmphasis}
                  onChange={(e) => setReportEmphasis(e.target.value)}
                  placeholder="e.g. security, financial accuracy, edge case coverage"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: '12.5px'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 7: RUNTIME CONFIGURATION */}
        <div style={{ background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              SECTION 7
            </span>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              Runtime Execution & Reproducibility Settings
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                Agent Entry File or Command
              </label>
              <input
                type="text"
                value={entryPoint}
                onChange={(e) => setEntryPoint(e.target.value)}
                placeholder="e.g. python main.py or graph:app"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                Interface Architecture
              </label>
              <select
                value={interfaceType}
                onChange={(e) => setInterfaceType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12.5px',
                  background: '#fff'
                }}
              >
                <option value="python_module">Python Module (Callable graph)</option>
                <option value="http">HTTP Service (REST / WebSocket endpoint)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
                Repeated Runs to Check Reproducibility
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={repeats}
                onChange={(e) => setRepeats(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Floating Save / Action Bar */}
        <div style={{
          position: 'sticky',
          bottom: '24px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1.5px solid var(--border-default)',
          borderRadius: 'var(--radius-full)',
          padding: '12px 24px',
          boxShadow: 'var(--shadow-float)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 40
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Configured:</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-primary)' }}>
              {rules.length} rules · {services.length} services · policy: {ambiguityPolicy}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  border: '1.5px solid var(--border-default)',
                  background: '#fff',
                  color: 'var(--ink-secondary)',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '9px 18px',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                border: '1.5px solid var(--border-default)',
                background: '#fff',
                color: 'var(--ink-primary)',
                fontWeight: 700,
                fontSize: '13px',
                padding: '9px 20px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer'
              }}
            >
              {isSaving ? 'Saving...' : 'Save Spec Only'}
            </button>

            <button
              type="button"
              onClick={handleSaveAndRun}
              style={{
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent) 0%, #EA580C 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
                padding: '10px 24px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(224, 93, 56, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Run Pipeline & Analyze Agent</span>
              <span>➔</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
