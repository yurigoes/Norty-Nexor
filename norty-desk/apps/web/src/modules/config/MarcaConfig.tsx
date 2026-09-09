import { useEffect, useRef, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import { editarMarca, enviarLogo, obterMarca, removerLogo, type MarcaPublica } from '../../api/marca';
import { MarcaEmbutida } from '../../components/Marca';

/**
 * Configuração da marca.
 *
 * A logo é da instalação, não da organização: ela aparece na tela de
 * entrada, e ali ainda não se sabe quem está entrando.
 */
export function MarcaConfig() {
  const [marca, setMarca] = useState<MarcaPublica | null>(null);
  const [nome, setNome] = useState('');
  const [frase, setFrase] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campoLogo = useRef<HTMLInputElement>(null);
  const campoFavicon = useRef<HTMLInputElement>(null);

  useEffect(() => {
    obterMarca()
      .then((m) => {
        setMarca(m);
        setNome(m.productName);
        setFrase(m.tagline ?? '');
      })
      .catch(() => setErro('Não foi possível carregar a marca.'));
  }, []);

  async function executar(acao: () => Promise<MarcaPublica>, mensagem: string) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const atualizada = await acao();
      setMarca(atualizada);
      setAviso(mensagem);
      // A logo antiga sai do cache pela versão na URL; a aba precisa de
      // um empurrão para reler o título e o ícone.
      document.title = atualizada.productName;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }

  if (!marca) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 720 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Marca</h2>
          <p>
            A logo aparece na tela de entrada, na barra lateral e na aba do navegador.
          </p>
        </div>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {aviso ? (
        <div className="alerta-bloco -sucesso">
          <span aria-hidden="true">✓</span>
          <span>{aviso}</span>
        </div>
      ) : null}

      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Logo</h3>
            <p className="card-sub">SVG, PNG ou WebP, até 512 KB. Fundo transparente.</p>
          </div>
        </div>

        <div className="card-corpo">
          <div className="linha" style={{ gap: 'var(--e-6)', flexWrap: 'wrap' }}>
            {/* Duas amostras: a logo tem de funcionar sobre o azul da
                barra lateral e sobre o branco do conteúdo. Ver só uma
                esconde metade dos problemas. */}
            <Amostra fundo="var(--grad-sidebar)" rotulo="sobre a barra lateral">
              {marca.logoUrl ? (
                <img src={marca.logoUrl} alt="" style={{ maxHeight: 40 }} />
              ) : (
                <MarcaEmbutida tamanho={40} />
              )}
            </Amostra>

            <Amostra fundo="var(--superficie-afundada)" rotulo="sobre o conteúdo">
              {marca.logoUrl ? (
                <img src={marca.logoUrl} alt="" style={{ maxHeight: 40 }} />
              ) : (
                <MarcaEmbutida tamanho={40} />
              )}
            </Amostra>
          </div>

          {!marca.logoUrl ? (
            <p className="campo-ajuda" style={{ marginTop: 'var(--e-4)' }}>
              Nenhuma logo enviada — está valendo a marca provisória embutida.
            </p>
          ) : null}
        </div>

        <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
          <input
            ref={campoLogo}
            id="arquivo-logo"
            type="file"
            className="so-leitor"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void executar(() => enviarLogo(arquivo, 'logo'), 'Logo atualizada.');
              if (campoLogo.current) campoLogo.current.value = '';
            }}
          />
          <label className="btn -primario -sm" htmlFor="arquivo-logo" style={{ cursor: 'pointer' }}>
            Enviar logo
          </label>

          {marca.logoUrl ? (
            <button
              type="button"
              className="btn -fantasma -sm"
              disabled={ocupado}
              onClick={() => void executar(() => removerLogo('logo'), 'Logo removida.')}
            >
              Remover
            </button>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Ícone da aba</h3>
            <p className="card-sub">Quadrado, 64×64 ou maior. PNG ou SVG.</p>
          </div>
        </div>

        <div className="card-corpo linha" style={{ gap: 'var(--e-4)' }}>
          {marca.faviconUrl ? (
            <img src={marca.faviconUrl} alt="" style={{ width: 32, height: 32 }} />
          ) : (
            <MarcaEmbutida tamanho={32} />
          )}
          <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
            {marca.faviconUrl ? 'Ícone próprio.' : 'Usando a marca embutida.'}
          </span>
        </div>

        <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
          <input
            ref={campoFavicon}
            id="arquivo-favicon"
            type="file"
            className="so-leitor"
            accept="image/svg+xml,image/png,image/webp"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void executar(() => enviarLogo(arquivo, 'favicon'), 'Ícone atualizado.');
              if (campoFavicon.current) campoFavicon.current.value = '';
            }}
          />
          <label
            className="btn -secundario -sm"
            htmlFor="arquivo-favicon"
            style={{ cursor: 'pointer' }}
          >
            Enviar ícone
          </label>

          {marca.faviconUrl ? (
            <button
              type="button"
              className="btn -fantasma -sm"
              disabled={ocupado}
              onClick={() => void executar(() => removerLogo('favicon'), 'Ícone removido.')}
            >
              Remover
            </button>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Nome e frase</h3>
            <p className="card-sub">
              O nome vai para a aba e o cabeçalho. A frase aparece na tela de entrada.
            </p>
          </div>
        </div>

        <form
          className="card-corpo pilha"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(
              () => editarMarca({ productName: nome, tagline: frase }),
              'Marca atualizada.',
            );
          }}
        >
          <div className="campo">
            <label className="campo-rotulo" htmlFor="nome-produto">
              Nome do produto
            </label>
            <input
              id="nome-produto"
              className="input"
              value={nome}
              minLength={2}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="frase">
              Frase da tela de entrada
            </label>
            <input
              id="frase"
              className="input"
              value={frase}
              maxLength={160}
              placeholder="A central de serviços da Norty."
              onChange={(e) => setFrase(e.target.value)}
            />
          </div>

          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Amostra({
  fundo,
  rotulo,
  children,
}: {
  fundo: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pilha-sm">
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 200,
          height: 96,
          background: fundo,
          border: '1px solid var(--borda)',
          borderRadius: 'var(--r-lg)',
        }}
      >
        {children}
      </div>
      <span className="campo-ajuda">{rotulo}</span>
    </div>
  );
}
