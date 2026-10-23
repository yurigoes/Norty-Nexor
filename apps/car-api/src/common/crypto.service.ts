import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../config/env';

/**
 * Cifra e assina com a chave do servidor. Segredos de MFA e de
 * integrações ficam cifrados em repouso (AES-256-GCM) e só são
 * decifrados no momento do uso.
 */
@Injectable()
export class CryptoService {
  private readonly key = loadConfig().secretsKey;

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Segredo cifrado em formato desconhecido.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Assinatura curta para URLs temporárias de arquivo. */
  sign(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('base64url');
  }

  verify(value: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(value));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  static sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  static randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}
