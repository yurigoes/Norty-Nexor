import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './impressao.css';

/**
 * Documento imprimível
 *
 * O conteúdo é montado num nó irmão do aplicativo, direto no `body`, e
 * fica invisível na tela. A folha de impressão esconde tudo o que não é
 * ele — assim o mesmo dado que está no modal vira um documento limpo,
 * sem duplicar a montagem.
 *
 * Exportar é a caixa de impressão do navegador com destino "Salvar como
 * PDF". Em janelas restritas (um documento embutido em outro site, por
 * exemplo) o navegador pode recusar a chamada; nesse caso quem chama
 * recebe `false` e avisa a pessoa em vez de deixar o botão mudo.
 */
export function DocumentoImpresso({ children }: { children: ReactNode }) {
  return createPortal(<div className="vy-impressao">{children}</div>, document.body);
}

export function useImpressao() {
  const [preparando, setPreparando] = useState(false);

  const imprimir = useCallback(async (): Promise<boolean> => {
    setPreparando(true);
    /* Um quadro para o documento entrar no DOM antes de a caixa de
       impressão capturar a página. Sem isso, a primeira exportação sai
       em branco. */
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      window.print();
      return true;
    } catch {
      return false;
    } finally {
      setPreparando(false);
    }
  }, []);

  return { imprimir, preparando };
}

export function CabecalhoDocumento({
  titulo,
  subtitulo,
  emitidoPor,
  referencia,
}: {
  titulo: string;
  subtitulo?: string;
  emitidoPor: string;
  referencia?: string;
}) {
  return (
    <header className="vy-impressao__cabecalho">
      <div>
        <div className="vy-impressao__marca">VEYRA</div>
        <h1 style={{ marginTop: '6pt' }}>{titulo}</h1>
        {subtitulo && <div style={{ fontSize: '9pt', color: '#55627a', marginTop: '3pt' }}>{subtitulo}</div>}
      </div>
      <div className="vy-impressao__meta">
        <div>Nexor Consórcios e Seguros</div>
        <div>CNPJ 18.442.907/0001-56</div>
        {referencia && <div>{referencia}</div>}
        <div style={{ marginTop: '4pt' }}>
          Emitido em{' '}
          {new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </div>
        <div>por {emitidoPor}</div>
      </div>
    </header>
  );
}
