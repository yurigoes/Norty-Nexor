import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  MANAGER_SUGGESTIONS, RESIDENT_SUGGESTIONS, ask, type ConciergeAnswer,
} from '../../services/concierge';
import { Avatar, Badge, Button, Card, PageHeader } from '../../components/ui';
import { firstName } from '../../lib/format';
import './shared.css';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  answer?: ConciergeAnswer;
}

let seq = 0;

export function ConciergePage() {
  const { user, condominium } = useAuthenticated();
  const isManager = user.role !== 'morador' && user.role !== 'portaria';
  const suggestions = isManager ? MANAGER_SUGGESTIONS : RESIDENT_SUGGESTIONS;

  const [messages, setMessages] = useState<Message[]>([{
    id: (seq += 1),
    role: 'assistant',
    text: isManager
      ? `Olá, ${firstName(user.name)}. Sou o concierge do NEXOR. Posso resumir a operação do ${condominium.shortName}, detalhar chamados, inadimplência, ocorrências e movimento de acessos.`
      : `Olá, ${firstName(user.name)}. Sou o concierge do NEXOR. Posso ajudar com encomendas, boletos, reservas, visitantes, veículos e regras do condomínio.`,
  }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || thinking) return;
    setMessages((prev) => [...prev, { id: (seq += 1), role: 'user', text }]);
    setInput('');
    setThinking(true);

    const answer = await ask(text, {
      user,
      condominiumId: condominium.id,
      unitId: user.unitId,
      now: new Date(),
    });

    setThinking(false);
    setMessages((prev) => [...prev, { id: (seq += 1), role: 'assistant', text: answer.text, answer }]);
  };

  return (
    <>
      <PageHeader
        icon={<Sparkles size={22} />}
        title="NEXOR AI · Concierge"
        subtitle="Respostas construídas a partir dos dados reais do condomínio"
        actions={<Badge tone="cyan">Provedor local · MVP</Badge>}
      />

      <Card padding="none">
        <div className="nx-chat">
          <div className="nx-chat__stream" ref={streamRef}>
            {messages.map((m) => (
              <div key={m.id} className={`nx-chat__msg ${m.role === 'user' ? 'is-user' : ''}`}>
                {m.role === 'assistant'
                  ? <span className="nx-chat__avatar"><Sparkles size={17} /></span>
                  : <Avatar name={user.name} size="sm" square />}
                <div className="nx-chat__bubble">
                  <p>{m.text}</p>
                  {m.answer?.bullets && (
                    <ul>
                      {m.answer.bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  {m.answer?.link && (
                    <Link to={m.answer.link.to} className="nx-row nx-gap-2" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {m.answer.link.label} <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="nx-chat__msg">
                <span className="nx-chat__avatar"><Sparkles size={17} /></span>
                <div className="nx-chat__bubble">
                  <span className="nx-typing"><span /><span /><span /></span>
                </div>
              </div>
            )}
          </div>

          <div className="nx-chat__suggestions">
            {suggestions.map((s) => (
              <button key={s} className="nx-chat__suggestion" onClick={() => send(s)} disabled={thinking}>{s}</button>
            ))}
          </div>

          <form
            className="nx-chat__composer"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <div className="nx-input nx-input--lg nx-grow">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte algo sobre o condomínio..."
                disabled={thinking}
              />
            </div>
            <Button type="submit" variant="brand" size="lg" icon={<Send size={18} />} disabled={thinking || !input.trim()} aria-label="Enviar" />
          </form>
        </div>
      </Card>

      <Card padding="md" style={{ marginTop: 'var(--space-4)' }}>
        <div className="nx-row nx-gap-3 nx-wrap">
          <span className="nx-list__icon"><Sparkles size={16} /></span>
          <div className="nx-grow">
            <p className="nx-medium">Como o concierge funciona nesta fase</p>
            <p className="nx-text-sm nx-text-muted">
              O provedor local interpreta a intenção da pergunta e consulta os mesmos serviços
              usados pelo restante da plataforma — as respostas refletem os dados reais da
              demonstração. Na Fase 5 basta registrar um provedor conectado a um modelo de
              linguagem: a interface e o contexto estruturado permanecem os mesmos.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
