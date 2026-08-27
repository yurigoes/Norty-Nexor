import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_VERSION } from '@myhome/shared';
import { AppModule } from './app.module';
import { loadConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  /**
   * A API fica atrás do Cloudflare Tunnel, então toda requisição chega
   * com o IP do túnel, não o do visitante. Sem confiar no proxy, duas
   * coisas quebram em silêncio: a trilha de auditoria registra sempre o
   * mesmo IP, e o limitador do login passa a contar todo mundo junto —
   * oito tentativas de qualquer pessoa bloqueariam o condomínio inteiro.
   *
   * `1` = confia só no primeiro salto. Confiar na cadeia toda deixaria
   * qualquer cliente forjar o próprio IP no X-Forwarded-For e escapar do
   * limitador.
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.setGlobalPrefix(API_VERSION);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  /**
   * `credentials: true` é o que permite o cookie do refresh token viajar
   * entre myhome.norty.com.br e api-myhome.norty.com.br. Com ele, a lista
   * de origens não pode ser `*` — o navegador recusa a combinação, e com
   * razão: seria autorizar qualquer site a agir em nome do usuário.
   */
  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Campo desconhecido no corpo é erro, não algo a ignorar em
      // silêncio: quase sempre é um cliente desatualizado.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  logger.log(`my Home API em http://0.0.0.0:${config.port}/${API_VERSION} (${config.nodeEnv})`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar a API:', error);
  process.exit(1);
});
