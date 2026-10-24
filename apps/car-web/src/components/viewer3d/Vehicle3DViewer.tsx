/* =========================================================
   Visualizador de veículo.

   Contrato estável usado pelo catálogo interno, pelo site
   público e pelo portal. Com um arquivo .glb e WebGL
   disponível, carrega Three.js sob demanda (rotação 360°,
   zoom, enquadramento automático, pontos de interesse e troca
   de cor da carroceria). Sem arquivo 3D, sem WebGL ou com
   falha no carregamento, cai para a galeria de fotos — nunca
   inventa um modelo.
   ========================================================= */
import { useEffect, useRef, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import './viewer3d.css';

export interface Hotspot { key: string; label: string; description?: string; position: [number, number, number] }

export interface Vehicle3DViewerProps {
  /** URL do arquivo .glb (link temporário ou público). Sem ele: galeria de fotos. */
  modelUrl?: string | null;
  /** URLs das fotos, na ordem de exibição. */
  photos?: string[];
  /** Nome exibido e usado no texto alternativo. */
  title: string;
  /** Configuração sem unidade disponível: aparência dessaturada e selo. */
  unavailable?: boolean;
  hotspots?: Hotspot[];
  /** Cor de pintura em hex, quando o modelo 3D tiver material de carroceria. */
  colorHex?: string | null;
  height?: number;
}

/** Materiais tratados como pintura da carroceria (convenção documentada em docs/norty-car/VISUALIZADOR-3D.md). */
const BODY_MATERIAL = /(body|paint|carroceria|pintura|lataria)/i;

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Vehicle3DViewer(props: Vehicle3DViewerProps) {
  const { modelUrl, photos = [], title, unavailable, height = 320 } = props;
  const [mode, setMode] = useState<'3d' | 'photos'>(() => (modelUrl && hasWebGL() ? '3d' : 'photos'));
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setFailure(null);
    setMode(modelUrl && hasWebGL() ? '3d' : 'photos');
  }, [modelUrl]);

  return (
    <div className="v3d" data-unavailable={unavailable || undefined} style={{ height }}>
      {mode === '3d' && modelUrl ? (
        <Scene {...props} modelUrl={modelUrl} onError={(msg) => { setFailure(msg); setMode('photos'); }} />
      ) : (
        <Gallery photos={photos} title={title} />
      )}
      {unavailable && <span className="v3d__badge">Indisponível</span>}
      {failure && photos.length > 0 && <span className="v3d__note">Visualização 3D indisponível neste aparelho. Mostrando fotos.</span>}
      {modelUrl && photos.length > 0 && !failure && (
        <div className="v3d__switch" role="group" aria-label="Modo de visualização">
          <button type="button" aria-pressed={mode === '3d'} onClick={() => hasWebGL() && setMode('3d')}>3D</button>
          <button type="button" aria-pressed={mode === 'photos'} onClick={() => setMode('photos')}>Fotos</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Galeria (fallback) ---------------- */

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [photos.length]);
  if (!photos.length) {
    return <div className="v3d__empty"><Car size={56} aria-hidden /><span className="sr-only">{title}: sem fotos cadastradas</span></div>;
  }
  const go = (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length);
  return (
    <div className="v3d__gallery" role="region" aria-roledescription="carrossel" aria-label={`Fotos de ${title}`}
      tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}>
      <img src={photos[index]} alt={`${title} — foto ${index + 1} de ${photos.length}`} />
      {photos.length > 1 && (
        <>
          <button type="button" className="v3d__nav v3d__nav--prev" onClick={() => go(-1)} aria-label="Foto anterior"><ChevronLeft /></button>
          <button type="button" className="v3d__nav v3d__nav--next" onClick={() => go(1)} aria-label="Próxima foto"><ChevronRight /></button>
          <div className="v3d__dots">
            {photos.map((p, i) => <button type="button" key={p} aria-label={`Ver foto ${i + 1}`} aria-current={i === index || undefined} onClick={() => setIndex(i)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Cena 3D ---------------- */

interface Projected { key: string; x: number; y: number; visible: boolean }

function Scene({ modelUrl, title, hotspots = [], colorHex, onError }: Vehicle3DViewerProps & { modelUrl: string; onError: (msg: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ reset: () => void; setAutoRotate: (on: boolean) => void; setColor: (hex: string | null) => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [auto, setAuto] = useState(true);
  const [points, setPoints] = useState<Projected[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const el = host.current;
        if (!el || disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('aria-label', `Modelo 3D de ${title}. Arraste para girar e use a rolagem ou o gesto de pinça para aproximar.`);
        renderer.domElement.setAttribute('role', 'img');

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.05, 500);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(5, 10, 7);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0xffffff, 0.6);
        fill.position.set(-6, 4, -5);
        scene.add(fill);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI * 0.49;
        controls.addEventListener('start', () => { controls.autoRotate = false; setAuto(false); });

        const gltf = await new GLTFLoader().loadAsync(modelUrl, (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        if (disposed) { renderer.dispose(); return; }
        const model = gltf.scene;
        scene.add(model);

        // Enquadramento automático: centraliza e afasta a câmera pelo tamanho do modelo.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;
        const radius = Math.max(size.x, size.y, size.z);
        const home = new THREE.Vector3(radius * 0.95, radius * 0.42, radius * 1.05);
        camera.position.copy(home);
        controls.target.set(0, size.y / 2.2, 0);
        controls.minDistance = radius * 0.6;
        controls.maxDistance = radius * 3.2;
        controls.update();

        const bodyMaterials: { color: { set: (v: string) => void; copy: (c: unknown) => void }; original: unknown }[] = [];
        model.traverse((obj) => {
          const mesh = obj as unknown as { isMesh?: boolean; material?: unknown };
          if (!mesh.isMesh || !mesh.material) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const mat = m as { name?: string; color?: { clone: () => unknown; set: (v: string) => void; copy: (c: unknown) => void } };
            if (mat.color && BODY_MATERIAL.test(mat.name ?? '')) bodyMaterials.push({ color: mat.color, original: mat.color.clone() });
          }
        });

        const vec = new THREE.Vector3();
        let count = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          controls.update();
          renderer.render(scene, camera);
          const list = hotspotsRef.current;
          // Reposiciona os pontos de interesse a cada 3 quadros: suficiente para
          // o olho e evita re-renderizar o React 60 vezes por segundo.
          if (list.length && count++ % 3 === 0) {
            const w = el.clientWidth;
            const h = el.clientHeight;
            setPoints(list.map((p) => {
              vec.set(p.position[0], p.position[1], p.position[2]).applyMatrix4(model.matrixWorld).project(camera);
              return { key: p.key, x: ((vec.x + 1) / 2) * w, y: ((1 - vec.y) / 2) * h, visible: vec.z < 1 && Math.abs(vec.x) <= 1 && Math.abs(vec.y) <= 1 };
            }));
          }
        };
        tick();
        setLoading(false);

        const onResize = () => {
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        };
        const observer = new ResizeObserver(onResize);
        observer.observe(el);

        api.current = {
          reset: () => { camera.position.copy(home); controls.target.set(0, size.y / 2.2, 0); controls.update(); },
          setAutoRotate: (on) => { controls.autoRotate = on; },
          setColor: (hex) => bodyMaterials.forEach((b) => (hex ? b.color.set(hex) : b.color.copy(b.original))),
        };

        cleanup = () => {
          observer.disconnect();
          controls.dispose();
          model.traverse((obj) => {
            const mesh = obj as unknown as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | { dispose: () => void }[] };
            mesh.geometry?.dispose();
            for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) m.dispose();
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (error) {
        if (!disposed) errorRef.current(error instanceof Error ? error.message : 'Falha ao carregar o modelo 3D.');
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup?.();
      api.current = null;
    };
  }, [modelUrl, title]);

  useEffect(() => { api.current?.setColor(colorHex ?? null); }, [colorHex, loading]);

  return (
    <div className="v3d__scene" ref={host}>
      {loading && (
        <div className="v3d__loading" role="status">
          <span className="nc-spinner" aria-hidden />
          <span className="small">Carregando modelo 3D{progress ? ` · ${progress}%` : ''}</span>
        </div>
      )}
      {!loading && points.map((p) => {
        const h = hotspots.find((x) => x.key === p.key);
        if (!h || !p.visible) return null;
        return (
          <div key={p.key} className="v3d__hotspot" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <button type="button" aria-expanded={open === p.key} onClick={() => setOpen(open === p.key ? null : p.key)} aria-label={h.label}>
              <span aria-hidden>+</span>
            </button>
            {open === p.key && (
              <div className="v3d__tip" role="dialog" aria-label={h.label}>
                <strong>{h.label}</strong>
                {h.description && <p>{h.description}</p>}
              </div>
            )}
          </div>
        );
      })}
      {!loading && (
        <div className="v3d__controls">
          <button type="button" onClick={() => { const next = !auto; setAuto(next); api.current?.setAutoRotate(next); }} aria-label={auto ? 'Pausar rotação' : 'Girar automaticamente'}>
            {auto ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" onClick={() => api.current?.reset()} aria-label="Voltar ao enquadramento inicial"><RotateCcw size={16} /></button>
        </div>
      )}
      {!loading && <span className="v3d__hint" aria-hidden>Arraste para girar · role ou use pinça para aproximar</span>}
    </div>
  );
}
