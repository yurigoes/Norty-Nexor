export function Header({
  titulo,
  trilha,
  aoVoltar,
}: {
  titulo: string;
  trilha: string[];
  aoVoltar?: () => void;
}) {
  return (
    <header className="header">
      {aoVoltar ? (
        <button type="button" className="btn-icone -borda" onClick={aoVoltar} aria-label="Voltar para a fila">
          <span aria-hidden="true">←</span>
        </button>
      ) : null}

      <div className="header-titulo">
        <nav className="trilha" aria-label="Trilha de navegação">
          {trilha.map((passo, indice) => (
            <span key={passo}>
              {indice > 0 ? <span aria-hidden="true">/ </span> : null}
              {passo}
            </span>
          ))}
        </nav>
        <h1>{titulo}</h1>
      </div>

      <div className="header-acoes">
        <label className="so-leitor" htmlFor="busca-global">
          Buscar chamados
        </label>
        <div className="busca">
          <input
            id="busca-global"
            className="input"
            type="search"
            placeholder="Buscar por número, assunto ou solicitante"
          />
        </div>

        <button type="button" className="btn -primario">
          Novo chamado
        </button>
      </div>
    </header>
  );
}
