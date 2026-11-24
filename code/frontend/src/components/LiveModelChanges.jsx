import { useEffect, useState } from 'react';
import { fetchModelChanges } from '../services/api';

const POLL_MS = 1500;

const STATUS_COLORS = {
  contradicted: { bg: '#FEE2E2', fg: '#B91C1C' },
  confirmed: { bg: '#DCFCE7', fg: '#15803D' },
  unreachable: { bg: '#FEF3C7', fg: '#B45309' },
  discovered: { bg: '#DBEAFE', fg: '#1D4ED8' },
  unverified: { bg: '#F1F5F9', fg: '#475569' },
};

const percent = (value) => (value == null ? '-' : `${Math.round(value * 100)}%`);

export function StatusBadge({ status }) {
  if (!status) return <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>new</span>;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.unverified;
  return (
    <span style={{
      background: colors.bg, color: colors.fg, fontSize: '10.5px', fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 8px', borderRadius: '999px',
    }}>
      {status}
    </span>
  );
}

function ChangeRow({ change }) {
  const failedText = change.runs > 1 || change.failures
    ? `Failed ${change.failures} of ${change.runs} runs`
    : null;
  return (
    <div className="animate-fade-in" style={{
      border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px',
      background: '#fff', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '13px', color: 'var(--ink-primary)' }}>
          {change.entry_name}
        </span>
        <span style={{ fontSize: '10.5px', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
          {change.entry_id} · {change.entry_type}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <StatusBadge status={change.status_from} />
        <span style={{ color: 'var(--ink-muted)' }}>→</span>
        <StatusBadge status={change.status_to} />
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-primary)' }}>
          {percent(change.confidence_from)} → {percent(change.confidence_to)}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink-muted)', display: 'flex', gap: '10px' }}>
        <span>{change.test_id}</span>
        {change.result !== 'discovered' && <span>result: {change.result} ({change.severity})</span>}
        {failedText && <span>{failedText}</span>}
      </div>
    </div>
  );
}

/**
 * Model entries that moved because of test results, newest first.
 * active: keep polling (a run is in progress). It also keeps polling while the backend says
 * the check stage is still running, and stops once it says done.
 * floating: small overlay shown only while there is something to see.
 */
export function LiveModelChanges({ agentName, active = false, floating = false }) {
  const [data, setData] = useState(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!agentName) return undefined;
    let stopped = false;
    let timer = null;
    const load = async () => {
      try {
        const next = await fetchModelChanges(agentName);
        if (stopped) return;
        setData(next);
        setUnreachable(false);
        if (active || next.state === 'running') timer = setTimeout(load, POLL_MS);
      } catch {
        if (stopped) return;
        setUnreachable(true);
        if (active) timer = setTimeout(load, POLL_MS * 2);
      }
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [agentName, active]);

  const changes = data ? [...data.changes].reverse() : [];
  const running = data?.state === 'running';

  if (floating && changes.length === 0 && !running) return null;

  const body = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent)' }}>
          {running ? '● ' : ''}Live model changes
        </div>
        {data && data.state !== 'none' && (
          <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
            {data.done_specs} of {data.total_specs} tests reconciled
          </div>
        )}
      </div>
      {unreachable && (
        <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
          Backend not reachable, retrying...
        </div>
      )}
      {changes.length === 0 ? (
        <div style={{ fontSize: '12.5px', color: 'var(--ink-muted)' }}>
          {running
            ? 'Waiting for the first test result...'
            : 'No test result has changed the model yet. Run the pipeline with tests to see entries move here.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {changes.map((change, i) => (
            <ChangeRow key={`${change.finding_id || change.entry_id}-${change.entry_id}-${i}`} change={change} />
          ))}
        </div>
      )}
    </>
  );

  if (floating) {
    return (
      <div style={{
        position: 'fixed', right: '24px', bottom: '100px', width: 'min(92vw, 400px)', maxHeight: '55vh',
        overflowY: 'auto', zIndex: 9998, background: 'var(--bg-surface-soft, #F8FAFC)',
        border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '14px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
      }}>
        {body}
      </div>
    );
  }
  return (
    <div style={{
      background: '#fff', border: '1.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
      padding: '16px 18px', marginBottom: '28px',
    }}>
      {body}
    </div>
  );
}
