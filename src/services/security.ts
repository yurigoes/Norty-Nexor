/* Central de segurança: câmeras e estado do perímetro. */

import { where } from '../data/repositories';
import type { Camera, ID } from '../data/types';

export function cameras(condominiumId: ID): Camera[] {
  return where('cameras', (c) => c.condominiumId === condominiumId);
}

/**
 * Assinatura visual determinística de cada câmera.
 * No MVP as imagens são compostas por gradientes e ruído gerados no
 * cliente; a Fase 4 substitui por streams ONVIF/RTSP reais.
 */
export function cameraSignature(camera: Camera): { hue: number; tilt: number; density: number } {
  let hash = 0;
  for (let i = 0; i < camera.id.length; i += 1) hash = (hash * 31 + camera.id.charCodeAt(i)) >>> 0;
  return {
    hue: 190 + (hash % 40),
    tilt: (hash % 7) - 3,
    density: 0.3 + ((hash >> 3) % 40) / 100,
  };
}
