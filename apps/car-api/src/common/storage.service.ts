import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/env';
import { CryptoService } from './crypto.service';

/** Tipos aceitos e a assinatura binária que cada um precisa ter. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'model/gltf-binary', ext: 'glb', test: (b) => b.subarray(0, 4).toString('latin1') === 'glTF' },
];

export interface StoredFile {
  storageKey: string;
  mimeType: string;
  size: number;
  sha256: string;
}

/**
 * Armazenamento de arquivos. O tipo é decidido pelo conteúdo (bytes
 * mágicos), nunca pela extensão ou pelo Content-Type enviado: um .exe
 * renomeado para .jpg é recusado.
 *
 * Driver atual: disco local (volume persistente). O contrato desta classe
 * é o de um armazenamento de objetos — trocar por S3/MinIO é implementar
 * `put`/`get` com o SDK, sem mexer nos módulos (ver docs/norty-car/OPERACAO.md).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly config = loadConfig().storage;
  private readonly root = resolve(this.config.dir);

  detect(buffer: Buffer): { mime: string; ext: string } | null {
    const found = SIGNATURES.find((s) => s.test(buffer));
    return found ? { mime: found.mime, ext: found.ext } : null;
  }

  async put(organizationId: string, buffer: Buffer, allowed?: string[]): Promise<StoredFile> {
    if (!buffer?.length) throw new BadRequestException('Arquivo vazio.');
    if (buffer.length > this.config.maxUploadBytes) {
      throw new BadRequestException(`Arquivo acima do limite de ${Math.round(this.config.maxUploadBytes / 1024 / 1024)} MB.`);
    }
    const type = this.detect(buffer);
    if (!type || (allowed && !allowed.includes(type.mime))) {
      throw new BadRequestException('Tipo de arquivo não permitido. Envie JPG, PNG, WebP, PDF ou GLB.');
    }
    const now = new Date();
    const storageKey = `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${type.ext}`;
    const path = this.pathOf(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer, { flag: 'wx' });
    return { storageKey, mimeType: type.mime, size: buffer.length, sha256: CryptoService.sha256(buffer) };
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.pathOf(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.pathOf(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  /** Impede que uma chave adulterada escape da pasta raiz (../../etc/passwd). */
  private pathOf(storageKey: string): string {
    const path = resolve(join(this.root, storageKey));
    if (!path.startsWith(this.root + '/')) throw new BadRequestException('Chave de arquivo inválida.');
    return path;
  }

  async healthy(): Promise<boolean> {
    try {
      await mkdir(this.root, { recursive: true });
      return true;
    } catch (error) {
      this.logger.error(`Armazenamento indisponível: ${String(error)}`);
      return false;
    }
  }
}
