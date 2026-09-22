import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  MINIMO_PARA_BUSCAR_EMPRESA,
  documentoInvalido,
  formatarProtocolo,
  pareceDocumento,
  type AberturaPublicaResposta,
  type CategoriaPublica,
  type EmpresaPublica,
  type ModeloDeChamado,
} from '@norty-desk/shared';

import {
  abrirChamadoPublico,
  anexarNoPublico,
  buscarEmpresas,
  modelosPublicos,
  reconhecerPessoa,
  tiposPublicos,
} from '../../api/protocolo';
import { useMarca } from '../../api/marca';
import { MarcaCompleta } from '../../components/Marca';
import { CamposDinamicos } from '../formulario/CamposDinamicos';
import { ajudaDoTelefone, mascaraDeTelefone } from '../../lib/telefone';

/** Os mesmos tetos da API, para a tela não prometer o que ela recusa. */
const MAXIMO_DE_OBSERVADORES = 3;
const MAXIMO_DE_ANEXOS = 5;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/**
 * Abrir chamado sem entrar.
 *
 * Dois passos, e o primeiro é quem manda: dizer de qual empresa se
 * trata. Enquanto ela não estiver escolhida, não há o que preencher —
 * um chamado sem empresa não tem para onde ir.
 *
 * O campo aceita nome **ou** documento, e a diferença entre os dois é
 * do sistema, não da pessoa: quem digita onze ou quatorze dígitos está
 * digitando CPF ou CNPJ, com ou sem pontuação, e qualquer outra coisa
 * é nome. Nome procura por semelhança, tolerando letra trocada e
 * acento; documento procura exato.
 *
 * Quem escolhe a empresa é sempre a pessoa, nunca o sistema. Escolher
 * sozinho pelo nome mais parecido poria o chamado na empresa errada
 * sem ninguém perceber — e num sistema de chamados isso é o cliente A
 * lendo o problema do cliente B.
 */
export function AbrirSemLogin() {
  const marca = useMarca();
  const [empresa, setEmpresa] = useState<EmpresaPublica | null>(null);
  const [aberto, setAberto] = useState<AberturaPublicaResposta | null>(null);

  if (aberto) return <Recibo aberto={aberto} empresa={empresa} marca={marca} />;

  return (
    <div className="tela-publica" style={{ minHeight: '100vh', padding: 'var(--e-5)' }}>
      <main className="pilha" style={{ width: 'min(680px, 100%)', margin: '0 auto' }}>
        <MarcaCompleta logoUrl={marca.logoUrl} nome={marca.productName} frase="Abrir chamado" />

        <EscolherEmpresa escolhida={empresa} aoEscolher={setEmpresa} />

        {empresa ? <Descrever empresa={empresa} aoAbrir={setAberto} /> : null}

        <p className="campo-ajuda" style={{ textAlign: 'center' }}>
          Já tem um protocolo? <Link to="/protocolo">Acompanhe seu chamado</Link>.
        </p>
      </main>
    </div>
  );
}

function EscolherEmpresa({
  escolhida,
  aoEscolher,
}: {
  escolhida: EmpresaPublica | null;
  aoEscolher: (e: EmpresaPublica | null) => void;
}) {
  const [digitado, setDigitado] = useState('');
  const [achadas, setAchadas] = useState<EmpresaPublica[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(false);

  // A cada tecla, uma busca seria uma busca por tecla. O intervalo
  // espera a pessoa parar de digitar — e o contador de requisições por
  // IP, do outro lado, agradece.
  const ultima = useRef(0);

  useEffect(() => {
    const termo = digitado.trim();

    if (termo.length < MINIMO_PARA_BUSCAR_EMPRESA) {
      setAchadas([]);
      setBuscou(false);
      setErro(null);
      return;
    }

    const meu = Date.now();
    ultima.current = meu;
    setBuscando(true);

    const relogio = setTimeout(() => {
      void buscarEmpresas(termo)
        .then((lista) => {
          // Resposta de uma busca que já foi substituída não pode
          // sobrescrever a atual: digitar rápido faria a lista piscar
          // resultados de um termo anterior.
          if (ultima.current !== meu) return;
          setAchadas(lista);
          setBuscou(true);
          setErro(null);
        })
        .catch((e: Error) => {
          if (ultima.current !== meu) return;
          setErro(e.message);
          setAchadas([]);
        })
        .finally(() => {
          if (ultima.current === meu) setBuscando(false);
        });
    }, 350);

    return () => clearTimeout(relogio);
  }, [digitado]);

  if (escolhida) {
    return (
      <section className="card">
        <div className="card-corpo linha-entre">
          <div>
            <p className="campo-ajuda">Empresa</p>
            <strong>{escolhida.name}</strong>
          </div>
          <button
            type="button"
            className="btn -fantasma -sm"
            onClick={() => {
              aoEscolher(null);
              setDigitado('');
              setAchadas([]);
              setBuscou(false);
            }}
          >
            Trocar
          </button>
        </div>
      </section>
    );
  }

  const termo = digitado.trim();
  // O aviso do dígito verificador só aparece quando a forma já é de
  // documento: dizer "CNPJ inválido" para quem digitou meio nome seria
  // corrigir o que ninguém errou.
  const problemaNoDocumento = pareceDocumento(termo) ? documentoInvalido(termo) : null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h1 className="card-titulo">De qual empresa é o chamado?</h1>
          <p className="card-sub">Digite o nome da empresa ou o CNPJ.</p>
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        <div className="campo">
          <label className="campo-rotulo" htmlFor="empresa">
            Nome ou CNPJ
          </label>
          <input
            id="empresa"
            className="input"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder="Empresa do João  ou  12.345.678/0001-90"
            autoComplete="off"
            autoFocus
          />
          <span className="campo-ajuda">
            {problemaNoDocumento
              ? problemaNoDocumento
              : 'O CNPJ pode ir com ou sem pontuação. No nome, um erro de digitação não atrapalha.'}
          </span>
        </div>

        {erro ? (
          <div className="alerta-bloco -aviso" role="status">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {buscando && achadas.length === 0 ? <div className="sk sk-linha" /> : null}

        {achadas.length > 0 ? (
          <ul className="achadas">
            {achadas.map((e) => (
              <li key={e.id}>
                <button type="button" className="achada" onClick={() => aoEscolher(e)}>
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {buscou && !buscando && achadas.length === 0 && !erro ? (
          <p className="campo-ajuda">
            Nenhuma empresa com esse nome ou CNPJ. Confira o que digitou — ou fale com quem
            cuida do contrato na sua empresa.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Descrever({
  empresa,
  aoAbrir,
}: {
  empresa: EmpresaPublica;
  aoAbrir: (r: AberturaPublicaResposta) => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [reconhecendo, setReconhecendo] = useState(false);
  const [reconhecida, setReconhecida] = useState<string | null>(null);
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [tipos, setTipos] = useState<CategoriaPublica[]>([]);
  const [modelos, setModelos] = useState<ModeloDeChamado[]>([]);
  const [tipo, setTipo] = useState('');
  const [modelo, setModelo] = useState<ModeloDeChamado | null>(null);
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [observadores, setObservadores] = useState<string[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);

  useEffect(() => {
    void tiposPublicos(empresa.id).then(setTipos);
    void modelosPublicos(empresa.id).then(setModelos);
  }, [empresa.id]);

  /**
   * Escolher o modelo troca os campos — e as respostas vão junto.
   *
   * Manter as antigas mandaria chaves de outro schema, que a API recusa
   * com uma mensagem sobre um campo que a pessoa não vê mais.
   */
  function escolherModelo(escolhido: ModeloDeChamado | null) {
    setModelo(escolhido);
    setRespostas({});
    // O modelo pode trazer a categoria dele; ela vence a escolha
    // manual, porque foi quem montou o modelo que a decidiu.
    if (escolhido?.category) setTipo(escolhido.category.id);
  }

  /**
   * Preenche o resto a partir do que a pessoa acabou de digitar.
   *
   * Roda ao sair do campo, e não a cada tecla: a API só casa com o
   * identificador inteiro, então pedir a cada letra seria uma chamada
   * por tecla para receber `null` em todas menos na última.
   *
   * Só preenche o que está vazio. Sobrescrever o que a pessoa escreveu
   * à mão é o defeito clássico do autopreenchimento — ela corrige o
   * telefone, sai do campo do nome, e o telefone volta ao antigo.
   */
  async function reconhecer(digitado: string) {
    if (!empresa || reconhecendo) return;
    const termo = digitado.trim();
    if (termo.length < 6) return;

    setReconhecendo(true);
    try {
      const achada = await reconhecerPessoa(empresa.id, termo);
      if (!achada) return;

      setNome((atual) => atual.trim() || achada.name);
      if (achada.email) setEmail((atual) => atual.trim() || achada.email!);
      if (achada.phone) {
        setTelefone((atual) => atual.trim() || mascaraDeTelefone(achada.phone!));
      }
      setReconhecida(achada.name);
    } catch {
      // Reconhecer é conveniência: falhar em silêncio e deixar a pessoa
      // preencher à mão é melhor que um alerta sobre algo que ela não
      // pediu.
    } finally {
      setReconhecendo(false);
    }
  }

  const temRetorno = email.trim().length > 0 || telefone.trim().length > 0;
  const pronto =
    nome.trim().length >= 3 &&
    temRetorno &&
    assunto.trim().length >= 3 &&
    descricao.trim().length >= 10;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!pronto || enviando) return;

    setErro(null);
    setEnviando(true);

    void abrirChamadoPublico({
      clientId: empresa.id,
      requesterName: nome.trim(),
      ...(email.trim() ? { requesterEmail: email.trim() } : {}),
      ...(telefone.trim() ? { requesterPhone: telefone.trim() } : {}),
      subject: assunto.trim(),
      description: descricao.trim(),
      ...(tipo ? { categoryId: tipo } : {}),
      ...(modelo ? { formId: modelo.id, customFields: respostas } : {}),
      ...(observadores.length > 0 ? { observerEmails: observadores } : {}),
    })
      .then(async (aberto) => {
        // Os anexos vão depois, pelo protocolo. Um que falhe não
        // desfaz o chamado — ele já existe, e dizer "não consegui
        // abrir" seria mentira que gera um segundo chamado igual.
        const falhas: string[] = [];
        for (const arquivo of arquivos) {
          try {
            await anexarNoPublico(aberto.protocol, arquivo);
          } catch {
            falhas.push(arquivo.name);
          }
        }
        if (falhas.length > 0) {
          setErro(
            `Chamado aberto, mas não consegui anexar: ${falhas.join(', ')}. ` +
              'Você pode mandar por e-mail respondendo o chamado.',
          );
        }
        aoAbrir(aberto);
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setEnviando(false));
  }

  return (
    <form className="card" onSubmit={enviar}>
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">O que está acontecendo?</h2>
          <p className="card-sub">Quanto mais claro, mais rápido a gente resolve.</p>
        </div>
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro" role="status">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {modelos.length > 0 ? (
          <div className="campo">
            <span className="campo-rotulo">Do que se trata?</span>
            <div className="modelos">
              {modelos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`modelo ${modelo?.id === m.id ? '-escolhido' : ''}`}
                  aria-pressed={modelo?.id === m.id}
                  onClick={() => escolherModelo(modelo?.id === m.id ? null : m)}
                >
                  <strong>{m.name}</strong>
                  {m.description ? <span className="modelo-frase">{m.description}</span> : null}
                </button>
              ))}
            </div>
            <span className="campo-ajuda">
              Escolher um traz as perguntas certas. Se nenhum servir, descreva abaixo.
            </span>
          </div>
        ) : null}

        {tipos.length > 0 && !modelo?.category ? (
          <div className="campo">
            <label className="campo-rotulo" htmlFor="tipo">
              Tipo de chamado
            </label>
            <select
              id="tipo"
              className="select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">Não sei classificar</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="campo-ajuda">O tipo leva o chamado direto para quem atende.</span>
          </div>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="quem">
            Seu nome
          </label>
          <input
            id="quem"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={(e) => void reconhecer(e.target.value)}
            maxLength={160}
            autoComplete="name"
          />
          {reconhecida ? (
            <span className="campo-ajuda">
              Reconhecemos {reconhecida} no cadastro da empresa e preenchemos o que faltava. Se
              algo estiver desatualizado, é só corrigir.
            </span>
          ) : (
            <span className="campo-ajuda">
              Nome completo ou e-mail: se você já está no cadastro da empresa, o resto vem sozinho.
            </span>
          )}
        </div>

        <div className="campo-grupo">
          <div className="campo">
            <label className="campo-rotulo" htmlFor="email-abertura">
              E-mail
            </label>
            <input
              id="email-abertura"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => void reconhecer(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="whats-abertura">
              WhatsApp
            </label>
            <input
              id="whats-abertura"
              className="input"
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascaraDeTelefone(e.target.value))}
              placeholder="(11) 99999-9999"
              maxLength={32}
            />
            <span className="campo-ajuda">{ajudaDoTelefone(telefone)}</span>
          </div>
        </div>

        {!temRetorno ? (
          <p className="campo-ajuda">Preencha ao menos um dos dois, para podermos responder.</p>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="assunto">
            Assunto
          </label>
          <input
            id="assunto"
            className="input"
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Impressora da recepção parou"
            maxLength={255}
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="descricao">
            Descrição
          </label>
          <textarea
            id="descricao"
            className="textarea"
            rows={5}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Desde quando acontece, o que já foi tentado, qual equipamento."
            maxLength={10000}
          />
        </div>

        {modelo ? (
          <CamposDinamicos
            schema={modelo.schema}
            respostas={respostas}
            noPortal
            aoMudar={(chave, valor) =>
              setRespostas((atual) => {
                const proximo = { ...atual };
                if (valor === '' || valor === undefined || valor === null) delete proximo[chave];
                else proximo[chave] = valor;
                return proximo;
              })
            }
          />
        ) : null}

        <Observadores escolhidos={observadores} aoMudar={setObservadores} />
        <Anexos escolhidos={arquivos} aoMudar={setArquivos} />

        <button type="submit" className="btn -primario" disabled={!pronto || enviando}>
          {enviando ? 'Abrindo…' : 'Abrir chamado'}
        </button>
      </div>
    </form>
  );
}

/**
 * Quem acompanha junto, por e-mail.
 *
 * E-mail e não uma lista de pessoas: quem abre sem login não conhece
 * ninguém do sistema, e oferecer-lhe o catálogo da empresa entregaria
 * os nomes a quem só digitou um CNPJ.
 */
function Observadores({
  escolhidos,
  aoMudar,
}: {
  escolhidos: string[];
  aoMudar: (e: string[]) => void;
}) {
  const [digitado, setDigitado] = useState('');

  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digitado.trim());
  const cheio = escolhidos.length >= MAXIMO_DE_OBSERVADORES;

  function somar() {
    const email = digitado.trim().toLowerCase();
    if (!valido || cheio || escolhidos.includes(email)) return;
    aoMudar([...escolhidos, email]);
    setDigitado('');
  }

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor="observador-publico">
        Quem mais acompanha? (opcional)
      </label>

      {escolhidos.length > 0 ? (
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          {escolhidos.map((e) => (
            <span key={e} className="selo -contorno">
              {e}
              <button
                type="button"
                className="selo-x"
                aria-label={`Tirar ${e}`}
                onClick={() => aoMudar(escolhidos.filter((x) => x !== e))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {!cheio ? (
        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <input
            id="observador-publico"
            className="input"
            type="email"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder="chefe@suaempresa.com.br"
            // Enter aqui soma o e-mail; sem isto ele enviaria o
            // formulário inteiro com o campo pela metade.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                somar();
              }
            }}
          />
          <button type="button" className="btn -secundario" disabled={!valido} onClick={somar}>
            Somar
          </button>
        </div>
      ) : null}

      <span className="campo-ajuda">
        {cheio
          ? `São no máximo ${MAXIMO_DE_OBSERVADORES}.`
          : 'Eles recebem as respostas do chamado junto com você.'}
      </span>
    </div>
  );
}

/**
 * Os arquivos.
 *
 * Escolhidos aqui e enviados **depois** de o chamado existir, pelo
 * protocolo. A tela mostra a lista antes de enviar para que a pessoa
 * possa tirar o que anexou por engano — depois de aberto, quem retira
 * é quem tem conta.
 */
function Anexos({
  escolhidos,
  aoMudar,
}: {
  escolhidos: File[];
  aoMudar: (a: File[]) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const cheio = escolhidos.length >= MAXIMO_DE_ANEXOS;

  return (
    <div className="campo">
      <span className="campo-rotulo">Anexos (opcional)</span>

      {escolhidos.length > 0 ? (
        <ul className="pilha-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {escolhidos.map((a, i) => (
            <li key={`${a.name}-${i}`} className="linha-entre">
              <span className="campo-ajuda">
                📎 {a.name} · {Math.max(1, Math.round(a.size / 1024))} KB
              </span>
              <button
                type="button"
                className="btn -fantasma -sm"
                aria-label={`Tirar ${a.name}`}
                onClick={() => aoMudar(escolhidos.filter((_, j) => j !== i))}
              >
                Tirar
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={campo}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const novos = [...(e.target.files ?? [])].filter((a) => a.size <= TAMANHO_MAXIMO);
          aoMudar([...escolhidos, ...novos].slice(0, MAXIMO_DE_ANEXOS));
          // Sem limpar, escolher o mesmo arquivo de novo não dispara
          // `change` e a pessoa acha que o clique não funcionou.
          e.target.value = '';
        }}
      />

      <button
        type="button"
        className="btn -secundario"
        disabled={cheio}
        onClick={() => campo.current?.click()}
      >
        {cheio ? `São no máximo ${MAXIMO_DE_ANEXOS} arquivos` : 'Escolher arquivos'}
      </button>

      <span className="campo-ajuda">Foto do erro, foto da etiqueta, log. Até 10 MB cada.</span>
    </div>
  );
}

/**
 * O protocolo, que é o que a pessoa leva desta tela.
 *
 * Grande e destacado de propósito: sem ele, ela não tem como voltar a
 * saber do próprio chamado — não há conta, não há histórico, não há
 * "meus chamados". O protocolo é o único fio.
 */
function Recibo({
  aberto,
  empresa,
  marca,
}: {
  aberto: AberturaPublicaResposta;
  empresa: EmpresaPublica | null;
  marca: { logoUrl: string | null; productName: string };
}) {
  const bonito = formatarProtocolo(aberto.protocol);

  return (
    <div className="tela-publica" style={{ minHeight: '100vh', padding: 'var(--e-5)' }}>
      <main className="pilha" style={{ width: 'min(680px, 100%)', margin: '0 auto' }}>
        <MarcaCompleta logoUrl={marca.logoUrl} nome={marca.productName} frase="Chamado aberto" />

        <section className="card">
          <div className="card-corpo pilha">
            <div className="alerta-bloco -sucesso">
              <span aria-hidden="true">✓</span>
              <span>Chamado aberto{empresa ? ` para ${empresa.name}` : ''}.</span>
            </div>

            <div>
              <p className="campo-ajuda">GUARDE ESTE PROTOCOLO</p>
              <p className="protocolo-recibo">{bonito}</p>
              <p className="campo-ajuda">
                É com ele que você acompanha o chamado. Anote ou tire uma foto desta tela.
              </p>
            </div>

            <Link className="btn -primario" to={`/protocolo/${aberto.protocol}`}>
              Acompanhar agora
            </Link>

            <Link className="btn -secundario" to="/abrir" reloadDocument>
              Abrir outro chamado
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
