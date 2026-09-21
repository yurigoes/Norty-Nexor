import { useEffect, useRef, useState } from 'react';

/**
 * A prancheta de assinatura.
 *
 * Desenhada com o dedo, num celular, em pé no corredor do cliente. Daí
 * as escolhas:
 *
 * - **Eventos de ponteiro**, não de mouse nem de toque: um só caminho
 *   cobre dedo, caneta e mouse, e `setPointerCapture` faz o traço
 *   continuar mesmo quando o dedo sai da área — que é o que acontece
 *   quando alguém assina grande demais.
 * - **`touch-action: none`** no elemento: sem isso, o primeiro
 *   movimento do dedo rola a página em vez de desenhar, e a pessoa
 *   tenta três vezes antes de desistir.
 * - **O canvas é redimensionado pela densidade da tela.** Um canvas de
 *   600 pixels lógicos numa tela de três vezes sai borrado; o traço
 *   precisa sair legível no PDF, que é o documento.
 */
export function Assinatura({
  aoMudar,
  altura = 180,
}: {
  aoMudar: (dataUrl: string | null) => void;
  altura?: number;
}) {
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;

    const densidade = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;

    canvas.width = Math.round(largura * densidade);
    canvas.height = Math.round(altura * densidade);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(densidade, densidade);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
  }, [altura]);

  function pontoDe(evento: React.PointerEvent<HTMLCanvasElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  function comecar(evento: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = tela.current?.getContext('2d');
    if (!ctx) return;

    evento.currentTarget.setPointerCapture(evento.pointerId);
    desenhando.current = true;

    const { x, y } = pontoDe(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Um toque sem arrastar também é traço: sem isto, quem só encosta
    // o dedo para pingar o "i" não marca nada.
    ctx.lineTo(x + 0.1, y);
    ctx.stroke();

    if (!temTraco) {
      setTemTraco(true);
      aoMudar(tela.current?.toDataURL('image/png') ?? null);
    }
  }

  function mover(evento: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = tela.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = pontoDe(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    aoMudar(tela.current?.toDataURL('image/png') ?? null);
  }

  function limpar() {
    const canvas = tela.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // `clearRect` em coordenadas do buffer, não das lógicas: o contexto
    // está escalado, e limpar só a área lógica deixaria traço no resto.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    setTemTraco(false);
    aoMudar(null);
  }

  return (
    <div className="pilha-sm">
      <canvas
        ref={tela}
        className="assinatura"
        style={{ height: altura }}
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        aria-label="Área de assinatura"
      />

      <div className="linha-entre">
        <span className="campo-ajuda">
          {temTraco ? 'Assinatura registrada.' : 'Assine com o dedo ou o mouse.'}
        </span>
        <button type="button" className="btn -fantasma -sm" onClick={limpar} disabled={!temTraco}>
          Apagar e refazer
        </button>
      </div>
    </div>
  );
}
