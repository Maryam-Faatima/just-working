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

const SEV_DARK = { critical: '#f87171', major: '#fbbf24', minor: '#60a5fa' };

const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const SOURCE_MODES = [
  {
    id: 'git', label: 'Git Repository URL', desc: 'Clone a remote repo each run',
    icon: <svg {...ICON_PROPS}><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="9" r="2.2" /><path d="M6 8.2v7.6M18 11.2c0 3-6 2-12 4.6" /></svg>
  },
  {
    id: 'folder', label: 'Local Directory', desc: 'Point at a folder on the server',
    icon: <svg {...ICON_PROPS}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>
  },
  {
    id: 'zip', label: 'Upload Archive', desc: 'Drop a .zip of your agent code',
    icon: <svg {...ICON_PROPS}><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
  }
];

// One card per question. Required/optional rules mirror the existing validation:
// only the source and Question 1 are enforced when running.
const STEPS = [
  { id: 'source', section: 'Setup', title: 'Where is your agent?', required: true,
    hint: 'Paste a Git URL, a folder path, or upload a zip.' },
  { id: 'purpose', section: 'Section 1 · Purpose & scope', title: 'What is the agent supposed to achieve for its users?', required: true,
    hint: 'One or two sentences is enough.' },
  { id: 'scope', section: 'Section 1 · Purpose & scope', title: 'What should it refuse or stay out of, even if a user asks?', required: false,
    hint: 'Separate items with commas.' },
  { id: 'failure', section: 'Section 1 · Purpose & scope', title: 'What would make you call a conversation a failure?', required: false,
    hint: 'For example: gives wrong prices, ignores a refund rule.' },
  { id: 'capabilities', section: 'Section 1 · Purpose & scope', title: 'Anything the agent must be able to do that the code may not show?', required: false,
    hint: 'Separate items with commas.' },
  { id: 'rules', section: 'Section 2 · Safety invariants', title: 'Rules the code does not enforce', required: false,
    hint: 'Each rule becomes a check in the rubric.' },
  { id: 'ambiguity', section: 'Section 3 · Ambiguity & fragility', title: 'When information is missing or ambiguous, the agent should:', required: false,
    hint: 'Defaults to asking the user.' },
  { id: 'weak', section: 'Section 3 · Ambiguity & fragility', title: 'Where do you suspect the agent is fragile or has misbehaved before?', required: false,
    hint: 'One per line.' },
  { id: 'behaviors', section: 'Section 3 · Ambiguity & fragility', title: 'Which user behaviors cause trouble in practice?', required: false,
    hint: 'One per line. For example: impatient, vague, changes their mind.' },
  { id: 'services', section: 'Section 4 · External services', title: 'External services & mocking strategies', required: false,
    hint: 'Mark services that are unsafe to call during tests.' },
  { id: 'quality', section: 'Section 5 · Quality standards', title: 'Beyond correctness, what matters in replies?', required: false,
    hint: 'Tone, length, format or language.' },
  { id: 'threshold', section: 'Section 5 · Quality standards', title: 'How many critical failures are acceptable?', required: false,
    hint: 'Sets when a run counts as passed.' },
  { id: 'reference', section: 'Section 6 · Reference & reporting', title: 'Real conversations, logs or bug reports we can learn from?', required: false,
    hint: 'File paths, one per line.' },
  { id: 'report', section: 'Section 6 · Reference & reporting', title: 'Who will read the report?', required: false,
    hint: 'Pick the emphasis for the final report.' },
  { id: 'runtime', section: 'Section 7 · Runtime', title: 'Runtime execution & reproducibility settings', required: false,
    hint: 'How the agent starts and how often each test repeats.' },
  { id: 'review', section: 'Final step', title: 'Review & run', required: false,
    hint: 'Check your answers, then run.' }
];

function Chips({ text }) {
  const items = (text || '').split(/,|\n/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  return <div className="gt-chips">{items.map((t, i) => <span className="gt-chip" key={i}>{t}</span>)}</div>;
}

function LineCount({ text }) {
  const n = (text || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
  return n ? <div className="gt-count">{n} {n === 1 ? 'item' : 'items'}</div> : null;
}

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
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState(null);
  const [dir, setDir] = useState('fwd');
  const [dragOver, setDragOver] = useState(false);

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
    if (inferred) {
      setTargetAgent(inferred);
    }
  }, [gitUrl, localFolder, sourceMode]);

  // Check if saved spec exists for targetAgent and auto-populate form
  useEffect(() => {
    if (targetAgent && targetAgent.trim()) {
      checkAgentSpecExists(targetAgent.trim()).then(res => {
        if (res.exists && res.spec) {
          setHasSavedSpec(true);
          setSavedSpecRulesCount(res.rules_count || res.spec?.rules?.length || 0);
          loadSpecIntoState(res.spec);
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

  // ---------------------------------------------------------------------------
  // Wizard: one card per question. Logic above is unchanged; only the UI differs.
  // ---------------------------------------------------------------------------
  const currentSource =
    (sourceMode === 'git' ? gitUrl : sourceMode === 'folder' ? localFolder : uploadedPath).trim() || sourceLocation.trim();
  const sourceOk = Boolean(currentSource || targetAgent);
  const purposeOk = purpose.trim().length >= 5;

  const isAnswered = (id) => {
    switch (id) {
      case 'source': return sourceOk;
      case 'purpose': return purposeOk;
      case 'scope': return Boolean(outOfScopeInput.trim());
      case 'failure': return Boolean(failureDef.trim());
      case 'capabilities': return Boolean(capabilitiesInput.trim());
      case 'rules': return rules.length > 0;
      case 'ambiguity': return true;
      case 'weak': return Boolean(weakSpotsText.trim());
      case 'behaviors': return Boolean(userBehaviorsText.trim());
      case 'services': return services.length > 0;
      case 'quality': return Boolean(qualityNotes.trim());
      case 'threshold': return minPassRate !== '' || Number(maxCriticalFailures) !== 0;
      case 'reference': return Boolean(referenceMaterialText.trim());
      case 'report': return Boolean(reportEmphasis.trim());
      case 'runtime': return Boolean(entryPoint.trim());
      default: return false;
    }
  };

  const flash = (msg) => {
    setNotice(msg);
    clearTimeout(window.__gtNoticeTimer);
    window.__gtNoticeTimer = setTimeout(() => setNotice(null), 3200);
  };
  const goTo = (i) => {
    const t = Math.max(0, Math.min(STEPS.length - 1, i));
    setDir(t >= step ? 'fwd' : 'back');
    setStep(t);
  };
  const goNext = () => {
    if (STEPS[step].required && !isAnswered(STEPS[step].id)) flash('Needed before you can run. You can come back to it.');
    goTo(step + 1);
  };
  // Jump past every optional card: to the first missing required one, otherwise to the review.
  const skipAllOptional = () => {
    const missing = STEPS.findIndex((s) => s.required && !isAnswered(s.id));
    const skipped = STEPS.filter((s) => !s.required && s.id !== 'review' && !isAnswered(s.id)).length;
    if (missing >= 0 && missing !== step) {
      goTo(missing);
      flash('Fill in the required answer first.');
    } else if (missing < 0) {
      goTo(STEPS.length - 1);
      flash(`Skipped ${skipped} optional ${skipped === 1 ? 'question' : 'questions'}. Ready to run.`);
    }
  };
  const requiredLeft = STEPS.filter((s) => s.required && !isAnswered(s.id)).length;
  const doneCount = STEPS.filter((s) => s.id !== 'review' && isAnswered(s.id)).length;
  const enterNext = (e) => {
    if (e.key === 'Enter' && step < STEPS.length - 1) {
      e.preventDefault();
      goTo(step + 1);
    }
  };

  const cur = STEPS[step];
  const isReview = cur.id === 'review';
  const answered = isAnswered(cur.id);

  const renderBody = (id) => {
    switch (id) {
      case 'source':
        return (
          <div className="gt-stack">
            <div className="gt-tiles">
              {SOURCE_MODES.map((m) => (
                <button type="button" key={m.id} className={`gt-tile${sourceMode === m.id ? ' on' : ''}`} onClick={() => setSourceMode(m.id)}>
                  {m.icon}
                  <b>{m.label}</b>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>

            {sourceMode === 'git' && (
              <div>
                <label className="gt-fieldlabel">Git Repository URL *</label>
                <input className="gt-field mono" type="text" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} onKeyDown={enterNext}
                  placeholder="https://github.com/gaurav-oberoi/support-agent-hitl" />
              </div>
            )}
            {sourceMode === 'folder' && (
              <div>
                <label className="gt-fieldlabel">Local Folder Path *</label>
                <input className="gt-field mono" type="text" value={localFolder} onChange={(e) => setLocalFolder(e.target.value)} onKeyDown={enterNext}
                  placeholder="/home/user/my-agent or ./benchmarks/trip-planner" />
              </div>
            )}
            {sourceMode === 'zip' && (
              <label
                className={`gt-drop${dragOver ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload({ target: { files: e.dataTransfer.files } }); }}
              >
                <input type="file" accept=".zip,application/zip" onChange={handleFileUpload} disabled={isUploading} hidden />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                <b>{isUploading ? 'Uploading archive...' : uploadedPath ? 'Archive uploaded' : 'Drop your .zip here, or click to browse'}</b>
                <span>Upload Code Archive (.zip) *</span>
                {uploadedPath && <code>✓ Uploaded to server: {uploadedPath}</code>}
              </label>
            )}

            <div className="gt-row">
              <div>
                <label className="gt-fieldlabel">Target Agent Identifier</label>
                <input className="gt-field mono" type="text" value={targetAgent} onChange={(e) => setTargetAgent(e.target.value)} onKeyDown={enterNext}
                  placeholder="e.g. support-agent-hitl" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '12px' }}>
                <label className="gt-check">
                  <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                  Enable LLM Analysis
                </label>
              </div>
            </div>

            {hasSavedSpec && (
              <div className="gt-banner" style={{ marginTop: 0 }}>
                <span>Found saved Phase 0 answers for <strong>{targetAgent}</strong> ({savedSpecRulesCount} rules) from an earlier run.</span>
                <button type="button" className="gt-btn-ghost" style={{ padding: '7px 16px', fontSize: '12px' }} onClick={handleLoadSavedSpec}>
                  Load Saved Answers into Form
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="gt-link-btn" onClick={handleLoadSavedSpec}>Load Saved Spec</button>
              <button type="button" className="gt-link-btn" onClick={clearFormState} title="Clear all fields to start a new questionnaire">Clear Fields</button>
            </div>
          </div>
        );

      case 'purpose':
        return (
          <textarea className="gt-field" rows={4} required value={purpose} onChange={(e) => setPurpose(e.target.value)} autoFocus
            placeholder="e.g. A trip planning assistant that coordinates flight searches, activity reservations, and budget optimization for travelers." />
        );

      case 'scope':
        return (
          <>
            <input className="gt-field" type="text" value={outOfScopeInput} onChange={(e) => setOutOfScopeInput(e.target.value)} onKeyDown={enterNext} autoFocus
              placeholder="e.g. payment processing, credit card details, medical advice" />
            <Chips text={outOfScopeInput} />
          </>
        );

      case 'failure':
        return (
          <input className="gt-field" type="text" value={failureDef} onChange={(e) => setFailureDef(e.target.value)} onKeyDown={enterNext} autoFocus
            placeholder="e.g. Booking flights without user confirmation, exceeding budget" />
        );

      case 'capabilities':
        return (
          <>
            <input className="gt-field" type="text" value={capabilitiesInput} onChange={(e) => setCapabilitiesInput(e.target.value)} onKeyDown={enterNext} autoFocus
              placeholder="e.g. currency conversion, multi-city itineraries, polite tone de-escalation" />
            <Chips text={capabilitiesInput} />
          </>
        );

      case 'rules':
        return (
          <>
            {rules.length === 0 ? (
              <div className="gt-empty">No rules added yet. Add at least one rule below (e.g. "Must confirm before cancelling bookings").</div>
            ) : (
              <div className="gt-items">
                {rules.map((rule, idx) => {
                  const sev = SEV_DARK[rule.severity] || SEV_DARK.major;
                  return (
                    <div className="gt-item" key={idx}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
                        <span className="gt-badge" style={{ color: sev, background: 'rgba(255,255,255,0.06)' }}>{rule.id || `R${idx + 1}`}</span>
                        <span className="txt">{rule.text}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="gt-badge">{rule.kind}</span>
                        <span className="gt-badge" style={{ color: sev }}>{rule.severity}</span>
                        <span className="gt-badge">{rule.check === 'deterministic' ? 'Deterministic' : 'LLM Judge'}</span>
                        {rule.applies_to && rule.applies_to.length > 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--gt-ink-dim)', fontFamily: 'var(--font-mono)' }}>[{rule.applies_to.join(', ')}]</span>
                        )}
                        <button type="button" className="gt-x" onClick={() => handleRemoveRule(idx)} title="Remove rule">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="gt-addbox">
              <div className="ttl">+ Add Safety Invariant Rule</div>
              <div className="gt-stack" style={{ gap: '16px' }}>
                <div>
                  <label className="gt-fieldlabel">Rule Statement (e.g. 'Must confirm before cancelling bookings') *</label>
                  <input className="gt-field" type="text" value={newRuleText} onChange={(e) => setNewRuleText(e.target.value)}
                    placeholder="e.g. Must verify budget limit before creating reservation" />
                </div>
                <div>
                  <label className="gt-fieldlabel">Type of Rule</label>
                  <div className="gt-pills">
                    {KINDS.map((k) => (
                      <button type="button" key={k.id} title={k.desc} className={`gt-pill${newRuleKind === k.id ? ' on' : ''}`} onClick={() => setNewRuleKind(k.id)}>{k.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="gt-fieldlabel">Severity if Broken</label>
                  <div className="gt-pills">
                    {SEVERITIES.map((s) => (
                      <button type="button" key={s.id} className={`gt-pill${newRuleSeverity === s.id ? ' on' : ''}`} onClick={() => setNewRuleSeverity(s.id)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="gt-fieldlabel">Verification Check Mode</label>
                  <div className="gt-pills">
                    <button type="button" className={`gt-pill${newRuleCheck === 'judge' ? ' on' : ''}`} onClick={() => setNewRuleCheck('judge')}>LLM Judge (Semantic reasoning)</button>
                    <button type="button" className={`gt-pill${newRuleCheck === 'deterministic' ? ' on' : ''}`} onClick={() => setNewRuleCheck('deterministic')}>Deterministic (From tool calls alone)</button>
                  </div>
                </div>
                <div>
                  <label className="gt-fieldlabel">Tool Concerns (Optional)</label>
                  <input className="gt-field mono" type="text" value={newRuleAppliesTo} onChange={(e) => setNewRuleAppliesTo(e.target.value)} placeholder="e.g. book_hotel, cancel_flight" />
                </div>
                <div><button type="button" className="gt-btn-lime sm" onClick={handleAddRule}>+ Add Rule</button></div>
              </div>
            </div>
          </>
        );

      case 'ambiguity':
        return (
          <div className="gt-tiles" style={{ gridTemplateColumns: '1fr' }}>
            {POLICIES.map((p) => (
              <button type="button" key={p.id} className={`gt-tile${ambiguityPolicy === p.id ? ' on' : ''}`} onClick={() => setAmbiguityPolicy(p.id)}>
                <b>{p.label}</b>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
        );

      case 'weak':
        return (
          <>
            <textarea className="gt-field mono" rows={5} value={weakSpotsText} onChange={(e) => setWeakSpotsText(e.target.value)} autoFocus
              placeholder={'e.g.\nLooping between hotel booking and budget critic\nDate parsing with ambiguous formats like dd/mm vs mm/dd'} />
            <LineCount text={weakSpotsText} />
          </>
        );

      case 'behaviors':
        return (
          <>
            <textarea className="gt-field mono" rows={5} value={userBehaviorsText} onChange={(e) => setUserBehaviorsText(e.target.value)} autoFocus
              placeholder={'e.g.\nimpatient users repeatedly re-asking questions\nvague budget without specifying currency\nswitching destinations midway'} />
            <LineCount text={userBehaviorsText} />
          </>
        );

      case 'services':
        return (
          <>
            {services.length === 0 ? (
              <div className="gt-empty">No external services declared. Add dependent APIs below if your agent connects to external services.</div>
            ) : (
              <div className="gt-items">
                {services.map((srv, idx) => (
                  <div className="gt-item" key={idx}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="txt" style={{ fontFamily: 'var(--font-mono)' }}>{srv.name}</span>
                      {srv.unsafe_to_hit && <span className="gt-badge" style={{ color: 'var(--gt-bad)' }}>Unsafe to call for real</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="gt-badge">Mock: {srv.mock}</span>
                      {srv.failure_modes && srv.failure_modes.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--gt-ink-dim)' }}>Failures: {srv.failure_modes.join(', ')}</span>
                      )}
                      <button type="button" className="gt-x" onClick={() => handleRemoveService(idx)} title="Remove service">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="gt-addbox">
              <div className="ttl">+ Add External Dependency</div>
              <div className="gt-stack" style={{ gap: '16px' }}>
                <div>
                  <label className="gt-fieldlabel">10. Service Name *</label>
                  <input className="gt-field" type="text" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="e.g. Stripe, Amadeus Flights, Twilio" />
                </div>
                <div>
                  <label className="gt-fieldlabel">11. Mocking Strategy</label>
                  <div className="gt-pills">
                    {MOCKS.map((m) => (
                      <button type="button" key={m.id} title={m.desc} className={`gt-pill${newServiceMock === m.id ? ' on' : ''}`} onClick={() => setNewServiceMock(m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="gt-fieldlabel">12. Failures to Test (Comma-separated)</label>
                  <input className="gt-field" type="text" value={newServiceFailures} onChange={(e) => setNewServiceFailures(e.target.value)} placeholder="e.g. timeout, rate_limit, 500 error" />
                </div>
                <label className="gt-check" style={{ color: 'var(--gt-bad)' }}>
                  <input type="checkbox" checked={newServiceUnsafe} onChange={(e) => setNewServiceUnsafe(e.target.checked)} style={{ accentColor: '#f87171' }} />
                  Unsafe to call during test
                </label>
                <div><button type="button" className="gt-btn-lime sm" onClick={handleAddService}>+ Add Service</button></div>
              </div>
            </div>
          </>
        );

      case 'quality':
        return (
          <input className="gt-field" type="text" value={qualityNotes} onChange={(e) => setQualityNotes(e.target.value)} onKeyDown={enterNext} autoFocus
            placeholder="e.g. Concise bullet points, polite tone, zero markdown rendering bugs" />
        );

      case 'threshold':
        return (
          <div className="gt-row">
            <div>
              <label className="gt-fieldlabel">Critical failures allowed</label>
              <input className="gt-field mono" type="number" min="0" max="1000" value={maxCriticalFailures} onChange={(e) => setMaxCriticalFailures(e.target.value)} />
              <div className="gt-count">Default is 0 (zero tolerance for critical violations).</div>
            </div>
            <div>
              <label className="gt-fieldlabel">Minimum Pass Rate (0.0 to 1.0)</label>
              <input className="gt-field mono" type="number" step="0.05" min="0" max="1" value={minPassRate} onChange={(e) => setMinPassRate(e.target.value)} placeholder="e.g. 0.95" />
              <div className="gt-count">Overall test threshold from 0 to 1 (empty to skip, e.g. 0.95 for 95%).</div>
            </div>
          </div>
        );

      case 'reference':
        return (
          <>
            <textarea className="gt-field mono" rows={5} value={referenceMaterialText} onChange={(e) => setReferenceMaterialText(e.target.value)} autoFocus
              placeholder={'e.g.\nlogs/prod_interactions.jsonl\ntests/fixtures/past_failures.txt'} />
            <LineCount text={referenceMaterialText} />
          </>
        );

      case 'report':
        return (
          <div className="gt-stack">
            <div className="gt-tiles">
              {AUDIENCES.map((a) => (
                <button type="button" key={a.id} className={`gt-tile${reportAudience === a.id ? ' on' : ''}`} onClick={() => setReportAudience(a.id)}>
                  <b>{a.label}</b>
                  <span>{a.desc}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="gt-fieldlabel">Report Emphasis (Comma-separated)</label>
              <input className="gt-field" type="text" value={reportEmphasis} onChange={(e) => setReportEmphasis(e.target.value)} onKeyDown={enterNext}
                placeholder="e.g. security, financial accuracy, edge case coverage" />
              <Chips text={reportEmphasis} />
            </div>
          </div>
        );

      case 'runtime':
        return (
          <div className="gt-stack">
            <div>
              <label className="gt-fieldlabel">Agent Entry File or Command</label>
              <input className="gt-field mono" type="text" value={entryPoint} onChange={(e) => setEntryPoint(e.target.value)} placeholder="e.g. python main.py or graph:app" />
            </div>
            <div>
              <label className="gt-fieldlabel">Interface Architecture</label>
              <div className="gt-pills">
                <button type="button" className={`gt-pill${interfaceType === 'python_module' ? ' on' : ''}`} onClick={() => setInterfaceType('python_module')}>Python Module (Callable graph)</button>
                <button type="button" className={`gt-pill${interfaceType === 'http' ? ' on' : ''}`} onClick={() => setInterfaceType('http')}>HTTP Service (REST / WebSocket endpoint)</button>
              </div>
            </div>
            <div style={{ maxWidth: '260px' }}>
              <label className="gt-fieldlabel">Repeated Runs to Check Reproducibility</label>
              <input className="gt-field mono" type="number" min="1" max="20" value={repeats} onChange={(e) => setRepeats(e.target.value)} />
            </div>
          </div>
        );

      default: { // review
        const audience = AUDIENCES.find((a) => a.id === reportAudience)?.label || reportAudience;
        const policy = POLICIES.find((p) => p.id === ambiguityPolicy)?.label || ambiguityPolicy;
        return (
          <>
            {!sourceOk && (
              <div className="gt-missing"><span>Required: agent source or identifier</span><button type="button" className="gt-link-btn" onClick={() => goTo(0)}>Fix</button></div>
            )}
            {!purposeOk && (
              <div className="gt-missing"><span>Required: Question 1 (Purpose), at least 5 characters</span><button type="button" className="gt-link-btn" onClick={() => goTo(1)}>Fix</button></div>
            )}
            <div className="gt-review">
              <div className="cell"><div className="k">Agent</div><div className="v mono">{targetAgent || '—'}</div></div>
              <div className="cell"><div className="k">Source</div><div className="v mono">{currentSource || '—'}</div></div>
              <div className="cell" style={{ gridColumn: '1 / -1' }}><div className="k">Purpose</div><div className="v">{purpose.trim() || '—'}</div></div>
              <div className="cell"><div className="k">Rules</div><div className="v">{rules.length}</div></div>
              <div className="cell"><div className="k">External services</div><div className="v">{services.length}</div></div>
              <div className="cell"><div className="k">Ambiguity policy</div><div className="v">{policy}</div></div>
              <div className="cell"><div className="k">Report audience</div><div className="v">{audience}</div></div>
              <div className="cell"><div className="k">Repeated runs</div><div className="v">{repeats}</div></div>
              <div className="cell"><div className="k">LLM analysis</div><div className="v">{useLlm ? 'Enabled' : 'Off'}</div></div>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div className="gt-wiz animate-fade-in">
      <div className="gt-wiz-top">
        <div>
          <h1>About your agent</h1>
          <p>Tell us what the code can’t. Only two answers are required.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onBack && <button type="button" className="gt-link-btn" onClick={onBack}>← Exit</button>}
          {onNavigateToSpec && <button type="button" className="gt-link-btn" onClick={onNavigateToSpec}>View Compiled Specs &amp; Rubric ↗</button>}
        </div>
      </div>

      <div className="gt-steps">
        {STEPS.map((s, i) => {
          const done = s.id !== 'review' && isAnswered(s.id);
          const cls = i === step ? 'active' : done ? 'done' : s.required && s.id !== 'review' ? 'req' : '';
          return <button type="button" key={s.id} className={`gt-dot ${cls}`} onClick={() => goTo(i)} title={s.title} aria-label={`Step ${i + 1}: ${s.title}`} />;
        })}
      </div>
      <div className="gt-prog"><div style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>
      <div className="gt-step-meta">
        <span>Step {step + 1} of {STEPS.length} · {requiredLeft === 0 ? 'required done' : `${requiredLeft} required left`}</span>
        <span className="legend">
          <span><i style={{ background: 'var(--gt-lime)' }} />Answered</span>
          <span><i style={{ background: 'var(--gt-warn)' }} />Required</span>
        </span>
        {!isReview && <button type="button" className="gt-skipall" onClick={skipAllOptional}>Skip all optional →</button>}
      </div>

      {notice && <div className="gt-toast" role="status">{notice}</div>}

      {saveSuccessMsg && (
        <div className="gt-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          {saveSuccessMsg}
        </div>
      )}

      <div className="gt-deck">
        {step < STEPS.length - 1 && <div className="gt-ghost g2" />}
        {step < STEPS.length - 1 && <div className="gt-ghost g1" />}
        <div className={`gt-card ${dir}`} key={cur.id}>
          <div className="gt-q-head">
            <span className="gt-q-section">{cur.section}</span>
            {!isReview && (cur.required
              ? <span className="gt-chip-req">Required</span>
              : <span className="gt-chip-opt">Optional</span>)}
          </div>
          <h2 className="gt-q-title">{cur.title}</h2>
          {cur.hint && <p className="gt-q-hint">{cur.hint}</p>}

          {renderBody(cur.id)}

          {cur.required && (
            <div className={`gt-need${answered ? ' ok' : ''}`}>
              {answered ? '✓ Done' : cur.id === 'purpose' && purpose.trim().length > 0 ? `Needs ${Math.max(0, 5 - purpose.trim().length)} more characters` : 'Required to run'}
            </div>
          )}

          <div className="gt-nav">
            <button type="button" className="gt-btn-ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>← Back</button>
            <div className="right">
              {isReview ? (
                <>
                  <button type="button" className="gt-btn-ghost" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Spec Only'}</button>
                  <button type="button" className="gt-btn-lime" onClick={handleSaveAndRun}>Run Pipeline &amp; Analyze Agent <span>➔</span></button>
                </>
              ) : (
                <>
                  {!cur.required && !answered && (
                    <button type="button" className="gt-btn-text" onClick={() => { goTo(step + 1); flash('Skipped. You can return anytime.'); }}>Skip</button>
                  )}
                  <button type="button" className="gt-btn-lime sm" style={{ padding: '11px 26px', fontSize: '13.5px' }} onClick={goNext}>Next →</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
