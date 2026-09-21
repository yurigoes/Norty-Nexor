import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  MINIMO_PARA_BUSCAR_EMPRESA,
  documentoInvalido,
  formatarProtocolo,
  pareceDocumento,
  type AberturaPublicaResposta,
  type EmpresaPublica,
} from '@norty-desk/shared';

import { abrirChamadoPublico, buscarEmpresas } from '../../api/protocolo';
import { useMarca } from '../../api/marca';
import { MarcaCompleta } from '../../components/Marca';

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
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Uma das duas formas de retorno basta, mas alguma é obrigatória:
  // chamado sem retorno é chamado que ninguém consegue responder.
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
    })
      .then(aoAbrir)
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

        <div className="campo">
          <label className="campo-rotulo" htmlFor="quem">
            Seu nome
          </label>
          <input
            id="quem"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={160}
          />
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
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="whats-abertura">
              WhatsApp
            </label>
            <input
              id="whats-abertura"
              className="input"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="+55 11 99999-9999"
              maxLength={32}
            />
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

        <button type="submit" className="btn -primario" disabled={!pronto || enviando}>
          {enviando ? 'Abrindo…' : 'Abrir chamado'}
        </button>
      </div>
    </form>
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
