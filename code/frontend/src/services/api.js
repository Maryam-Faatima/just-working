/**
 * GreatTest API Client
 * Facilitates direct communication between the React Dashboard
 * and the GreatTest FastAPI backend service.
 */

const API_BASE = 'http://127.0.0.1:8000/api';

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { connected: true, data };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

export async function fetchAgents() {
  try {
    const res = await fetch(`${API_BASE}/agents`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch agents:', err);
    return [];
  }
}

export async function fetchAgentSummary(agentName) {
  const res = await fetch(`${API_BASE}/summary/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAgentSpec(agentName) {
  const res = await fetch(`${API_BASE}/spec/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAgentRubric(agentName) {
  const res = await fetch(`${API_BASE}/rubric/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAgentScan(agentName) {
  const res = await fetch(`${API_BASE}/scan/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAgentCallgraph(agentName) {
  const res = await fetch(`${API_BASE}/callgraph/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchAgentModel(agentName) {
  const res = await fetch(`${API_BASE}/model/${agentName}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function triggerPipelineRun({ source, name, useLlm = false, spec = null }) {
  const res = await fetch(`${API_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source,
      name,
      use_llm: useLlm,
      spec: spec
    })
  });
  if (!res.ok) {
    let errDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson.detail) errDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
    } catch {
      // ignore
    }
    throw new Error(`Failed to start pipeline: ${errDetail}`);
  }
  return await res.json();
}

export async function uploadAgentFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    let errDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson.detail) errDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
    } catch {
      // ignore
    }
    throw new Error(`Failed to upload archive: ${errDetail}`);
  }
  return await res.json();
}

export async function fetchAgentStatus(agentName) {
  const res = await fetch(`${API_BASE}/status/${agentName}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function checkAgentSpecExists(agentName) {
  try {
    const res = await fetch(`${API_BASE}/check-spec?name=${encodeURIComponent(agentName)}`);
    if (!res.ok) return { exists: false };
    return await res.json();
  } catch {
    return { exists: false };
  }
}

export async function saveAgentSpec(agentName, spec) {
  const res = await fetch(`${API_BASE}/spec/${encodeURIComponent(agentName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec)
  });
  if (!res.ok) throw new Error(`Failed to save spec: ${res.statusText}`);
  return await res.json();
}

