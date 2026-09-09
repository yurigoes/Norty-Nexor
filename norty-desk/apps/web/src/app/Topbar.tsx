export function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar__busca">
        <input
          className="campo"
          type="search"
          placeholder="Buscar por número, assunto ou solicitante"
          aria-label="Buscar chamados"
        />
      </div>
      <button type="button" className="botao botao--primario">
        Novo chamado
      </button>
    </header>
  );
}
