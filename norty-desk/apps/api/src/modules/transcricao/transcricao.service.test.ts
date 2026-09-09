import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';

import { TranscricaoService } from './transcricao.service';

function servico(env: Record<string, string> = {}): TranscricaoService {
  return new TranscricaoService(new ConfigService(env));
}

describe('transcrição de áudio', () => {
  it('reconhece os formatos que o WhatsApp manda', () => {
    const s = servico();

    assert.equal(s.ehAudio('audio/ogg; codecs=opus'), true, 'é o formato do áudio do WhatsApp');
    assert.equal(s.ehAudio('AUDIO/MPEG'), true, 'o cabeçalho pode vir em maiúsculas');
    assert.equal(s.ehAudio('image/jpeg'), false);
    assert.equal(s.ehAudio('video/mp4'), false, 'vídeo não passa por aqui');
    assert.equal(s.ehAudio(undefined), false);
  });

  it('desligada sem OLLAMA_BASE_URL, e não tenta nada', async () => {
    const s = servico();

    assert.equal(s.habilitada, false);
    assert.equal(
      await s.transcrever(Buffer.from('x'), 'audio/ogg'),
      null,
      'sem endereço configurado não há o que chamar',
    );
  });

  it('áudio acima do limite não vai para o modelo', async () => {
    const s = servico({ OLLAMA_BASE_URL: 'http://127.0.0.1:1', TRANSCRICAO_LIMITE_MB: '1' });
    const grande = Buffer.alloc(2 * 1024 * 1024);

    assert.equal(await s.transcrever(grande, 'audio/ogg'), null);
  });

  it('Ollama fora do ar devolve nulo, não exceção', async () => {
    // Porta 1 não escuta: é o Ollama caído.
    const s = servico({ OLLAMA_BASE_URL: 'http://127.0.0.1:1' });

    assert.equal(
      await s.transcrever(Buffer.from('audio'), 'audio/ogg'),
      null,
      'o cliente já mandou o áudio e espera atendimento, não erro de recurso interno',
    );
  });

  it('a marca diz que o texto saiu de um modelo', () => {
    const com = TranscricaoService.comMarca('O notebook não liga.');

    assert.ok(com.includes('Transcrição do áudio'));
    assert.ok(
      com.includes('O notebook não liga.'),
      'quem lê precisa saber que aquilo veio de um modelo e pode estar errado',
    );
  });

  it('a legenda do áudio entra junto, sem se confundir com a transcrição', () => {
    const com = TranscricaoService.comMarca('O notebook não liga.', 'urgente por favor');

    assert.ok(com.includes('Legenda: urgente por favor'));
    assert.ok(com.indexOf('Transcrição') < com.indexOf('Legenda'));
  });

  it('legenda vazia não vira linha em branco', () => {
    assert.equal(TranscricaoService.comMarca('Texto.', '   ').includes('Legenda'), false);
    assert.equal(TranscricaoService.comMarca('Texto.', null).includes('Legenda'), false);
  });
});
