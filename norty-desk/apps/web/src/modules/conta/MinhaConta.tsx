import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Permission } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import * as api from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';
import { TrocarSenha } from './TrocarSenha';

/** Atalhos para as configurações do sistema, filtrados pela permissão de quem vê. */
const CONFIGURACOES: { rotulo: string; para: string; permissao: Permission }[] = [
  { rotulo: 'Marca', para: '/config/marca', permissao: 'organizacao:gerenciar' },
  { rotulo: 'Pessoas', para: '/config/pessoas', permissao: 'pessoa:gerenciar' },
  { rotulo: 'Categorias', para: '/config/categorias', permissao: 'config:categorias' },
  { rotulo: 'SLA e calendários', para: '/config/sla', permissao: 'config:sla' },
  { rotulo: 'Canais', para: '/config/canais', permissao: 'config:canais' },
  { rotulo: 'Auditoria', para: '/config/auditoria', permissao: 'auditoria:ler' },
];

/**
 * Minha conta: os dados da própria pessoa e a troca de senha.
 *
 * E-mail e usuário são o login, então trocá-los pede a senha atual — o
 * campo só aparece quando um dos dois muda, para não pedir senha a quem
 * só corrigiu o telefone.
 */
export function MinhaConta() {
  const { perfil, can, recarregarPerfil } = useAutenticacao();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [usuario, setUsuario] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.user.name);
    setTelefone(perfil.user.phone ?? '');
    setEmail(perfil.user.email ?? '');
    setUsuario(perfil.user.username ?? '');
  }, [perfil]);

  if (!perfil) return null;

  const doDiretorio = Boolean(perfil.user.authSourceName);
  const mudaLogin =
    email.trim().toLowerCase() !== (perfil.user.email ?? '') ||
    usuario.trim().toLowerCase() !== (perfil.user.username ?? '');

  const atalhos = CONFIGURACOES.filter((c) => can(c.permissao));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);
    setEnviando(true);

    try {
      await api.atualizarPerfil({
        name: nome.trim(),
        phone: telefone.trim() || null,
        email: email.trim() || null,
        username: usuario.trim() || null,
        ...(mudaLogin ? { senhaAtual } : {}),
      });
      await recarregarPerfil();
      setSenhaAtual('');
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar agora.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 720 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Minha conta</h2>
          <p>
            {perfil.organization.name} · {perfil.role.toLowerCase()}
          </p>
        </div>
      </div>

      <section className="pilha-sm">
        <h3>Seus dados</h3>

        {erro ? (
          <div className="alerta-bloco -erro" role="alert">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}
        {salvo ? (
          <div className="alerta-bloco" role="status">
            <span>Dados salvos.</span>
          </div>
        ) : null}

        <form className="pilha-sm" onSubmit={salvar} noValidate>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="conta-nome">
              Nome
            </label>
            <input
              id="conta-nome"
              className="input"
              required
              minLength={2}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="conta-telefone">
              Telefone
            </label>
            <input
              id="conta-telefone"
              className="input"
              type="tel"
              autoComplete="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="conta-email">
              E-mail
            </label>
            <input
              id="conta-email"
              className="input"
              type="email"
              autoComplete="email"
              disabled={doDiretorio}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="conta-usuario">
              Nome de usuário
            </label>
            <input
              id="conta-usuario"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={doDiretorio}
              placeholder="nome.sobrenome"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
              Entra com ele e a empresa no lugar do e-mail. É preciso ter ao menos um dos dois.
            </span>
          </div>

          {mudaLogin ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="conta-senha-atual">
                Senha atual (para trocar e-mail ou usuário)
              </label>
              <input
                id="conta-senha-atual"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <button type="submit" className="btn -primario" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </section>

      <section className="pilha-sm">
        <h3>Senha</h3>
        {doDiretorio ? (
          <p className="suave">
            Sua conta é autenticada pelo diretório {perfil.user.authSourceName}: a senha e o login
            são os de lá.
          </p>
        ) : (
          <TrocarSenha />
        )}
      </section>

      {atalhos.length > 0 ? (
        <section className="pilha-sm">
          <h3>Configurações do sistema</h3>
          <p className="suave">Também ficam no fim da barra lateral.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {atalhos.map((c) => (
              <Link key={c.para} to={c.para} className="btn -fantasma -sm">
                {c.rotulo}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
