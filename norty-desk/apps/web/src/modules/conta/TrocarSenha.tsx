import { useState, type FormEvent } from 'react';

import { ErroDaApi } from '../../api/cliente';
import * as api from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * Troca de senha.
 *
 * A API derruba todas as sessões ao trocar — inclusive esta, porque é o
 * que quem desconfia de algo espera. Por isso, logo depois, o formulário
 * entra de novo com a senha nova: sem isso a pessoa trocaria a senha e
 * cairia na tela de login no clique seguinte.
 */
export function TrocarSenha() {
  const { perfil, entrar } = useAutenticacao();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [trocada, setTrocada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setTrocada(false);

    if (nova.length < 8) {
      setErro('A nova senha precisa de ao menos 8 caracteres.');
      return;
    }
    if (nova !== confirmacao) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }

    setEnviando(true);
    try {
      await api.trocarSenha(atual, nova);
      // Entra de novo pelo caminho que a pessoa tem: e-mail, ou usuário +
      // empresa quando a conta não tem e-mail.
      if (perfil?.user.email) await entrar(perfil.user.email, nova);
      else if (perfil?.user.username) {
        await entrar(perfil.user.username, nova, perfil.organization.slug);
      }
      setAtual('');
      setNova('');
      setConfirmacao('');
      setTrocada(true);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível trocar a senha agora.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="pilha-sm" onSubmit={enviar} noValidate>
      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}
      {trocada ? (
        <div className="alerta-bloco" role="status">
          <span>Senha trocada. As outras sessões abertas foram encerradas.</span>
        </div>
      ) : null}

      <div className="campo">
        <label className="campo-rotulo" htmlFor="senha-atual">
          Senha atual
        </label>
        <input
          id="senha-atual"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
      </div>
      <div className="campo">
        <label className="campo-rotulo" htmlFor="senha-nova">
          Nova senha
        </label>
        <input
          id="senha-nova"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
      </div>
      <div className="campo">
        <label className="campo-rotulo" htmlFor="senha-confirmacao">
          Repita a nova senha
        </label>
        <input
          id="senha-confirmacao"
          className="input"
          type="password"
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </div>

      <div>
        <button type="submit" className="btn -primario" disabled={enviando}>
          {enviando ? 'Trocando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  );
}

/**
 * Tela única enquanto a senha for provisória.
 *
 * A conta nasce com troca obrigatória (criada por um administrador ou
 * pelo seed), e até esta tela existir a obrigação não era cobrada: quem
 * recebia a senha provisória seguia usando-a.
 */
export function TrocaObrigatoria() {
  const { perfil, sair } = useAutenticacao();

  return (
    <div className="tela-publica" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="pilha" style={{ width: 'min(420px, 100%)' }}>
        <div>
          <h2 className="titulo-seccao">Crie a sua senha</h2>
          <p>
            {perfil?.user.name ? `${perfil.user.name}, a` : 'A'} senha que você recebeu é
            provisória. Troque antes de continuar.
          </p>
        </div>
        <TrocarSenha />
        <div>
          <button type="button" className="btn -fantasma -sm" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
