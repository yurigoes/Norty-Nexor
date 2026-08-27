import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Inbox, Info, Search, X, type LucideIcon } from 'lucide-react';
import './ui.css';

/* =========================================================
   Primitivas
   ========================================================= */

type Tom = 'neutro' | 'info' | 'sucesso' | 'atencao' | 'perigo' | 'marca';

interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo';
  tamanho?: 'pequeno' | 'medio' | 'grande';
  bloco?: boolean;
  icone?: LucideIcon;
  carregando?: boolean;
}

export function Botao({
  variante = 'secundario',
  tamanho = 'medio',
  bloco,
  icone: Icone,
  carregando,
  children,
  className = '',
  disabled,
  ...resto
}: BotaoProps) {
  const classes = [
    'vy-btn',
    `vy-btn--${variante}`,
    tamanho !== 'medio' ? `vy-btn--${tamanho}` : '',
    bloco ? 'vy-btn--bloco' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || carregando} {...resto}>
      {carregando ? <span className="vy-spinner" /> : Icone ? <Icone size={15} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

interface BotaoIconeProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icone: LucideIcon;
  /** Obrigatório: um botão sem texto precisa de nome acessível. */
  rotulo: string;
}

export function BotaoIcone({ icone: Icone, rotulo, className = '', ...resto }: BotaoIconeProps) {
  return (
    <button className={`vy-btn vy-btn--icone ${className}`} aria-label={rotulo} title={rotulo} {...resto}>
      <Icone size={17} strokeWidth={2} />
    </button>
  );
}

interface CartaoProps {
  children: ReactNode;
  preenchido?: boolean;
  interativo?: boolean;
  destaque?: boolean;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Cartao({ children, preenchido, interativo, destaque, className = '', onClick, style }: CartaoProps) {
  const classes = [
    'vy-card',
    preenchido ? 'vy-card--preenchido' : '',
    interativo ? 'vy-card--interativo' : '',
    destaque ? 'vy-card--destaque' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (interativo && onClick) {
    return (
      <div className={classes} style={style} onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

export function CartaoCabecalho({
  titulo,
  descricao,
  acao,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="vy-card__cabecalho">
      <div style={{ minWidth: 0 }}>
        <div className="vy-card__titulo">{titulo}</div>
        {descricao && <div className="vy-card__descricao">{descricao}</div>}
      </div>
      {acao}
    </div>
  );
}

export function CartaoCorpo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`vy-card__corpo ${className}`}>{children}</div>;
}

export function Selo({
  children,
  tom = 'neutro',
  ponto,
}: {
  children: ReactNode;
  tom?: Tom;
  ponto?: boolean;
}) {
  return (
    <span className={`vy-badge vy-badge--${tom}`}>
      {ponto && <span className="vy-badge__ponto" />}
      {children}
    </span>
  );
}

export function Avatar({
  nome,
  tamanho = 32,
  cor,
}: {
  nome: string;
  tamanho?: number;
  cor?: string;
}) {
  const iniciais = useMemo(
    () =>
      nome
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase(),
    [nome],
  );

  return (
    <span
      className="vy-avatar"
      title={nome}
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: tamanho * 0.36,
        background: cor ?? 'var(--vy-gradient)',
      }}
    >
      {iniciais}
    </span>
  );
}

/* =========================================================
   Campos
   ========================================================= */

interface CampoProps {
  rotulo?: string;
  erro?: string;
  children: ReactNode;
  className?: string;
}

export function Campo({ rotulo, erro, children, className = '' }: CampoProps) {
  return (
    <label className={`vy-campo ${className}`}>
      {rotulo && <span className="vy-campo__rotulo">{rotulo}</span>}
      {children}
      {erro && <span className="vy-campo__erro">{erro}</span>}
    </label>
  );
}

export function Entrada({
  invalido,
  className = '',
  ...resto
}: React.InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }) {
  return <input className={`vy-input ${invalido ? 'vy-input--invalido' : ''} ${className}`} {...resto} />;
}

export function Selecao({ className = '', children, ...resto }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`vy-select ${className}`} {...resto}>
      {children}
    </select>
  );
}

export function AreaTexto({ className = '', ...resto }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`vy-textarea ${className}`} {...resto} />;
}

export function Busca({
  valor,
  aoMudar,
  placeholder = 'Buscar…',
  className = '',
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`vy-busca ${className}`}>
      <Search size={15} />
      <input
        className="vy-input"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

/* =========================================================
   Navegação interna
   ========================================================= */

export interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: string;
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: OpcaoSegmento<T>[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <div className="vy-segmentado" role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          role="tab"
          aria-selected={o.valor === valor}
          className="vy-segmentado__item"
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Abas<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: OpcaoSegmento<T>[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <div className="vy-abas" role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          role="tab"
          aria-selected={o.valor === valor}
          className="vy-abas__item"
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/* =========================================================
   Estados: vazio, erro, carregando
   Existem como componente porque toda lista precisa dos três —
   e um estado vazio inventado por módulo vira inconsistência.
   ========================================================= */

export function EstadoVazio({
  icone: Icone = Inbox,
  titulo,
  texto,
  acao,
}: {
  icone?: LucideIcon;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="vy-estado">
      <div className="vy-estado__icone">
        <Icone size={22} strokeWidth={1.8} />
      </div>
      <div className="vy-estado__titulo">{titulo}</div>
      {texto && <p className="vy-estado__texto">{texto}</p>}
      {acao}
    </div>
  );
}

export function EstadoErro({
  titulo = 'Não foi possível carregar',
  texto = 'Tente novamente. Se continuar, o código de rastreio ajuda o suporte a localizar o que aconteceu.',
  rastreio,
  aoTentar,
}: {
  titulo?: string;
  texto?: string;
  rastreio?: string;
  aoTentar?: () => void;
}) {
  return (
    <div className="vy-estado">
      <div className="vy-estado__icone vy-estado__icone--erro">
        <AlertTriangle size={22} strokeWidth={1.8} />
      </div>
      <div className="vy-estado__titulo">{titulo}</div>
      <p className="vy-estado__texto">{texto}</p>
      {rastreio && <code className="vy-mono vy-muted">{rastreio}</code>}
      {aoTentar && (
        <Botao variante="secundario" onClick={aoTentar}>
          Tentar novamente
        </Botao>
      )}
    </div>
  );
}

export function Esqueleto({
  altura = 16,
  largura = '100%',
  raio,
}: {
  altura?: number | string;
  largura?: number | string;
  raio?: number;
}) {
  return <div className="vy-skeleton" style={{ height: altura, width: largura, borderRadius: raio }} />;
}

export function EsqueletoLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="vy-stack" style={{ padding: 'var(--space-5)' }}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="vy-row" style={{ gap: 'var(--space-4)' }}>
          <Esqueleto altura={32} largura={32} raio={999} />
          <div className="vy-grow vy-stack" style={{ gap: 'var(--space-2)' }}>
            <Esqueleto altura={11} largura={`${52 + ((i * 13) % 30)}%`} />
            <Esqueleto altura={9} largura={`${28 + ((i * 7) % 24)}%`} />
          </div>
          <Esqueleto altura={22} largura={64} raio={999} />
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Sobreposições
   ========================================================= */

/** Fecha no Esc e devolve o foco. Vale para modal e gaveta. */
function useFechaComEsc(aberto: boolean, aoFechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
  }, [aberto, aoFechar]);
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
}) {
  useFechaComEsc(aberto, aoFechar);
  const tituloId = useId();
  if (!aberto) return null;

  return createPortal(
    <>
      <div className="vy-overlay" onClick={aoFechar} />
      <div
        className="vy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        style={largura ? { width: `min(${largura}px, calc(100vw - 2rem))` } : undefined}
      >
        <div className="vy-card__cabecalho">
          <div>
            <div className="vy-card__titulo" id={tituloId}>
              {titulo}
            </div>
            {descricao && <div className="vy-card__descricao">{descricao}</div>}
          </div>
          <BotaoIcone icone={X} rotulo="Fechar" onClick={aoFechar} />
        </div>
        <div className="vy-card__corpo">{children}</div>
        {rodape && (
          <div
            className="vy-row"
            style={{
              justifyContent: 'flex-end',
              padding: 'var(--space-4) var(--space-5)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {rodape}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

export function Gaveta({
  aberta,
  aoFechar,
  titulo,
  children,
  largura,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  largura?: number;
}) {
  useFechaComEsc(aberta, aoFechar);
  if (!aberta) return null;

  return createPortal(
    <>
      <div className="vy-overlay" onClick={aoFechar} />
      <aside
        className="vy-gaveta"
        role="dialog"
        aria-modal="true"
        style={largura ? { width: `min(${largura}px, 100vw)` } : undefined}
      >
        <div className="vy-card__cabecalho" style={{ position: 'sticky', top: 0, background: 'inherit', zIndex: 1 }}>
          <div className="vy-card__titulo">{titulo}</div>
          <BotaoIcone icone={X} rotulo="Fechar" onClick={aoFechar} />
        </div>
        {children}
      </aside>
    </>,
    document.body,
  );
}

export function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span
      className="vy-dica"
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onFocus={() => setVisivel(true)}
      onBlur={() => setVisivel(false)}
    >
      {children}
      {visivel && <span className="vy-dica__balao">{texto}</span>}
    </span>
  );
}

/* =========================================================
   Avisos (toast)
   ========================================================= */

interface Aviso {
  id: number;
  tom: Tom;
  titulo: string;
  texto?: string;
}

const AvisosContext = createContext<{ avisar: (a: Omit<Aviso, 'id'>) => void } | null>(null);

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);

  const avisar = useCallback((a: Omit<Aviso, 'id'>) => {
    const id = proximoId.current++;
    setAvisos((atual) => [...atual, { ...a, id }]);
    window.setTimeout(() => setAvisos((atual) => atual.filter((x) => x.id !== id)), 4200);
  }, []);

  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      {createPortal(
        <div className="vy-toasts" role="status" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} className="vy-toast">
              <span style={{ color: corDoTom(a.tom), marginTop: 2 }}>
                {a.tom === 'perigo' ? <AlertTriangle size={15} /> : a.tom === 'sucesso' ? <Check size={15} /> : <Info size={15} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="vy-toast__titulo">{a.titulo}</div>
                {a.texto && <div className="vy-toast__texto">{a.texto}</div>}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </AvisosContext.Provider>
  );
}

function corDoTom(tom: Tom): string {
  switch (tom) {
    case 'sucesso':
      return 'var(--success)';
    case 'atencao':
      return 'var(--warning)';
    case 'perigo':
      return 'var(--danger)';
    case 'marca':
      return 'var(--vy-violet-400)';
    case 'info':
      return 'var(--vy-cyan)';
    default:
      return 'var(--text-muted)';
  }
}

export function useAvisos() {
  const ctx = useContext(AvisosContext);
  if (!ctx) throw new Error('useAvisos precisa estar dentro de ProvedorAvisos.');
  return ctx;
}

/* =========================================================
   Progresso
   ========================================================= */

export function Progresso({ valor, cor }: { valor: number; cor?: string }) {
  const largura = Math.max(0, Math.min(100, valor));
  return (
    <div className="vy-progresso" role="progressbar" aria-valuenow={largura} aria-valuemin={0} aria-valuemax={100}>
      <div className="vy-progresso__trilho" style={{ width: `${largura}%`, background: cor }} />
    </div>
  );
}

/**
 * Anel de score. A cor não é decorativa: ela é a leitura rápida do
 * número, então segue a mesma faixa em todo lugar que mostra score.
 */
export function AnelScore({ valor, tamanho = 44 }: { valor: number; tamanho?: number }) {
  const raio = (tamanho - 5) / 2;
  const perimetro = 2 * Math.PI * raio;
  const preenchido = (Math.max(0, Math.min(100, valor)) / 100) * perimetro;
  const cor = valor >= 80 ? 'var(--success)' : valor >= 55 ? 'var(--vy-cyan)' : valor >= 35 ? 'var(--warning)' : 'var(--text-subtle)';

  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="var(--surface-sunken)" strokeWidth={3.5} />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${perimetro}`}
          style={{ transition: 'stroke-dasharray var(--duration-slow) var(--ease-out)' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: tamanho * 0.3,
          fontWeight: 800,
          color: 'var(--text-strong)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(valor)}
      </span>
    </span>
  );
}
