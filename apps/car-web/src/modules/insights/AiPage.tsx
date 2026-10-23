/* Norty IA: consulta em linguagem natural, só leitura, dentro das permissões do usuário. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PlugZap, Send, Sparkles } from 'lucide-react';
import type { AiAnswer, AiStatus } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import './insights.css';

interface Message { role: 'user' | 'assistant'; content: string; tools?: string[] }

const SUGGESTIONS = [
  'Quais contas a receber estão vencidas?',
  'O que vence nos próximos 30 dias?',
  'Quais veículos deram prejuízo no último ano?',
  'Quais manutenções preventivas estão vencidas?',
  'O que preciso repor no estoque?',
];

export function AiPage() {
  const status = useApi((signal) => api.get<AiStatus>('/ai/status', undefined, signal), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [messages, busy]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setQuestion('');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AiAnswer>('/ai/ask', { question: q, history: history.slice(-10) });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, tools: res.toolsUsed }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(question); };

  if (status.loading && !status.data) return <LoadingBlock />;
  if (status.error) return <ErrorState message={status.error} onRetry={status.reload} />;

  return (
    <Page>
      <PageHeader title="Norty IA" description="Pergunte sobre a operação. A IA só consulta dados que seu perfil pode ver, desta empresa, e nunca aprova, altera ou exclui nada."
        actions={status.data?.configured ? <Badge tone="success" dot>Conectada</Badge> : <Badge tone="warning" dot>Integração não configurada</Badge>} />
      {!status.data?.configured ? (
        <Card>
          <EmptyState icon={PlugZap} title="Integração não configurada"
            description={<>A Norty IA usa um modelo de linguagem da Anthropic executado pelo servidor. Para habilitar, a equipe técnica precisa definir <code className="mono">ANTHROPIC_API_KEY</code> no ambiente da API. Nenhuma resposta é gerada enquanto isso não estiver configurado.</>} />
        </Card>
      ) : (
        <Card>
          <div className="stack">
            {!messages.length && (
              <div className="stack">
                <div className="row"><Sparkles size={18} className="text-success" aria-hidden /><span className="strong">Sugestões</span></div>
                <div className="row" style={{ gap: 8 }}>
                  {SUGGESTIONS.map((s) => <button key={s} type="button" className="nc-chip" onClick={() => ask(s)}>{s}</button>)}
                </div>
                <p className="xsmall muted">Consultas disponíveis para o seu perfil: {status.data.tools.map((t) => t.name.replace(/_/g, ' ')).join(', ') || 'nenhuma'}.</p>
              </div>
            )}
            <div className="chat" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`chat__msg chat__msg--${m.role}`}>
                  {m.content}
                  {m.tools && m.tools.length > 0 && <div className="xsmall muted" style={{ marginTop: 6 }}>Consultou: {m.tools.map((t) => t.replace(/_/g, ' ')).join(', ')}</div>}
                </div>
              ))}
              {busy && <div className="chat__msg chat__msg--assistant"><span className="nc-spinner" aria-label="Consultando" /></div>}
              <div ref={end} />
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <form className="chat__composer" onSubmit={submit}>
              <textarea className="nc-textarea" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} aria-label="Pergunta"
                placeholder="Ex.: quais contratos vencem este mês?" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(question); } }} />
              <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={question.trim().length < 2}>Enviar</Button>
            </form>
            <p className="xsmall muted">As respostas usam só os dados consultados. Confira valores importantes nas telas antes de decidir.</p>
          </div>
        </Card>
      )}
    </Page>
  );
}
