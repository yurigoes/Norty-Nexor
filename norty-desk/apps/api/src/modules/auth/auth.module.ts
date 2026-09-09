import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

/**
 * Decisões que não devem ser desfeitas (`docs/11-infra.md`, seção 6):
 *
 * - senha em Argon2id; a API nunca devolve o hash;
 * - access token de 15 min em memória no cliente;
 * - refresh token em cookie httpOnly, com rotação a cada uso e hash no
 *   banco;
 * - login com mensagem idêntica para e-mail inexistente e senha errada.
 *
 * Implementação na Fase 1 (`docs/10-roadmap.md`).
 */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    }),
  ],
  exports: [JwtModule],
})
export class AuthModule {}
