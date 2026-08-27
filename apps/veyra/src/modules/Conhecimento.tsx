import { useMemo, useState } from 'react';
import { Bot, BookOpen, Check, FileText, Plus, Search, Sparkles, TrendingUp } from 'lucide-react';
import type { KnowledgeArticle } from '@veyra/core';
import {
  AreaTexto,
  Botao,
  Busca,
  Cartao,
  CartaoCabecalho,
  CartaoCorpo,
  Campo,
  Entrada,
  EstadoVazio,
  Modal,
  Segmentado,
  Selecao,
  Selo,
  useAvisos,
} from '../components';
import { GraficoBarras, Indicador, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { CONHECIMENTO } from '../data/base';

/**
 * VEYRA Knowledge
 *
 * A base tem dois leitores e um contrato entre eles: a equipe consulta
 * para responder, e a IA consulta antes de responder. É por isso que o
 * estado "aprovado" não é enfeite de fluxo — artigo em rascunho fica
 * disponível para a pessoa julgar, mas nunca sai pela boca da IA.
 *
 * A coluna de usos pela IA existe para responder à pergunta que decide
 * onde investir tempo de escrita: qual artigo está segurando a operação.
 */
export function Conhecimento() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState<'todos' | 'aprovados' | 'rascunhos'>('todos');
  const [categoria, setCategoria] = useState('todas');
  const [lendo, setLendo] = useState<KnowledgeArticle | null>(null);
  const [criando, setCriando] = useState(false);

  const categorias = useMemo(
    () => [...new Set(CONHECIMENTO.map((a) => a.categoria))].sort(),
    [versaoDados],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return CONHECIMENTO.filter((artigo) => {
      if (estado === 'aprovados' && !artigo.aprovado) return false;
      if (estado === 'rascunhos' && artigo.aprovado) return false;
      if (categoria !== 'todas' && artigo.categoria !== categoria) return false;
      if (termo && !`${artigo.titulo} ${artigo.conteudo} ${artigo.categoria}`.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    }).sort((a, b) => b.usosPelaIa - a.usosPelaIa);
  }, [busca, estado, categoria, versaoDados]);

  const aprovados = CONHECIMENTO.filter((a) => a.aprovado);
  const usosTotais = CONHECIMENTO.reduce((s, a) => s + a.usosPelaIa, 0);
  const maisUsados = [...CONHECIMENTO]
    .filter((a) => a.usosPelaIa > 0)
    .sort((a, b) => b.usosPelaIa - a.usosPelaIa)
    .slice(0, 6);

  return (
    <Pagina
      titulo="VEYRA Knowledge"
      subtitulo="A mesma base que a equipe consulta é a que a IA lê antes de responder. Artigo em rascunho fica visível para a equipe, mas a IA não o usa."
      acoes={
        pode('conhecimento.criar') ? (
          <Botao variante="primario" icone={Plus} onClick={() => setCriando(true)}>
            Novo artigo
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Artigos publicados" valor={formatarNumero(aprovados.length)} contexto={`${CONHECIMENTO.length - aprovados.length} em rascunho`} icone={BookOpen} />
        <Indicador rotulo="Consultas da IA" valor={formatarNumero(usosTotais)} delta={16.4} contexto="últimos 30 dias" icone={Bot} />
        <Indicador
          rotulo="Cobertura da base"
          valor={formatarPercentual((aprovados.length / CONHECIMENTO.length) * 100, 0)}
          contexto="do acervo já revisado"
          icone={Check}
        />
        <Indicador rotulo="Respostas sem provedor externo" valor={formatarPercentual(84, 0)} delta={4.2} icone={TrendingUp} />
      </div>

      <div className="vy-grid-2" style={{ marginBottom: 'var(--space-5)' }}>
        <Cartao>
          <CartaoCabecalho
            titulo="O que a IA mais consulta"
            descricao="É onde vale investir tempo de escrita: estes artigos seguram a operação."
          />
          <CartaoCorpo>
            <GraficoBarras
              dados={maisUsados.map((a) => ({
                rotulo: a.titulo.length > 24 ? `${a.titulo.slice(0, 24)}…` : a.titulo,
                valor: a.usosPelaIa,
              }))}
              formatar={(v) => `${formatarNumero(v)} consultas`}
              horizontal
            />
          </CartaoCorpo>
        </Cartao>

        <Cartao destaque>
          <CartaoCabecalho
            titulo={
              <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                <Sparkles size={15} color="var(--vy-violet-400)" />
                Lacunas apontadas pela IA
              </span>
            }
            descricao="Perguntas que chegaram e não encontraram resposta aprovada na base."
          />
          <CartaoCorpo>
            <ul className="vy-stack" style={{ gap: 'var(--space-3)' }}>
              {[
                ['“Posso transferir minha cota para outra pessoa?”', 'Consórcio · 34 vezes em 30 dias'],
                ['“O que acontece se eu atrasar uma parcela?”', 'Consórcio · 28 vezes'],
                ['“Plano cobre cirurgia bariátrica?”', 'Saúde · 19 vezes'],
                ['“Seguro cobre carro emprestado?”', 'Seguro · 12 vezes'],
              ].map(([pergunta, contexto]) => (
                <li key={pergunta} className="vy-row-between" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-default)' }}>{pergunta}</span>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{contexto}</span>
                  </span>
                  {pode('conhecimento.criar') && (
                    <Botao variante="fantasma" tamanho="pequeno" onClick={() => setCriando(true)}>
                      Escrever
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          </CartaoCorpo>
        </Cartao>
      </div>

      <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por título, conteúdo ou categoria…" className="vy-grow" />
        <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: 'auto' }} aria-label="Categoria">
          <option value="todas">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
        <Segmentado
          opcoes={[
            { valor: 'todos' as const, rotulo: 'Todos' },
            { valor: 'aprovados' as const, rotulo: 'Aprovados' },
            { valor: 'rascunhos' as const, rotulo: 'Rascunhos' },
          ]}
          valor={estado}
          aoMudar={setEstado}
        />
      </div>

      {filtrados.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={Search}
            titulo="Nenhum artigo encontrado"
            texto="Se a pergunta chega e a base não responde, ela vira lacuna — e o próximo artigo já tem tema."
            acao={
              pode('conhecimento.criar') ? (
                <Botao variante="secundario" icone={Plus} onClick={() => setCriando(true)}>
                  Escrever artigo
                </Botao>
              ) : undefined
            }
          />
        </Cartao>
      ) : (
        <div className="vy-grid-2">
          {filtrados.map((artigo) => (
            <Cartao key={artigo.id} preenchido interativo onClick={() => setLendo(artigo)}>
              <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
                    <FileText size={14} color="var(--text-subtle)" style={{ flexShrink: 0 }} />
                    <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{artigo.titulo}</strong>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                    {artigo.categoria}
                    {artigo.segmento && ` · ${artigo.segmento}`} · {artigo.autor}
                  </div>
                </div>
                <Selo tom={artigo.aprovado ? 'sucesso' : 'atencao'}>{artigo.aprovado ? 'aprovado' : 'rascunho'}</Selo>
              </div>

              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  marginTop: 'var(--space-3)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                {artigo.conteudo}
              </p>

              <div
                className="vy-row-between"
                style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}
              >
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                  atualizado {tempoRelativo(artigo.atualizadoEm)}
                </span>
                <span className="vy-row" style={{ gap: 5 }}>
                  <Bot size={12} color={artigo.aprovado ? 'var(--vy-violet-400)' : 'var(--text-subtle)'} />
                  <strong
                    className="vy-numeric"
                    style={{ fontSize: 'var(--text-xs)', color: artigo.aprovado ? 'var(--vy-violet-400)' : 'var(--text-subtle)' }}
                  >
                    {formatarNumero(artigo.usosPelaIa)}×
                  </strong>
                </span>
              </div>
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={!!lendo}
        aoFechar={() => setLendo(null)}
        largura={640}
        titulo={lendo?.titulo ?? ''}
        descricao={lendo ? `${lendo.categoria} · ${lendo.autor} · atualizado ${tempoRelativo(lendo.atualizadoEm)}` : undefined}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setLendo(null)}>
              Fechar
            </Botao>
            {lendo && !lendo.aprovado && pode('conhecimento.editar') && (
              <Botao
                variante="primario"
                onClick={() =>
                  avisar({
                    tom: 'sucesso',
                    titulo: 'Artigo aprovado',
                    texto: 'A partir de agora a IA pode usar este conteúdo para responder.',
                  })
                }
              >
                Aprovar para a IA
              </Botao>
            )}
          </>
        }
      >
        {lendo && (
          <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
            <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
              <Selo tom={lendo.aprovado ? 'sucesso' : 'atencao'}>{lendo.aprovado ? 'aprovado' : 'rascunho'}</Selo>
              <Selo tom="neutro">{lendo.categoria}</Selo>
              {lendo.segmento && <Selo tom="info">{lendo.segmento}</Selo>}
              <Selo tom="marca">
                <Bot size={10} /> {formatarNumero(lendo.usosPelaIa)} consultas
              </Selo>
            </div>

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)', lineHeight: 'var(--leading-normal)' }}>
              {lendo.conteudo}
            </p>

            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: lendo.aprovado ? 'var(--vy-gradient-soft)' : 'var(--warning-soft)',
                border: `1px solid ${lendo.aprovado ? 'rgb(113 87 255 / 0.24)' : 'rgb(245 165 36 / 0.3)'}`,
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {lendo.aprovado
                ? 'Este artigo está no primeiro nível de consulta da IA: ela responde por aqui antes de tentar qualquer provedor externo.'
                : 'Rascunho. A equipe consegue ler, mas a IA não usa este conteúdo para responder — só o que foi revisado sai pela boca dela.'}
            </div>
          </div>
        )}
      </Modal>

      <FormularioArtigo aberto={criando} aoFechar={() => setCriando(false)} categorias={categorias} />
    </Pagina>
  );
}

function FormularioArtigo({
  aberto,
  aoFechar,
  categorias,
}: {
  aberto: boolean;
  aoFechar: () => void;
  categorias: string[];
}) {
  const { avisar } = useAvisos();
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState(categorias[0] ?? 'Produto');
  const [conteudo, setConteudo] = useState('');
  const [erro, setErro] = useState('');

  function salvar() {
    if (titulo.trim().length < 5 || conteudo.trim().length < 20) {
      setErro('Título e conteúdo precisam ser específicos o bastante para responder sozinhos.');
      return;
    }
    avisar({
      tom: 'sucesso',
      titulo: 'Artigo salvo como rascunho',
      texto: 'Ele entra para a IA depois da aprovação.',
    });
    setTitulo('');
    setConteudo('');
    setErro('');
    aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura={620}
      titulo="Novo artigo"
      descricao="Escreva a resposta como você a daria ao cliente. É esse texto que a IA vai usar."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar}>
            Salvar rascunho
          </Botao>
        </>
      }
    >
      <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
        <Campo rotulo="Título *" erro={erro}>
          <Entrada
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Posso transferir minha cota para outra pessoa?"
            invalido={!!erro}
            autoFocus
          />
        </Campo>
        <Campo rotulo="Categoria">
          <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Resposta *">
          <AreaTexto
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Sim. A transferência de cota exige anuência da administradora e…"
            style={{ minHeight: 160 }}
          />
        </Campo>
      </div>
    </Modal>
  );
}
