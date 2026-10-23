import { BadRequestException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Política mínima de senha: 10 caracteres, com letra e número. */
export function assertPasswordPolicy(password: string): void {
  if (typeof password !== 'string' || password.length < 10 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException('A senha precisa ter ao menos 10 caracteres, com letras e números.');
  }
  if (password.length > 200) throw new BadRequestException('Senha longa demais.');
}

/** Argon2id com os parâmetros padrão recomendados (m=19 MiB, t=2, p=1). */
export const hashPassword = (plain: string): Promise<string> => hash(plain);
export const verifyPassword = (hashed: string, plain: string): Promise<boolean> => verify(hashed, plain).catch(() => false);

/** Hash descartável para igualar o tempo de resposta de e-mail inexistente. */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$H3Fx3lRz5m8k1nQ2wZ1YXJ6b5vQ8mJ9pKk1lRzL0aQo';
