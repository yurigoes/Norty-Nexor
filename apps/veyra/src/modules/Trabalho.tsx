import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Check,
  CheckSquare,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  Users,
  Zap,
} from 'lucide-react';
import type { Appointment, Task, TicketPriority } from '@veyra/core';
import {
  AreaTexto,
  Botao,
  BotaoIcone,
  Campo,
  Cartao,
  CartaoCabecalho,
  CartaoCorpo,
  Entrada,
  EstadoVazio,
  Modal,
  Segmentado,
  Selecao,
  Selo,
  useAvisos,
} from '../components';
import { Indicador, formatarNumero, formatarPercentual } from '../components/Charts';
import { ROTULO_PRIORIDADE } from '../app/rotulos';
import { Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import {
  alternarTarefa,
  atualizarCompromisso,
  atualizarTarefa,
  cancelarCompromisso,
  criarCompromisso,
  criarTarefa,
  excluirTarefa,
} from '../data/acoes';
import { AGORA, CLIENTES, COMPROMISSOS, TAREFAS, clientePorId, leadPorId, usuarioPorId, USUARIOS } from '../data/base';

const AGORA_MS = new Date(AGORA).getTime();

const TIPOS_TAREFA: [Task['tipo'], string][] = [
  ['ligacao', 'Ligação'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'E-mail'],
  ['reuniao', 'Reunião'],
  ['documento', 'Documento'],
  ['outro', 'Outro'],
];

const PRIORIDADES: TicketPriority[] = ['baixa', 'normal', 'alta', 'critica'];

/** ISO → valor aceito por `<input type="datetime-local">`, em hora local. */
function paraCampoDataHora(iso: string): string {
  const d = new Date(iso);
  const deslocado = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return deslocado.toISOString().slice(0, 16);
}

function deCampoDataHora(valor: string): string {
  return new Date(valor).toISOString();
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* =========================================================
   Tarefas
   ========================================================= */

export function Tarefas() {
  const { pode, versaoDados, invalidar } = useSessao();
  const { avisar } = useAvisos();
  const [filtro, setFiltro] = useState<'abertas' | 'atrasadas' | 'concluidas' | 'todas'>('abertas');
  const [emEdicao, setEmEdicao] = useState<Task | null>(null);
  const [criando, setCriando] = useState(false);

  const filtradas = useMemo(
    () =>
      TAREFAS.filter((t) => {
        if (filtro === 'abertas') return !t.concluida;
        if (filtro === 'atrasadas') return !t.concluida && new Date(t.vence).getTime() < AGORA_MS;
        if (filtro === 'concluidas') return t.concluida;
        return true;
      }).sort((a, b) => (a.vence < b.vence ? -1 : 1)),
    [filtro, versaoDados],
  );

  const abertas = TAREFAS.filter((t) => !t.concluida);
  const atrasadas = abertas.filter((t) => new Date(t.vence).getTime() < AGORA_MS);
  const concluidas = TAREFAS.filter((t) => t.concluida);

  function alternar(tarefa: Task) {
    if (!pode('tarefas.editar')) {
      avisar({ tom: 'perigo', titulo: 'Sem permissão', texto: 'Seu papel não permite concluir tarefas.' });
      return;
    }
    const atualizada = alternarTarefa(tarefa.id);
    invalidar();
    avisar({
      tom: atualizada?.concluida ? 'sucesso' : 'info',
      titulo: atualizada?.concluida ? 'Tarefa concluída' : 'Tarefa reaberta',
      texto: tarefa.titulo,
    });
  }

  function remover(tarefa: Task) {
    excluirTarefa(tarefa.id);
    invalidar();
    avisar({ tom: 'atencao', titulo: 'Tarefa excluída', texto: tarefa.titulo });
  }

  return (
    <Pagina
      titulo="Tarefas"
      subtitulo="O que não tem próxima ação com dono e prazo não acontece. Esta é a lista que impede o lead de morrer de esquecimento."
      acoes={
        <>
          <Segmentado
            opcoes={[
              { valor: 'abertas' as const, rotulo: `Abertas (${abertas.length})` },
              { valor: 'atrasadas' as const, rotulo: `Atrasadas (${atrasadas.length})` },
              { valor: 'concluidas' as const, rotulo: 'Concluídas' },
              { valor: 'todas' as const, rotulo: 'Todas' },
            ]}
            valor={filtro}
            aoMudar={setFiltro}
          />
          {pode('tarefas.criar') && (
            <Botao variante="primario" icone={Plus} onClick={() => setCriando(true)}>
              Nova tarefa
            </Botao>
          )}
        </>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Abertas" valor={formatarNumero(abertas.length)} icone={CheckSquare} />
        <Indicador rotulo="Atrasadas" valor={formatarNumero(atrasadas.length)} contexto="prazo já vencido" icone={Clock} />
        <Indicador rotulo="Concluídas" valor={formatarNumero(concluidas.length)} icone={Check} />
        <Indicador
          rotulo="Taxa de conclusão"
          valor={formatarPercentual(TAREFAS.length ? (concluidas.length / TAREFAS.length) * 100 : 0, 0)}
          icone={Zap}
        />
      </div>

      {filtradas.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={CheckSquare}
            titulo="Nada neste recorte"
            texto="Troque o filtro, ou crie a próxima ação para o lead que está esperando retorno."
            acao={
              pode('tarefas.criar') ? (
                <Botao variante="secundario" icone={Plus} onClick={() => setCriando(true)}>
                  Nova tarefa
                </Botao>
              ) : undefined
            }
          />
        </Cartao>
      ) : (
        <Cartao>
          <ul>
            {filtradas.map((tarefa) => {
              const atrasada = !tarefa.concluida && new Date(tarefa.vence).getTime() < AGORA_MS;
              const alvo = clientePorId(tarefa.clienteId)?.nome ?? leadPorId(tarefa.leadId)?.nome;
              return (
                <li
                  key={tarefa.id}
                  className="vy-row"
                  style={{
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    borderBottom: '1px solid var(--border-subtle)',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* A caixa é um botão de verdade: alterna a conclusão,
                      responde ao teclado e diz o que faz. */}
                  <button
                    onClick={() => alternar(tarefa)}
                    aria-pressed={tarefa.concluida}
                    aria-label={tarefa.concluida ? `Reabrir ${tarefa.titulo}` : `Concluir ${tarefa.titulo}`}
                    title={tarefa.concluida ? 'Reabrir' : 'Concluir'}
                    style={{
                      marginTop: 2,
                      display: 'grid',
                      placeItems: 'center',
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      borderRadius: 5,
                      border: `1.5px solid ${tarefa.concluida ? 'var(--success)' : 'var(--border-strong)'}`,
                      background: tarefa.concluida ? 'var(--success)' : 'transparent',
                      transition: 'all var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    {tarefa.concluida && <Check size={12} color="#06231a" strokeWidth={3.4} />}
                  </button>

                  <div className="vy-grow" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: tarefa.concluida ? 'var(--text-subtle)' : 'var(--text-default)',
                        textDecoration: tarefa.concluida ? 'line-through' : 'none',
                      }}
                    >
                      {tarefa.titulo}
                    </div>
                    {tarefa.descricao && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {tarefa.descricao}
                      </div>
                    )}
                    <div className="vy-row vy-wrap" style={{ gap: 'var(--space-3)', marginTop: 4 }}>
                      <span style={{ fontSize: 'var(--text-2xs)', color: atrasada ? 'var(--danger)' : 'var(--text-subtle)' }}>
                        {atrasada ? 'Atrasada · ' : ''}
                        {tarefa.concluida ? `concluída ${tempoRelativo(tarefa.concluidaEm)}` : tempoRelativo(tarefa.vence)}
                      </span>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                        {usuarioPorId(tarefa.responsavelId)?.nome}
                      </span>
                      {alvo && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{alvo}</span>}
                    </div>
                  </div>

                  <span className="vy-row" style={{ gap: 'var(--space-2)', flexShrink: 0 }}>
                    <Selo tom="neutro">{TIPOS_TAREFA.find(([t]) => t === tarefa.tipo)?.[1] ?? tarefa.tipo}</Selo>
                    {tarefa.prioridade === 'critica' && <Selo tom="perigo">crítica</Selo>}
                    {tarefa.prioridade === 'alta' && <Selo tom="atencao">alta</Selo>}
                    {pode('tarefas.editar') && (
                      <BotaoIcone icone={Pencil} rotulo="Editar tarefa" onClick={() => setEmEdicao(tarefa)} />
                    )}
                    {pode('tarefas.editar') && tarefa.concluida && (
                      <BotaoIcone icone={Undo2} rotulo="Reabrir tarefa" onClick={() => alternar(tarefa)} />
                    )}
                    {pode('tarefas.excluir') && (
                      <BotaoIcone icone={Trash2} rotulo="Excluir tarefa" onClick={() => remover(tarefa)} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <FormularioTarefa aberto={criando} tarefa={null} aoFechar={() => setCriando(false)} />
      <FormularioTarefa aberto={!!emEdicao} tarefa={emEdicao} aoFechar={() => setEmEdicao(null)} />
    </Pagina>
  );
}

function FormularioTarefa({
  aberto,
  tarefa,
  aoFechar,
}: {
  aberto: boolean;
  tarefa: Task | null;
  aoFechar: () => void;
}) {
  const { usuario, invalidar } = useSessao();
  const { avisar } = useAvisos();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavelId, setResponsavelId] = useState(usuario.id);
  const [vence, setVence] = useState('');
  const [prioridade, setPrioridade] = useState<TicketPriority>('normal');
  const [tipo, setTipo] = useState<Task['tipo']>('ligacao');
  const [clienteId, setClienteId] = useState('');
  const [erro, setErro] = useState('');
  /* Recarrega os campos quando o modal muda de alvo, sem `useEffect`:
     comparar a chave é mais previsível do que sincronizar por efeito. */
  const [alvoCarregado, setAlvoCarregado] = useState<string | null>(null);

  const chave = tarefa?.id ?? (aberto ? 'novo' : null);
  if (aberto && chave !== alvoCarregado) {
    setAlvoCarregado(chave);
    setTitulo(tarefa?.titulo ?? '');
    setDescricao(tarefa?.descricao ?? '');
    setResponsavelId(tarefa?.responsavelId ?? usuario.id);
    setVence(paraCampoDataHora(tarefa?.vence ?? AGORA));
    setPrioridade(tarefa?.prioridade ?? 'normal');
    setTipo(tarefa?.tipo ?? 'ligacao');
    setClienteId(tarefa?.clienteId ?? '');
    setErro('');
  }
  if (!aberto && alvoCarregado !== null) setAlvoCarregado(null);

  function salvar() {
    if (titulo.trim().length < 3) {
      setErro('Descreva a ação em pelo menos três caracteres.');
      return;
    }
    if (!vence) {
      setErro('Toda tarefa precisa de prazo — é o prazo que faz a lista funcionar.');
      return;
    }

    const dados = {
      titulo,
      descricao: descricao || undefined,
      responsavelId,
      vence: deCampoDataHora(vence),
      prioridade,
      tipo,
      clienteId: clienteId || undefined,
    };

    if (tarefa) {
      atualizarTarefa(tarefa.id, dados);
      avisar({ tom: 'sucesso', titulo: 'Tarefa atualizada', texto: titulo });
    } else {
      criarTarefa(dados);
      avisar({
        tom: 'sucesso',
        titulo: 'Tarefa criada',
        texto: `${titulo} · ${usuarioPorId(responsavelId)?.nome.split(' ')[0]}`,
      });
    }
    invalidar();
    aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura={560}
      titulo={tarefa ? 'Editar tarefa' : 'Nova tarefa'}
      descricao="Dono e prazo são obrigatórios: é o que separa uma tarefa de uma intenção."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar}>
            {tarefa ? 'Salvar alterações' : 'Criar tarefa'}
          </Botao>
        </>
      }
    >
      <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
        <Campo rotulo="O que precisa ser feito *" erro={erro}>
          <Entrada
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ligar para Gustavo com a simulação pronta"
            invalido={!!erro}
            autoFocus
          />
        </Campo>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Campo rotulo="Responsável *">
            <Selecao value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              {USUARIOS.filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Prazo *">
            <Entrada type="datetime-local" value={vence} onChange={(e) => setVence(e.target.value)} />
          </Campo>
        </div>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Campo rotulo="Tipo">
            <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as Task['tipo'])}>
              {TIPOS_TAREFA.map(([chaveTipo, rotulo]) => (
                <option key={chaveTipo} value={chaveTipo}>
                  {rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Prioridade">
            <Selecao value={prioridade} onChange={(e) => setPrioridade(e.target.value as TicketPriority)}>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PRIORIDADE[p]}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Cliente">
            <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Nenhum</option>
              {CLIENTES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>

        <Campo rotulo="Detalhes">
          <AreaTexto
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Contexto que a próxima pessoa precisa para agir sem perguntar."
          />
        </Campo>
      </div>
    </Modal>
  );
}

/* =========================================================
   Agenda
   ========================================================= */

const TIPOS_COMPROMISSO: [Appointment['tipo'], string][] = [
  ['reuniao', 'Reunião'],
  ['ligacao', 'Ligação'],
  ['visita', 'Visita'],
  ['assembleia', 'Assembleia'],
  ['interno', 'Interno'],
];

const COR_TIPO: Record<Appointment['tipo'], string> = {
  reuniao: 'var(--chart-5)',
  ligacao: 'var(--chart-1)',
  visita: 'var(--chart-3)',
  assembleia: 'var(--chart-2)',
  interno: 'var(--chart-4)',
};

/** Segunda-feira da semana que contém a data informada. */
function inicioDaSemana(base: Date): Date {
  const d = new Date(base);
  const diaDaSemana = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diaDaSemana);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function Agenda() {
  const { pode, versaoDados, invalidar } = useSessao();
  const { avisar } = useAvisos();
  const [semanaBase, setSemanaBase] = useState(() => inicioDaSemana(new Date(AGORA)));
  const [emEdicao, setEmEdicao] = useState<Appointment | null>(null);
  const [criando, setCriando] = useState<Date | null>(null);

  const dias = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semanaBase);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [semanaBase],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, Appointment[]>();
    for (const dia of dias) mapa.set(dia.toDateString(), []);
    for (const compromisso of COMPROMISSOS) {
      if (compromisso.cancelado) continue;
      const chaveDia = new Date(compromisso.inicia).toDateString();
      mapa.get(chaveDia)?.push(compromisso);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => (a.inicia < b.inicia ? -1 : 1));
    return mapa;
  }, [dias, versaoDados]);

  const daSemana = dias.flatMap((d) => porDia.get(d.toDateString()) ?? []);
  const automaticos = daSemana.filter((c) => c.automatico).length;

  function mudarSemana(passos: number) {
    const nova = new Date(semanaBase);
    nova.setDate(nova.getDate() + passos * 7);
    setSemanaBase(nova);
  }

  function cancelar(compromisso: Appointment) {
    cancelarCompromisso(compromisso.id);
    invalidar();
    avisar({
      tom: 'atencao',
      titulo: 'Compromisso cancelado',
      texto: 'O registro fica guardado como cancelado, não some do histórico.',
    });
  }

  const hoje = new Date(AGORA).toDateString();

  return (
    <Pagina
      titulo="Agenda"
      subtitulo="Compromissos, follow-ups e lembretes da semana, ligados ao cliente que os originou."
      acoes={
        <>
          <div className="vy-row" style={{ gap: 'var(--space-1)' }}>
            <Botao variante="secundario" tamanho="pequeno" onClick={() => mudarSemana(-1)}>
              ← Semana anterior
            </Botao>
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => setSemanaBase(inicioDaSemana(new Date(AGORA)))}>
              Hoje
            </Botao>
            <Botao variante="secundario" tamanho="pequeno" onClick={() => mudarSemana(1)}>
              Próxima semana →
            </Botao>
          </div>
          {pode('agenda.criar') && (
            <Botao variante="primario" icone={CalendarPlus} onClick={() => setCriando(new Date(AGORA))}>
              Novo compromisso
            </Botao>
          )}
        </>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Compromissos na semana" valor={formatarNumero(daSemana.length)} icone={Calendar} />
        <Indicador rotulo="Criados por automação" valor={formatarNumero(automaticos)} contexto="follow-up sem digitação" icone={Zap} />
        <Indicador
          rotulo="Reuniões"
          valor={formatarNumero(daSemana.filter((c) => c.tipo === 'reuniao').length)}
          icone={Users}
        />
        <Indicador
          rotulo="Com cliente vinculado"
          valor={formatarNumero(daSemana.filter((c) => c.clienteId).length)}
          contexto="aparecem no 360° do cliente"
          icone={CheckSquare}
        />
      </div>

      <div className="vy-agenda vy-scroll-x">
        {dias.map((dia) => {
          const doDia = porDia.get(dia.toDateString()) ?? [];
          const ehHoje = dia.toDateString() === hoje;
          return (
            <section key={dia.toISOString()} className="vy-agenda__dia" data-hoje={ehHoje}>
              <header className="vy-agenda__cabecalho">
                <span>
                  <span className="vy-eyebrow">
                    {dia.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <strong style={{ display: 'block', fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>
                    {dia.getDate()}
                  </strong>
                </span>
                {pode('agenda.criar') && (
                  <BotaoIcone icone={Plus} rotulo={`Adicionar em ${dia.toLocaleDateString('pt-BR')}`} onClick={() => setCriando(dia)} />
                )}
              </header>

              <div className="vy-agenda__lista">
                {doDia.length === 0 ? (
                  <button
                    className="vy-agenda__vazio"
                    onClick={() => pode('agenda.criar') && setCriando(dia)}
                    disabled={!pode('agenda.criar')}
                  >
                    {pode('agenda.criar') ? 'Livre — clique para agendar' : 'Livre'}
                  </button>
                ) : (
                  doDia.map((compromisso) => (
                    <article
                      key={compromisso.id}
                      className="vy-agenda__item"
                      style={{ borderLeftColor: COR_TIPO[compromisso.tipo] }}
                      onDoubleClick={() => pode('agenda.editar') && setEmEdicao(compromisso)}
                    >
                      <div className="vy-row-between" style={{ gap: 'var(--space-2)' }}>
                        <span className="vy-mono" style={{ color: 'var(--text-muted)' }}>
                          {horaCurta(compromisso.inicia)}
                        </span>
                        {compromisso.automatico && <Selo tom="marca">auto</Selo>}
                      </div>
                      <strong style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', marginTop: 3 }}>
                        {compromisso.titulo}
                      </strong>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', marginTop: 3 }}>
                        {usuarioPorId(compromisso.responsavelId)?.nome.split(' ')[0]}
                        {compromisso.clienteId && ` · ${clientePorId(compromisso.clienteId)?.nome.split(' ')[0]}`}
                      </div>
                      {compromisso.local && (
                        <div className="vy-row" style={{ gap: 4, marginTop: 4, fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                          <MapPin size={10} />
                          {compromisso.local}
                        </div>
                      )}
                      {pode('agenda.editar') && (
                        <div className="vy-agenda__acoes">
                          <BotaoIcone icone={Pencil} rotulo="Editar" onClick={() => setEmEdicao(compromisso)} />
                          <BotaoIcone icone={Trash2} rotulo="Cancelar" onClick={() => cancelar(compromisso)} />
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Cartao style={{ marginTop: 'var(--space-5)' }}>
        <CartaoCabecalho
          titulo="Como a agenda se enche sozinha"
          descricao="Boa parte do que aparece aqui não foi digitado por ninguém."
        />
        <CartaoCorpo>
          <ul className="vy-stack" style={{ gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            <li>Lead com score acima de 80 gera contato em até 15 minutos.</li>
            <li>Contrato que renova em 60 dias abre reunião com o responsável.</li>
            <li>CSAT igual ou abaixo de 3 marca ligação de retenção no mesmo dia.</li>
            <li>Proposta parada há 48 horas vira follow-up para quem a enviou.</li>
          </ul>
        </CartaoCorpo>
      </Cartao>

      <FormularioCompromisso
        aberto={!!criando || !!emEdicao}
        compromisso={emEdicao}
        diaSugerido={criando}
        aoFechar={() => {
          setCriando(null);
          setEmEdicao(null);
        }}
      />
    </Pagina>
  );
}

function FormularioCompromisso({
  aberto,
  compromisso,
  diaSugerido,
  aoFechar,
}: {
  aberto: boolean;
  compromisso: Appointment | null;
  diaSugerido: Date | null;
  aoFechar: () => void;
}) {
  const { usuario, invalidar } = useSessao();
  const { avisar } = useAvisos();

  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<Appointment['tipo']>('reuniao');
  const [responsavelId, setResponsavelId] = useState(usuario.id);
  const [clienteId, setClienteId] = useState('');
  const [inicia, setInicia] = useState('');
  const [termina, setTermina] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const [alvoCarregado, setAlvoCarregado] = useState<string | null>(null);

  const chave = compromisso?.id ?? (diaSugerido ? `novo-${diaSugerido.toDateString()}` : null);
  if (aberto && chave !== alvoCarregado) {
    setAlvoCarregado(chave);
    /* Um compromisso novo começa às 9h do dia clicado e dura uma hora —
       o horário mais provável, já preenchido, evita quatro cliques. */
    const base = compromisso ? new Date(compromisso.inicia) : new Date(diaSugerido ?? new Date(AGORA));
    if (!compromisso) base.setHours(9, 0, 0, 0);
    const fim = compromisso ? new Date(compromisso.termina) : new Date(base.getTime() + 60 * 60_000);

    setTitulo(compromisso?.titulo ?? '');
    setTipo(compromisso?.tipo ?? 'reuniao');
    setResponsavelId(compromisso?.responsavelId ?? usuario.id);
    setClienteId(compromisso?.clienteId ?? '');
    setInicia(paraCampoDataHora(base.toISOString()));
    setTermina(paraCampoDataHora(fim.toISOString()));
    setLocal(compromisso?.local ?? '');
    setDescricao(compromisso?.descricao ?? '');
    setErro('');
  }
  if (!aberto && alvoCarregado !== null) setAlvoCarregado(null);

  function salvar() {
    if (titulo.trim().length < 3) {
      setErro('Dê um título que a outra pessoa entenda sem abrir o compromisso.');
      return;
    }
    if (!inicia || !termina) {
      setErro('Informe início e fim.');
      return;
    }
    if (new Date(termina) <= new Date(inicia)) {
      setErro('O fim precisa vir depois do início.');
      return;
    }

    const dados = {
      titulo,
      descricao: descricao || undefined,
      tipo,
      responsavelId,
      clienteId: clienteId || undefined,
      inicia: deCampoDataHora(inicia),
      termina: deCampoDataHora(termina),
      local: local || undefined,
    };

    if (compromisso) {
      atualizarCompromisso(compromisso.id, dados);
      avisar({ tom: 'sucesso', titulo: 'Compromisso atualizado', texto: titulo });
    } else {
      criarCompromisso(dados);
      avisar({
        tom: 'sucesso',
        titulo: 'Compromisso agendado',
        texto: `${titulo} · ${new Date(dados.inicia).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      });
    }
    invalidar();
    aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura={560}
      titulo={compromisso ? 'Editar compromisso' : 'Novo compromisso'}
      descricao="Vincular ao cliente faz o compromisso aparecer também na linha do tempo dele."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar}>
            {compromisso ? 'Salvar alterações' : 'Agendar'}
          </Botao>
        </>
      }
    >
      <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
        <Campo rotulo="Título *" erro={erro}>
          <Entrada
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Reunião de renovação — Marina Duarte"
            invalido={!!erro}
            autoFocus
          />
        </Campo>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Campo rotulo="Início *">
            <Entrada type="datetime-local" value={inicia} onChange={(e) => setInicia(e.target.value)} />
          </Campo>
          <Campo rotulo="Fim *">
            <Entrada type="datetime-local" value={termina} onChange={(e) => setTermina(e.target.value)} />
          </Campo>
        </div>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Campo rotulo="Tipo">
            <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as Appointment['tipo'])}>
              {TIPOS_COMPROMISSO.map(([chaveTipo, rotulo]) => (
                <option key={chaveTipo} value={chaveTipo}>
                  {rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Responsável">
            <Selecao value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              {USUARIOS.filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Cliente">
            <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Nenhum</option>
              {CLIENTES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>

        <Campo rotulo="Local ou link">
          <Entrada value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Google Meet, escritório do cliente…" />
        </Campo>

        <Campo rotulo="Pauta">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que precisa ser decidido nesse encontro." />
        </Campo>
      </div>
    </Modal>
  );
}
