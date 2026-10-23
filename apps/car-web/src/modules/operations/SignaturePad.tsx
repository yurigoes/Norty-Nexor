/* Assinatura desenhada com dedo ou mouse, exportada como PNG. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '../../components/ui';
import './operations.css';

export interface SignaturePadHandle {
  /** PNG da assinatura, ou null se nada foi desenhado. */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // Resolução real do dispositivo, para o traço não sair serrilhado.
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const g = c.getContext('2d')!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = getComputedStyle(c).getPropertyValue('color') || 'currentColor';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setInk(false);
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    toBlob: () => new Promise((resolve) => {
      if (!ink || !canvas.current) return resolve(null);
      canvas.current.toBlob((b) => resolve(b), 'image/png');
    }),
  }));

  return (
    <div className="stack-sm">
      <canvas
        ref={canvas}
        className="op-signature"
        style={{ color: 'var(--text-strong)' }}
        aria-label="Área de assinatura"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const g = canvas.current!.getContext('2d')!;
          const p = point(e);
          g.beginPath();
          g.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = canvas.current!.getContext('2d')!;
          const p = point(e);
          g.lineTo(p.x, p.y);
          g.stroke();
          if (!ink) { setInk(true); onChange?.(true); }
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
      />
      <div className="row-between">
        <span className="xsmall muted">Assine dentro do quadro.</span>
        <Button size="sm" variant="ghost" icon={Eraser} onClick={clear} disabled={!ink}>Limpar</Button>
      </div>
    </div>
  );
});
