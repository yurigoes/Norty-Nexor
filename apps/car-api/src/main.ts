import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { API_VERSION, PRODUCT_FULL_NAME } from '@nortycar/shared';
import { AppModule } from './app.module';
import { loadConfig } from './config/env';
import { requestId } from './common/request-id';

export async function createApp(): Promise<NestExpressApplication> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.nodeEnv === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });

  /**
   * Atrás de proxy (Cloudflare Tunnel, Caddy) toda requisição chega com o
   * IP do proxy. Sem confiar no primeiro salto, o limitador do login
   * contaria todo mundo junto e a auditoria registraria sempre o mesmo IP.
   * Só um salto: confiar na cadeia toda deixaria o cliente forjar o IP.
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.disable('x-powered-by');
  app.use(requestId);
  app.setGlobalPrefix(API_VERSION);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });

  /**
   * `credentials: true` permite o cookie do refresh entre app e API. Com
   * ele a lista de origens não pode ser `*` — seria autorizar qualquer
   * site a agir em nome do usuário.
   */
  app.enableCors({ origin: config.cors.origins, credentials: true, exposedHeaders: ['x-request-id', 'content-disposition'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Campo desconhecido no corpo é erro, não algo a ignorar em silêncio.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`${PRODUCT_FULL_NAME} — API em http://0.0.0.0:${config.port}/${API_VERSION} (${config.nodeEnv})`);
}

if (require.main === module) {
  bootstrap().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar a API:', error);
    process.exit(1);
  });
}
