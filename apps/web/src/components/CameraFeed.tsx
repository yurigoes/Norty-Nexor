import { cameraSignature } from '../services/security';
import type { Camera } from '../data/types';

/**
 * Feed simulado de câmera.
 * A composição (gradiente, ruído e silhuetas) é derivada do id da câmera,
 * então cada canal tem uma imagem estável e distinta. Na Fase 4 este
 * componente passa a receber um stream real mantendo a mesma interface.
 */
export function CameraFeed({ camera }: { camera: Camera }) {
  const { hue, tilt, density } = cameraSignature(camera);

  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="nx-cam__feed" aria-hidden="true">
      <defs>
        <linearGradient id={`cam-${camera.id}`} x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor={`hsl(${hue} 42% 16%)`} />
          <stop offset="0.55" stopColor={`hsl(${hue - 12} 34% 10%)`} />
          <stop offset="1" stopColor="#050c14" />
        </linearGradient>
        <radialGradient id={`camlight-${camera.id}`} cx="0.7" cy="0.2" r="0.7">
          <stop stopColor="rgba(255,255,255,0.16)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <rect width="320" height="180" fill={`url(#cam-${camera.id})`} />
      <rect width="320" height="180" fill={`url(#camlight-${camera.id})`} />

      {/* Perspectiva do ambiente */}
      <g transform={`rotate(${tilt} 160 90)`} opacity="0.5">
        <path d="M0 132 L320 108 L320 180 L0 180 Z" fill="rgba(255,255,255,0.05)" />
        <path d="M-10 132 L120 60 L200 60 L330 108" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
        <rect x="24" y="52" width="52" height="80" fill="rgba(255,255,255,0.045)" />
        <rect x="238" y="46" width="60" height="70" fill="rgba(255,255,255,0.045)" />
        <line x1="0" y1="150" x2="320" y2="128" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
      </g>

      {/* Silhuetas ocasionais */}
      {camera.hasMotion && (
        <g opacity="0.55">
          <ellipse cx={110 + density * 60} cy="112" rx="7" ry="9" fill="rgba(255,255,255,0.42)" />
          <rect x={104 + density * 60} y="120" width="13" height="26" rx="6" fill="rgba(255,255,255,0.34)" />
        </g>
      )}

      {/* Linhas de varredura */}
      <g opacity="0.18">
        {Array.from({ length: 30 }, (_, i) => (
          <line key={i} x1="0" y1={i * 6} x2="320" y2={i * 6} stroke="#fff" strokeWidth="0.5" />
        ))}
      </g>
    </svg>
  );
}
