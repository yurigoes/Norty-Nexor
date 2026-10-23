/* Lista de contextos (empresas, portal, Master) e troca sem novo login. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LifeBuoy, ShieldCheck, UserRound } from 'lucide-react';
import type { ContextOption } from '@nortycar/shared';
import { ORGANIZATION_STATUS_LABEL } from '@nortycar/shared';
import { Badge, ErrorState, LoadingBlock } from './ui';
import { errorMessage } from '../lib/api';
import { useApi } from '../lib/hooks';
import { homeFor, useSession } from '../lib/session';
import { date } from '../lib/format';

const ICON = { STAFF: Building2, CUSTOMER: UserRound, PLATFORM: ShieldCheck, SUPPORT: LifeBuoy };

export function ContextList({ contexts, currentKey, onChosen }: { contexts: ContextOption[]; currentKey?: string; onChosen?: () => void }) {
  const { chooseContext } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (c: ContextOption) => {
    setBusy(c.key);
    setError(null);
    try {
      await chooseContext(c.key);
      onChosen?.();
      navigate(homeFor({ context: { kind: c.kind } } as never), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="stack">
      {error && <div className="nc-alert nc-alert--danger" role="alert">{error}</div>}
      <div className="context-list">
        {contexts.map((c) => {
          const Icon = ICON[c.kind];
          const blocked = c.organizationStatus === 'SUSPENDED' && c.kind !== 'SUPPORT';
          return (
            <button key={c.key} type="button" className="context-item" disabled={blocked || busy !== null} onClick={() => choose(c)} aria-current={c.key === currentKey || undefined}>
              <span className="context-item__icon" aria-hidden><Icon size={18} /></span>
              <span className="grow">
                <span className="strong" style={{ display: 'block' }}>{c.organizationName ?? c.label}</span>
                <span className="xsmall muted">{c.organizationName ? c.label : ''}{c.description ? `${c.organizationName ? ' · ' : ''}${c.description}` : ''}{c.expiresAt ? ` · até ${date(c.expiresAt)}` : ''}</span>
              </span>
              {c.key === currentKey && <Badge tone="brand">Atual</Badge>}
              {c.organizationStatus && c.organizationStatus !== 'ACTIVE' && <Badge tone={blocked ? 'danger' : 'info'}>{ORGANIZATION_STATUS_LABEL[c.organizationStatus]}</Badge>}
              {busy === c.key && <span className="nc-spinner" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ContextSwitcher({ onChosen }: { onChosen?: () => void }) {
  const { listContexts, session } = useSession();
  const { data, loading, error, reload } = useApi(() => listContexts(), []);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <ContextList contexts={data ?? []} currentKey={session?.context.key} onChosen={onChosen} />;
}
