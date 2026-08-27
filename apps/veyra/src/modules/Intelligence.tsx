import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Brain, Database, Gauge, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
import { AnelScore, Abas, Botao, Cartao, CartaoCabecalho, CartaoCorpo, Progresso, Selo } from '../components';
import { GraficoArea, GraficoBarras, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_SEVERIDADE } from '../app/rotulos';
import { CONHECIMENTO, INSIGHTS, PREVISOES, SERIE_IA_INTERNA, SERIE_MESES, leadPorId } from '../data/base';

type Aba = 'insights' | 'previsao' | 'ia' | 'conhecimento';


/**
 * VEYRA Intelligence
 *
 * O que diferencia esta tela de um relatório é que ela não devolve
 * números: devolve a próxima ação e o motivo dela. "87% de chance de
 * fechar" é inútil sozinho; "87%, porque abriu a cotação três vezes em
 * seis horas — ligue hoje entre 14h e 16h" é uma instrução.
 *
 * A aba "Camada de IA" existe para responder à pergunta que todo
 * comprador faz depois da demonstração: quanto custa e de quem eu
 * dependo. A resposta honesta é medida, não prometida.
 */
export function Intelligence() {
  const { versaoDados } = useSessao();
  const [aba, setAba] = useState<Aba>('insights');

  const custo = useMemo(
    () => ({ internas: 84, externas: 16, economia: 4820, latenciaInterna: 180, latenciaExterna: 1420 }),
    [versaoDados],
  );

  return (
    <Pagina
      titulo="VEYRA Intelligence"
      subtitulo="Score, previsão e recomendação a partir do histórico da sua operação — não de médias de mercado."
      acoes={
        <Botao variante="secundario" icone={Zap}>
          Recalcular scores
        </Botao>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Leads pontuados hoje" valor="342" delta={12.4} contexto="modelo v4 · atualizado há 20 min" icone={Gauge} />
        <Indicador rotulo="Previsão de fechamento (30d)" valor={formatarMoeda(1284000, true)} delta={6.8} contexto="soma ponderada do funil" icone={Target} />
        <Indicador rotulo="Respostas da base interna" valor={formatarPercentual(custo.internas, 0)} delta={4.2} contexto="sem provedor externo" icone={Database} />
        <Indicador rotulo="Economia mensal com IA" valor={formatarMoeda(custo.economia, true)} contexto="vs. tudo via provedor externo" icone={Brain} />
      </div>

      <Abas
        opcoes={[
          { valor: 'insights' as const, rotulo: 'Insights' },
          { valor: 'previsao' as const, rotulo: 'Previsão por lead' },
          { valor: 'ia' as const, rotulo: 'Camada de IA' },
          { valor: 'conhecimento' as const, rotulo: 'Base de conhecimento' },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      <div style={{ marginTop: 'var(--space-5)' }}>
        {aba === 'insights' && <PainelInsights />}
        {aba === 'previsao' && <PainelPrevisao />}
        {aba === 'ia' && <PainelIa custo={custo} />}
        {aba === 'conhecimento' && <PainelConhecimento />}
      </div>
    </Pagina>
  );
}

function PainelInsights() {
  return (
    <div className="vy-grid-2">
      {INSIGHTS.map((insight) => {
        const cor =
          insight.severidade === 'risco'
            ? 'var(--danger)'
            : insight.severidade === 'atencao'
              ? 'var(--warning)'
              : insight.severidade === 'conquista'
                ? 'var(--success)'
                : 'var(--vy-cyan)';
        return (
          <Cartao key={insight.id} preenchido className="vy-enter">
            <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--radius-md)',
                  background: `color-mix(in srgb, ${cor} 14%, transparent)`,
                  color: cor,
                  flexShrink: 0,
                }}
              >
                <Sparkles size={16} />
              </span>
              <div className="vy-grow">
                <div className="vy-row-between" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{insight.titulo}</strong>
                  <Selo
                    tom={
                      insight.severidade === 'conquista'
                        ? 'sucesso'
                        : insight.severidade === 'risco'
                          ? 'perigo'
                          : insight.severidade === 'atencao'
                            ? 'atencao'
                            : 'info'
                    }
                  >
                    {ROTULO_SEVERIDADE[insight.severidade]}
                  </Selo>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6, lineHeight: 'var(--leading-normal)' }}>
                  {insight.detalhe}
                </p>
                <div className="vy-row-between" style={{ marginTop: 'var(--space-4)' }}>
                  {insight.metrica && (
                    <span className="vy-mono" style={{ color: cor }}>
                      {insight.metrica}
                    </span>
                  )}
                  {insight.acao && (
                    <Link to={insight.acao.rota}>
                      <Botao variante="secundario" tamanho="pequeno">
                        {insight.acao.rotulo}
                      </Botao>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}

function PainelPrevisao() {
  return (
    <div className="vy-stack">
      {PREVISOES.map((previsao) => {
        const lead = leadPorId(previsao.leadId);
        const percentual = previsao.probabilidadeFechamento * 100;
        return (
          <Cartao key={previsao.leadId} destaque={percentual >= 80}>
            <CartaoCabecalho
              titulo={
                <span className="vy-row" style={{ gap: 'var(--space-3)' }}>
                  {lead?.nome ?? previsao.leadId}
                  <Selo tom={percentual >= 70 ? 'sucesso' : percentual >= 45 ? 'atencao' : 'neutro'}>
                    {formatarPercentual(percentual, 0)} de chance
                  </Selo>
                </span>
              }
              descricao={`Receita esperada ${formatarMoeda(previsao.receitaEsperada, true)} · melhor contato: ${previsao.melhorHorarioContato}`}
              acao={<AnelScore valor={lead?.score ?? 0} tamanho={46} />}
            />
            <CartaoCorpo>
              <p
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--vy-gradient-soft)',
                  border: '1px solid rgb(113 87 255 / 0.24)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-default)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <Bot size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                {previsao.recomendacao}
              </p>

              {/* Os fatores existem para que a recomendação seja auditável.
                  Um score que ninguém consegue explicar não é usado — é
                  contestado. */}
              <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
                O que pesou nessa conta
              </div>
              <ul className="vy-stack" style={{ gap: 'var(--space-3)' }}>
                {previsao.fatores.map((fator) => (
                  <li key={fator.fator}>
                    <div className="vy-row-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)' }}>{fator.fator}</span>
                      <span
                        className="vy-numeric"
                        style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: fator.contribuicao >= 0 ? 'var(--success)' : 'var(--danger)' }}
                      >
                        {fator.contribuicao >= 0 ? '+' : ''}
                        {formatarPercentual(fator.contribuicao * 100, 0)}
                      </span>
                    </div>
                    <Progresso valor={Math.abs(fator.contribuicao) * 260} cor={fator.contribuicao >= 0 ? 'var(--chart-3)' : 'var(--danger)'} />
                  </li>
                ))}
              </ul>
            </CartaoCorpo>
          </Cartao>
        );
      })}
    </div>
  );
}

function PainelIa({ custo }: { custo: { internas: number; externas: number; economia: number; latenciaInterna: number; latenciaExterna: number } }) {
  const camadas = [
    { n: 1, nome: 'Base interna do VEYRA', detalhe: 'Perguntas frequentes, objeções e respostas já aprovadas.', share: 52 },
    { n: 2, nome: 'Conhecimento da empresa', detalhe: 'Artigos e scripts que a própria operação escreveu.', share: 21 },
    { n: 3, nome: 'Histórico autorizado', detalhe: 'Conversas anteriores do mesmo cliente e casos parecidos.', share: 7 },
    { n: 4, nome: 'Dados do produto', detalhe: 'Tabela, prazo, taxa e cobertura vindos do catálogo.', share: 4 },
    { n: 5, nome: 'Provedor externo', detalhe: 'Só quando as quatro anteriores não resolvem. Trocável sem reescrever o produto.', share: 16 },
  ];

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <Cartao>
        <CartaoCabecalho
          titulo="A ordem de consulta da IA"
          descricao="A resposta desce a lista e para na primeira fonte que resolve. O provedor externo é o último recurso, não o primeiro."
        />
        <CartaoCorpo>
          <ol className="vy-stack" style={{ gap: 'var(--space-3)' }}>
            {camadas.map((camada) => (
              <li key={camada.n} className="vy-row vy-wrap" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--radius-md)',
                    background: camada.n === 5 ? 'var(--surface-sunken)' : 'var(--vy-gradient-soft)',
                    color: camada.n === 5 ? 'var(--text-subtle)' : 'var(--vy-cyan-300)',
                    fontWeight: 800,
                    fontSize: 'var(--text-xs)',
                    flexShrink: 0,
                  }}
                >
                  {camada.n}
                </span>
                <span className="vy-grow" style={{ minWidth: 180 }}>
                  <strong style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{camada.nome}</strong>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{camada.detalhe}</span>
                </span>
                <span style={{ width: 140, flexShrink: 0 }}>
                  <Progresso valor={camada.share} cor={camada.n === 5 ? 'var(--text-subtle)' : undefined} />
                </span>
                <span className="vy-numeric" style={{ width: 42, textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--text-strong)' }}>
                  {camada.share}%
                </span>
              </li>
            ))}
          </ol>
        </CartaoCorpo>
      </Cartao>

      <div className="vy-grid-2">
        <Cartao>
          <CartaoCabecalho
            titulo="Independência do provedor externo"
            descricao="Percentual de respostas resolvidas sem sair da plataforma. Quanto mais a base aprende, menos a operação paga por token."
          />
          <CartaoCorpo>
            <GraficoArea
              rotulos={SERIE_MESES}
              series={[{ nome: 'Resolvido internamente (%)', valores: SERIE_IA_INTERNA }]}
              formatar={(v) => formatarPercentual(v, 0)}
              altura={200}
            />
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="Latência média por fonte" descricao="Milissegundos até a primeira palavra da resposta." />
          <CartaoCorpo>
            <GraficoBarras
              dados={[
                { rotulo: 'Base interna', valor: custo.latenciaInterna },
                { rotulo: 'Conhecimento', valor: 260 },
                { rotulo: 'Histórico', valor: 420 },
                { rotulo: 'Produto', valor: 310 },
                { rotulo: 'Externo', valor: custo.latenciaExterna, cor: 'var(--chart-4)' },
              ]}
              formatar={(v) => `${formatarNumero(v)} ms`}
              altura={200}
            />
          </CartaoCorpo>
        </Cartao>
      </div>

      <Cartao preenchido style={{ borderColor: 'var(--border-default)' }}>
        <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <TrendingUp size={18} color="var(--vy-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
            <strong style={{ color: 'var(--text-strong)' }}>Por que isso importa comercialmente.</strong> Cada atendimento
            resolvido pela base interna custa uma fração do mesmo atendimento feito por provedor externo, e responde bem mais
            rápido. Como a base cresce a cada conversa registrada, o custo por atendimento cai à medida que a operação usa a
            plataforma — o contrário do que acontece quando tudo depende de um fornecedor de fora.
          </p>
        </div>
      </Cartao>
    </div>
  );
}

function PainelConhecimento() {
  return (
    <Cartao>
      <CartaoCabecalho
        titulo="VEYRA Knowledge"
        descricao="A mesma base que a equipe consulta é a que a IA lê antes de responder. Artigo não aprovado não é usado pela IA."
        acao={
          <Botao variante="primario" tamanho="pequeno">
            Novo artigo
          </Botao>
        }
      />
      <div className="vy-tabela-wrap">
        <table className="vy-tabela">
          <thead>
            <tr>
              <th>Artigo</th>
              <th>Categoria</th>
              <th>Segmento</th>
              <th>Autor</th>
              <th className="vy-tabela__numero">Usos pela IA</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {CONHECIMENTO.map((artigo) => (
              <tr key={artigo.id}>
                <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{artigo.titulo}</td>
                <td>{artigo.categoria}</td>
                <td style={{ textTransform: 'capitalize' }}>{artigo.segmento ?? '—'}</td>
                <td>{artigo.autor}</td>
                <td className="vy-tabela__numero vy-numeric">{formatarNumero(artigo.usosPelaIa)}</td>
                <td>
                  <Selo tom={artigo.aprovado ? 'sucesso' : 'atencao'}>{artigo.aprovado ? 'aprovado' : 'rascunho'}</Selo>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}
