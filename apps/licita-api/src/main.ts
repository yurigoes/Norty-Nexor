import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ErroFilter } from './common/erro.filter';
import { carregarConfig } from './config/env';

async function iniciar(): Promise<void> {
  const config = carregarConfig();
  const logger = new Logger('Inicialização');

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());

  // A API fica atrás do Cloudflare Tunnel, então o IP do cliente
  // chega em X-Forwarded-For. Sem confiar no proxy, o limite de
  // tentativas contaria todo mundo como um único endereço — e um
  // usuário estouraria a cota de todos.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  /**
   * `credentials: true` é o que deixa o cookie do refresh viajar
   * entre licita.norty.com.br e a API. Com ele a lista de origens
   * não pode ser `*` — o navegador recusa a combinação, e com
   * razão: seria autorizar qualquer site a agir pelo usuário.
   */
  app.enableCors({ origin: config.cors.origens, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Campo desconhecido no corpo é erro, não algo a ignorar em
      // silêncio: quase sempre é cliente desatualizado.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new ErroFilter());
  app.enableShutdownHooks();

  await app.listen(config.porta, '0.0.0.0');
  logger.log(`LICITA+ API em http://0.0.0.0:${config.porta}/v1 (${config.nodeEnv})`);

  if (!config.smtp.ativo) {
    logger.warn('SMTP não configurado — confirmação de conta não será enviada.');
  }
}

iniciar().catch((erro) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar a API:', erro);
  process.exit(1);
});
