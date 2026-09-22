import { useEffect, useState, type FormEvent } from 'react';
import { AI_PROVIDERS, NOME_DA_IA, type AiConfigView, type AiProviderNome } from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';

const ROTULO_PROVEDOR: Record<AiProviderNome, string> = {
  GEMINI: 'Google Gemini',
  GROQ: 'Groq',
};

/**
 * Sugestões de modelo, não padrão embutido.
 *
 * Nome de modelo muda mais rápido que deploy: o campo é livre, e isto
 * aqui só poupa a ida à documentação de quem está começando.
 */
const SUGESTOES: Record<AiProviderNome, string[]> = {
  GEMINI: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  GROQ: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
};

const ONDE_PEGAR: Record<AiProviderNome, { texto: string; url: string }> = {
  GEMINI: { texto: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  GROQ: { texto: 'console da Groq', url: 'https://console.groq.com/keys' },
};

/**
 * O Norty Copilot.
 *
 * Uma configuração por organização: provedor, chave e modelo. A chave
 * é cifrada no banco e **nunca volta** para esta tela — o que volta é
 * "há uma chave guardada", pela mesma razão que a senha do canal não
 * volta.
 *
 * O texto desta tela diz duas coisas que o administrador precisa saber
 * antes de ligar, e diz sem rodeio: o que sai da casa, e que toda
 * resposta redigida pela IA vai marcada como tal — na tela, no e-mail e
 * no WhatsApp.
 */
export function Copilot() {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [provider, setProvider] = useState<AiProviderNome>('GEMINI');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [isActive, setIsActive] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [trocarChave, setTrocarChave] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void api
      .configDoCopilot()
      .then((c) => {
        setConfig(c);
        if (c) {
          setProvider(c.provider);
          setModel(c.model);
          setIsActive(c.isActive);
        }
      })
      .catch(() => setErro('Não foi possível carregar a configuração.'))
      .finally(() => setCarregando(false));
  }, []);

  // Sem chave guardada, o campo já nasce aberto: não há o que manter.
  const campoDaChaveAberto = trocarChave || !config?.temChave;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    try {
      const salva = await api.escreverConfigDoCopilot({
        provider,
        model: model.trim(),
        isActive,
        // Omitir mantém a chave guardada; string vazia apaga.
        ...(campoDaChaveAberto ? { apiKey: apiKey.trim() } : {}),
      });
      setConfig(salva);
      setApiKey('');
      setTrocarChave(false);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 720 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">{NOME_DA_IA}</h2>
          <p>
            O Copilot ajuda o atendente a redigir a resposta e sugere o que verificar. Ele{' '}
            <strong>nunca responde sozinho</strong>: devolve texto, e quem envia é a pessoa.
          </p>
        </div>
        <span className={`selo ${config?.isActive ? '-sucesso' : '-neutro'}`}>
          {config?.isActive ? 'Ligado' : 'Desligado'}
        </span>
      </div>

      <div className="alerta-bloco -info">
        <span aria-hidden="true">i</span>
        <div>
          <strong>Toda resposta redigida pela IA vai declarada.</strong> Na tela ela leva o selo
          “🤖 IA”; no e-mail e no WhatsApp, uma linha dizendo que o texto foi gerado por IA e
          enviado pelo atendimento. Quem recebe de fora é justamente quem não teria como
          desconfiar.
        </div>
      </div>

      <div className="alerta-bloco -aviso">
        <span aria-hidden="true">!</span>
        <div>
          <strong>O que sai da casa.</strong> Ao ligar, o assunto, a descrição e as{' '}
          <em>mensagens públicas</em> do chamado são enviados ao provedor escolhido. Não saem:
          nota interna, campo interno do formulário, dado de acesso e nenhum identificador de
          chamado, pessoa ou empresa.
        </div>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {salvo ? (
        <div className="alerta-bloco -sucesso" role="status">
          <span aria-hidden="true">✓</span>
          <span>Configuração salva.</span>
        </div>
      ) : null}

      <form className="pilha-sm" onSubmit={salvar} noValidate>
        <div className="campo">
          <label className="campo-rotulo" htmlFor="copilot-provedor">
            Provedor
          </label>
          <select
            id="copilot-provedor"
            className="input"
            value={provider}
            onChange={(e) => {
              const escolhido = e.target.value as AiProviderNome;
              setProvider(escolhido);
              // Modelo de um provedor não existe no outro: trocar sem
              // trocar o modelo daria erro só na hora de usar.
              setModel(SUGESTOES[escolhido][0]);
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PROVEDOR[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="copilot-modelo">
            Modelo
          </label>
          <input
            id="copilot-modelo"
            className="input"
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={SUGESTOES[provider][0]}
          />
          <span className="campo-ajuda" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            Sugestões:
            {SUGESTOES[provider].map((s) => (
              <button key={s} type="button" className="btn -fantasma -sm" onClick={() => setModel(s)}>
                {s}
              </button>
            ))}
          </span>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="copilot-chave">
            Chave do provedor
          </label>
          {campoDaChaveAberto ? (
            <input
              id="copilot-chave"
              className="input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole a chave aqui"
            />
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="selo -neutro">Chave guardada</span>
              <button
                type="button"
                className="btn -secundario -sm"
                onClick={() => setTrocarChave(true)}
              >
                Trocar
              </button>
            </div>
          )}
          <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
            A chave é cifrada no banco e não volta para esta tela. Pegue a sua no{' '}
            <a href={ONDE_PEGAR[provider].url} target="_blank" rel="noreferrer">
              {ONDE_PEGAR[provider].texto}
            </a>
            .{campoDaChaveAberto && config?.temChave ? ' Deixe em branco para apagar a guardada.' : ''}
          </span>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
          <span>Ligar o {NOME_DA_IA} para quem atende</span>
        </label>
        <span className="campo-ajuda">
          Desligado, os botões nem aparecem na caixa de resposta — botão que não responde é pior
          que botão nenhum.
        </span>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            className={`btn -primario ${salvando ? '-carregando' : ''}`}
            disabled={salvando}
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
