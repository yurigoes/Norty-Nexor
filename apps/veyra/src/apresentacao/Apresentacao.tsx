import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Moon, ShieldCheck, Sun } from 'lucide-react';
import { Botao } from '../components';
import { VeyraAppIcon, VeyraLockup, VeyraMark } from '../brand/Logo';
import { useSessao } from '../app/sessao';
import { SECOES, type SecaoDeck } from './conteudo';
import './deck.css';

/**
 * Apresentação
 *
 * Quarenta seções que contam um argumento, não uma lista de recursos: o
 * problema que o empresário reconhece como dele, o ciclo inteiro, e só
 * então cada módulo.
 *
 * A rolagem tem encaixe por seção no desktop e é livre no celular —
 * forçar tela cheia no telefone cortaria texto, e texto cortado não
 * vende nada.
 */
export function Apresentacao() {
  const { tema, alternarTema } = useSessao();
  const [ativa, setAtiva] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  /* O índice lateral acompanha a rolagem por observação de interseção —
     ler `scrollTop` a cada evento faria a página engasgar em máquina
     modesta, que é justamente onde a demonstração costuma rodar. */
  useEffect(() => {
    const secoes = containerRef.current?.querySelectorAll('.vy-deck__secao');
    if (!secoes) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            const indice = Number((entrada.target as HTMLElement).dataset.indice);
            setAtiva(indice);
          }
        }
      },
      { root: containerRef.current, threshold: 0.5 },
    );

    secoes.forEach((secao) => observador.observe(secao));
    return () => observador.disconnect();
  }, []);

  function irPara(indice: number) {
    const alvo = containerRef.current?.querySelector(`[data-indice="${indice}"]`);
    alvo?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <header className="vy-deck__topo">
        <VeyraLockup size={19} />
        <span className="vy-row" style={{ marginLeft: 'auto', gap: 'var(--space-2)' }}>
          <button
            className="vy-btn vy-btn--icone"
            onClick={alternarTema}
            aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
          >
            {tema === 'escuro' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to="/app">
            <Botao variante="primario" tamanho="pequeno">
              Abrir a plataforma <ArrowRight size={14} />
            </Botao>
          </Link>
        </span>
      </header>

      <nav className="vy-deck__indice" aria-label="Seções da apresentação">
        {SECOES.map((secao, i) => (
          <button
            key={secao.id}
            className="vy-deck__marcador"
            data-rotulo={`${secao.numero}. ${secao.rotulo}`}
            aria-current={i === ativa}
            aria-label={`Ir para ${secao.rotulo}`}
            onClick={() => irPara(i)}
          >
            <span />
          </button>
        ))}
      </nav>

      <div className="vy-deck" ref={containerRef}>
        {SECOES.map((secao, i) => (
          <Secao key={secao.id} secao={secao} indice={i} aoAvancar={() => irPara(i + 1)} />
        ))}
      </div>
    </>
  );
}

function Secao({ secao, indice, aoAvancar }: { secao: SecaoDeck; indice: number; aoAvancar: () => void }) {
  const total = SECOES.length;

  if (secao.tipo === 'capa') {
    return (
      <section className="vy-deck__secao vy-deck__capa" data-indice={indice} id={secao.id}>
        <div className="vy-deck__interno" style={{ textAlign: 'center' }}>
          <span className="vy-enter" style={{ display: 'inline-block' }}>
            <VeyraMark size={140} />
          </span>
          <h1 className="vy-deck__capa-marca" style={{ marginTop: 'var(--space-8)' }}>
            VEYRA
          </h1>
          <p className="vy-deck__capa-assinatura">Plataforma de Inteligência Comercial e Gestão</p>
          <p className="vy-deck__linha" style={{ margin: 'var(--space-8) auto 0', textAlign: 'center' }}>
            {secao.linha}
          </p>
          <button
            onClick={aoAvancar}
            className="vy-row"
            style={{ margin: 'var(--space-12) auto 0', gap: 'var(--space-2)', color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}
          >
            Role para começar
            <ChevronDown size={15} />
          </button>
        </div>
      </section>
    );
  }

  if (secao.tipo === 'encerramento') {
    return (
      <section className="vy-deck__secao vy-deck__capa" data-indice={indice} id={secao.id}>
        <div className="vy-deck__interno" style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block' }}>
            <VeyraAppIcon size={88} />
          </span>
          <h2 className="vy-deck__titulo" style={{ margin: 'var(--space-8) auto 0', maxWidth: '18ch' }}>
            {secao.titulo}
          </h2>
          <p className="vy-deck__linha" style={{ margin: 'var(--space-6) auto 0' }}>
            {secao.linha}
          </p>
          <div className="vy-row" style={{ justifyContent: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-10)', flexWrap: 'wrap' }}>
            <Link to="/app">
              <Botao variante="primario" tamanho="grande">
                Abrir a plataforma <ArrowRight size={16} />
              </Botao>
            </Link>
            <Link to="/admin">
              <Botao variante="secundario" tamanho="grande" icone={ShieldCheck}>
                Ver o VEYRA Admin
              </Botao>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="vy-deck__secao" data-indice={indice} id={secao.id}>
      <div className="vy-deck__interno">
        <div className="vy-deck__numero">
          {String(secao.numero).padStart(2, '0')} / {total}
          {secao.eyebrow && <span style={{ marginLeft: 'var(--space-4)' }}>{secao.eyebrow}</span>}
        </div>

        <h2 className="vy-deck__titulo">{secao.titulo}</h2>
        {secao.linha && <p className="vy-deck__linha">{secao.linha}</p>}

        {(secao.blocos || secao.numeros || secao.fluxo || secao.lista) && (
          <div className="vy-deck__conteudo">
            {secao.fluxo && (
              <div className="vy-deck__fluxo">
                {secao.fluxo.map((etapa, i) => (
                  <span key={etapa.rotulo} className="vy-row" style={{ gap: 'var(--space-2)' }}>
                    <span className="vy-deck__etapa" data-destaque={etapa.destaque}>
                      {etapa.rotulo}
                    </span>
                    {i < secao.fluxo!.length - 1 && <ArrowRight size={13} color="var(--text-subtle)" style={{ flexShrink: 0 }} />}
                  </span>
                ))}
              </div>
            )}

            {secao.numeros && (
              <div className="vy-deck__grade">
                {secao.numeros.map(([valor, rotulo]) => (
                  <div key={rotulo}>
                    <div className="vy-deck__numerao">{valor}</div>
                    <div className="vy-eyebrow" style={{ marginTop: 'var(--space-2)' }}>
                      {rotulo}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {secao.blocos && (
              <div className="vy-deck__grade" style={{ marginTop: secao.numeros ? 'var(--space-6)' : 0 }}>
                {secao.blocos.map((bloco) => (
                  <div key={bloco.titulo} className="vy-deck__bloco">
                    <strong>{bloco.titulo}</strong>
                    <p>{bloco.texto}</p>
                  </div>
                ))}
              </div>
            )}

            {secao.lista && (
              <ul className="vy-stack" style={{ gap: 'var(--space-3)', marginTop: secao.numeros || secao.blocos ? 'var(--space-6)' : 0 }}>
                {secao.lista.map((item) => (
                  <li key={item} className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        marginTop: 8,
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--vy-gradient)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-default)', lineHeight: 'var(--leading-normal)' }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Índice usado no menu de navegação da apresentação (rota `/roteiro`). */
export function useRoteiro() {
  return useMemo(() => SECOES.map((s) => ({ numero: s.numero, rotulo: s.rotulo, id: s.id })), []);
}
