import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Bot,
  FileText,
  AtSign,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  Smile,
  Sparkles,
  User,
} from 'lucide-react';
import type { Conversation, ConversationState, Message } from '@veyra/core';
import { AnelScore, Avatar, Botao, Cartao, Selo, Segmentado, useAvisos } from '../components';
import { formatarMoeda, formatarNumero } from '../components/Charts';
import { Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_CANAL, ROTULO_ESTADO_CONVERSA } from '../app/rotulos';
import { CLIENTES, CONVERSAS, MENSAGENS, leadPorId, clientePorId, produtoPorId, usuarioPorId } from '../data/base';
import './conversas.css';

function tomDoEstado(estado: ConversationState) {
  if (estado === 'nao_lida') return 'perigo' as const;
  if (estado === 'ia_atendendo') return 'marca' as const;
  if (estado === 'humano_atendendo') return 'info' as const;
  if (estado === 'encerrada') return 'neutro' as const;
  return 'atencao' as const;
}

const ICONE_CANAL = { whatsapp: MessageSquare, email: Mail, instagram: AtSign, webchat: MessageSquare };


type Caixa = 'todas' | 'nao_lidas' | 'ia' | 'minhas' | 'aguardando';

/**
 * Central de Conversas
 *
 * Três colunas: fila à esquerda, conversa no centro, contexto do cliente
 * à direita. A coluna da direita existe por um motivo específico — sem
 * ela o vendedor abre o CRM em outra aba para saber com quem está
 * falando, e é exatamente esse ir-e-voltar que a plataforma elimina.
 *
 * O atendimento acontece aqui dentro: nada de "abrir no WhatsApp".
 * Redirecionar para fora significaria perder histórico, transferência,
 * SLA e auditoria no primeiro clique.
 */
export function Conversas() {
  const { versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [caixa, setCaixa] = useState<Caixa>('todas');
  const [ativaId, setAtivaId] = useState(CONVERSAS[0].id);
  const [rascunho, setRascunho] = useState('');

  const filtradas = useMemo(() => {
    return CONVERSAS.filter((c) => {
      switch (caixa) {
        case 'nao_lidas':
          return c.naoLidas > 0;
        case 'ia':
          return c.estado === 'ia_atendendo';
        case 'minhas':
          return c.responsavelId === 'u-julia';
        case 'aguardando':
          return c.estado === 'aguardando_cliente' || c.estado === 'aguardando_vendedor';
        default:
          return true;
      }
    });
  }, [caixa, versaoDados]);

  const ativa = CONVERSAS.find((c) => c.id === ativaId) ?? filtradas[0];
  const mensagens = MENSAGENS[ativa?.id] ?? [];
  const fimDasMensagens = useRef<HTMLDivElement>(null);

  /* Abrir uma conversa no topo obrigaria a rolar até o fim para ver a
     última mensagem — que é justamente a que importa. */
  useEffect(() => {
    fimDasMensagens.current?.scrollIntoView({ block: 'end' });
  }, [ativaId]);

  function enviar() {
    if (!rascunho.trim()) return;
    avisar({ tom: 'sucesso', titulo: 'Mensagem enviada', texto: `Entregue por ${ROTULO_CANAL[ativa.canal]}.` });
    setRascunho('');
  }

  return (
    <Pagina
      titulo="Conversas"
      subtitulo="WhatsApp, e-mail e Instagram na mesma caixa. A IA atende primeiro e transfere quando o assunto pede gente."
    >
      <div className="vy-conversas">
        {/* ---------- Fila ---------- */}
        <aside className="vy-conversas__fila vy-card">
          <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
            <Segmentado
              opcoes={[
                { valor: 'todas' as const, rotulo: 'Todas' },
                { valor: 'nao_lidas' as const, rotulo: 'Não lidas' },
                { valor: 'ia' as const, rotulo: 'IA' },
                { valor: 'minhas' as const, rotulo: 'Minhas' },
              ]}
              valor={caixa}
              aoMudar={setCaixa}
            />
          </div>

          <ul className="vy-conversas__lista">
            {filtradas.map((conversa) => {
              const IconeCanal = ICONE_CANAL[conversa.canal];
              return (
                <li key={conversa.id}>
                  <button
                    className="vy-conversas__item"
                    data-ativa={conversa.id === ativa?.id}
                    onClick={() => setAtivaId(conversa.id)}
                  >
                    <Avatar nome={conversa.contatoNome} tamanho={36} />
                    <span className="vy-grow" style={{ minWidth: 0 }}>
                      <span className="vy-row-between" style={{ gap: 'var(--space-2)' }}>
                        <span className="vy-truncate" style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>
                          {conversa.contatoNome}
                        </span>
                        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', flexShrink: 0 }}>
                          {tempoRelativo(conversa.ultimaMensagemEm)}
                        </span>
                      </span>
                      <span className="vy-truncate" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {conversa.ultimaMensagem}
                      </span>
                      <span className="vy-row" style={{ gap: 'var(--space-2)', marginTop: 6 }}>
                        <IconeCanal size={11} color="var(--text-subtle)" />
                        <Selo tom={tomDoEstado(conversa.estado)} ponto={conversa.estado === 'ia_atendendo'}>
                          {ROTULO_ESTADO_CONVERSA[conversa.estado]}
                        </Selo>
                      </span>
                    </span>
                    {conversa.naoLidas > 0 && <span className="vy-conversas__contador">{conversa.naoLidas}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ---------- Conversa ---------- */}
        <section className="vy-conversas__chat vy-card">
          <header className="vy-conversas__cabecalho">
            <Avatar nome={ativa.contatoNome} tamanho={38} />
            <div className="vy-grow" style={{ minWidth: 0 }}>
              <strong className="vy-truncate" style={{ display: 'block', color: 'var(--text-strong)' }}>
                {ativa.contatoNome}
              </strong>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {ativa.assunto ?? ativa.contatoIdentificador}
              </span>
            </div>
            {ativa.estado === 'ia_atendendo' && (
              <span className="vy-conversas__ia">
                <Bot size={13} />
                VEYRA AI
                <span className="vy-badge__ponto" />
              </span>
            )}
            <Botao
              variante="secundario"
              tamanho="pequeno"
              icone={ArrowRightLeft}
              onClick={() => avisar({ tom: 'info', titulo: 'Transferir atendimento', texto: 'IA → vendedor, vendedor → vendedor ou vendedor → supervisor.' })}
            >
              Transferir
            </Botao>
          </header>

          <div className="vy-conversas__mensagens">
            {mensagens.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 'var(--text-sm)', padding: 'var(--space-10)' }}>
                Nenhuma mensagem carregada para esta conversa na demonstração.
              </p>
            ) : (
              mensagens.map((mensagem) => <Balao key={mensagem.id} mensagem={mensagem} />)
            )}
            <div ref={fimDasMensagens} />
          </div>

          {/* Ações de IA para o vendedor. Ficam acima do campo porque são
              usadas antes de escrever, não depois. */}
          <div className="vy-conversas__acoes-ia vy-scroll-x">
            {['Sugerir resposta', 'Resumir conversa', 'Analisar sentimento', 'Próximo passo', 'Corrigir texto'].map((acao) => (
              <button
                key={acao}
                className="vy-conversas__acao-ia"
                onClick={() => avisar({ tom: 'marca', titulo: `VEYRA AI · ${acao}`, texto: 'Consultando a base interna antes do provedor externo.' })}
              >
                <Sparkles size={12} />
                {acao}
              </button>
            ))}
          </div>

          <footer className="vy-conversas__campo">
            <Botao variante="fantasma" tamanho="pequeno" icone={Paperclip} aria-label="Anexar" />
            <input
              className="vy-grow"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder={`Responder por ${ROTULO_CANAL[ativa.canal]}…`}
              aria-label="Mensagem"
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}
            />
            <Botao variante="fantasma" tamanho="pequeno" icone={Smile} aria-label="Emoji" />
            <Botao variante="fantasma" tamanho="pequeno" icone={Mic} aria-label="Áudio" />
            <Botao variante="primario" tamanho="pequeno" icone={Send} onClick={enviar}>
              Enviar
            </Botao>
          </footer>
        </section>

        {/* ---------- Contexto ---------- */}
        <aside className="vy-conversas__contexto vy-card vy-only-desktop">
          <ContextoDoContato conversa={ativa} />
        </aside>
      </div>
    </Pagina>
  );
}

function Balao({ mensagem }: { mensagem: Message }) {
  if (mensagem.tipo === 'sistema') {
    return (
      <div className="vy-conversas__sistema">
        <Sparkles size={11} />
        {mensagem.conteudo}
      </div>
    );
  }

  const daCasa = mensagem.autor !== 'cliente';
  const daIa = mensagem.autor === 'ia';

  return (
    <div className={`vy-balao ${daCasa ? 'vy-balao--casa' : ''}`}>
      <div className="vy-balao__conteudo" data-ia={daIa}>
        {daCasa && (
          <span className="vy-balao__autor">
            {daIa ? <Bot size={11} /> : <User size={11} />}
            {mensagem.autorNome}
          </span>
        )}
        {mensagem.anexo ? (
          <span className="vy-balao__anexo">
            <FileText size={16} />
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>{mensagem.anexo.nome}</span>
              <span style={{ fontSize: 'var(--text-2xs)', opacity: 0.75 }}>{mensagem.anexo.tamanho}</span>
            </span>
          </span>
        ) : (
          <p>{mensagem.conteudo}</p>
        )}
        <span className="vy-balao__hora">{tempoRelativo(mensagem.em)}</span>
      </div>
    </div>
  );
}

function ContextoDoContato({ conversa }: { conversa: Conversation }) {
  const lead = leadPorId(conversa.leadId);
  const cliente = clientePorId(conversa.clienteId);
  const responsavel = usuarioPorId(conversa.responsavelId);
  const produto = produtoPorId(lead?.produtoId);
  const contratosDoCliente = cliente ? CLIENTES.filter((c) => c.id === cliente.id) : [];

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)', padding: 'var(--space-4)' }}>
      <div className="vy-row" style={{ gap: 'var(--space-3)' }}>
        <Avatar nome={conversa.contatoNome} tamanho={44} />
        <div className="vy-grow" style={{ minWidth: 0 }}>
          <strong className="vy-truncate" style={{ display: 'block', color: 'var(--text-strong)' }}>
            {conversa.contatoNome}
          </strong>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {cliente ? 'Cliente desde ' + tempoRelativo(cliente.desde) : lead ? 'Lead' : 'Contato'}
          </span>
        </div>
        {lead && <AnelScore valor={lead.score} tamanho={44} />}
      </div>

      <dl className="vy-stack" style={{ gap: 'var(--space-3)' }}>
        <ItemContexto rotulo="Produto" valor={produto?.nome ?? '—'} />
        <ItemContexto rotulo="Responsável" valor={responsavel?.nome ?? 'VEYRA AI'} />
        <ItemContexto rotulo="Última interação" valor={tempoRelativo(conversa.ultimaMensagemEm)} />
        <ItemContexto rotulo="Próxima ação" valor={lead?.proximaAtividadeEm ? tempoRelativo(lead.proximaAtividadeEm) : '—'} />
        {lead?.valorEstimado && <ItemContexto rotulo="Potencial" valor={formatarMoeda(lead.valorEstimado)} />}
        {cliente && <ItemContexto rotulo="Valor vitalício" valor={formatarMoeda(cliente.valorVitalicio)} />}
        {cliente?.csatMedio && <ItemContexto rotulo="CSAT" valor={`${formatarNumero(cliente.csatMedio, 1)} / 5`} />}
      </dl>

      {cliente && (
        <Cartao preenchido style={{ background: 'var(--surface-sunken)' }}>
          <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
            Do cliente
          </div>
          <div className="vy-stack" style={{ gap: 'var(--space-2)' }}>
            {['Contratos', 'Cotações', 'Financeiro', 'Chamados', 'Documentos'].map((secao) => (
              <button key={secao} className="vy-row-between" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: '100%' }}>
                {secao}
                <span className="vy-mono">{secao === 'Contratos' ? contratosDoCliente.length : '—'}</span>
              </button>
            ))}
          </div>
        </Cartao>
      )}

      {conversa.estado === 'ia_atendendo' && (
        <Cartao destaque preenchido>
          <div className="vy-row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Bot size={14} color="var(--vy-violet-400)" />
            <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-strong)' }}>O que a IA já identificou</strong>
          </div>
          <ul className="vy-stack" style={{ gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <li>Intenção: contratar consórcio de imóvel</li>
            <li>Valor: R$ 150.000</li>
            <li>Restrição: parcela até R$ 1.200</li>
            <li>Prioridade declarada: contemplação rápida</li>
            <li>Fonte da resposta: base interna (sem provedor externo)</li>
          </ul>
        </Cartao>
      )}
    </div>
  );
}

function ItemContexto({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="vy-row-between" style={{ alignItems: 'baseline', gap: 'var(--space-3)' }}>
      <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{rotulo}</dt>
      <dd className="vy-truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', textAlign: 'right' }}>
        {valor}
      </dd>
    </div>
  );
}
