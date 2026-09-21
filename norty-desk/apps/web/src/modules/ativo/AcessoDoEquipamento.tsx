import { useCallback, useEffect, useState } from 'react';
import {
  REMOTE_ACCESS_KINDS,
  ROTULO_ACESSO_REMOTO,
  tailscaleInvalido,
  type AcessoRemotoView,
  type AssetView,
  type RemoteAccessKind,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  acessoRemoto,
  ativosDoChamado,
  revelarSenhaRemota,
  salvarAcessoRemoto,
} from '../../api/ativos';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * Como se chega nas máquinas deste chamado.
 *
 * O chamado chega dizendo "o notebook do financeiro não conecta", e o
 * que o técnico precisa é o IP e a senha — agora, não numa planilha
 * compartilhada, que é onde essa informação costuma morar sem dono e
 * sem registro de quem a leu.
 *
 * A senha **não vem** com o resto: a tela sabe que ela existe, e quem
 * precisa dela pede. Cada pedido fica na auditoria, e é por isso que o
 * botão diz o que faz em vez de revelar sozinho ao abrir o chamado.
 */
export function AcessoDoEquipamento({
  ticketId,
  versao = 0,
}: {
  ticketId: string;
  /** Muda quando alguém vincula ou desvincula equipamento ao lado. */
  versao?: number;
}) {
  const { can } = useAutenticacao();
  const [ativos, setAtivos] = useState<AssetView[] | null>(null);

  const recarregar = useCallback(async () => {
    setAtivos(await ativosDoChamado(ticketId));
  }, [ticketId]);

  // `versao` entra aqui, e não na função: ela não usa o valor, só
  // precisa rodar de novo quando ele muda. Pô-la na dependência do
  // `useCallback` faria uma função nova sem motivo — e o lint, com
  // razão, recusa.
  useEffect(() => {
    if (!can('ativo:acesso-remoto')) return;
    void recarregar().catch(() => setAtivos([]));
  }, [recarregar, can, versao]);

  // Sem permissão, sem cartão. Quem lê o inventário para contar
  // equipamento não precisa da chave de casa.
  if (!can('ativo:acesso-remoto') || !ativos || ativos.length === 0) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">Como acessar</h2>
          <p className="card-sub">Tailscale, VPN e acesso remoto dos equipamentos do chamado.</p>
        </div>
      </div>

      <div className="card-corpo pilha">
        {ativos.map((a) => (
          <Maquina key={a.id} ativo={a} />
        ))}
      </div>
    </section>
  );
}

function Maquina({ ativo }: { ativo: AssetView }) {
  const [acesso, setAcesso] = useState<AcessoRemotoView | null>(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setAcesso(await acessoRemoto(ativo.id));
  }, [ativo.id]);

  useEffect(() => {
    void recarregar().catch((e: Error) => setErro(e.message));
  }, [recarregar]);

  if (!acesso) return null;

  const vazio =
    !acesso.tailscaleIp && !acesso.vpnNotes && !acesso.remoteAccessId && !acesso.temSenha;

  return (
    <article className="maquina">
      <header className="linha-entre">
        <div>
          <strong>{ativo.name}</strong>
          {ativo.tag ? <span className="campo-ajuda"> · {ativo.tag}</span> : null}
        </div>
        <button type="button" className="btn -fantasma -sm" onClick={() => setEditando((e) => !e)}>
          {editando ? 'Fechar' : vazio ? 'Preencher' : 'Editar'}
        </button>
      </header>

      {erro ? (
        <div className="alerta-bloco -erro" role="status">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!editando ? (
        vazio ? (
          <p className="campo-ajuda">
            Nada cadastrado. Preencha uma vez e o próximo chamado desta máquina já vem com isso.
          </p>
        ) : (
          <dl className="acesso">
            {acesso.tailscaleIp ? (
              <Dado rotulo="Tailscale" valor={acesso.tailscaleIp} copiavel />
            ) : null}
            {acesso.remoteAccessId ? (
              <Dado
                rotulo={
                  acesso.remoteAccessKind
                    ? ROTULO_ACESSO_REMOTO[acesso.remoteAccessKind]
                    : 'Acesso remoto'
                }
                valor={acesso.remoteAccessId}
                copiavel
              />
            ) : null}
            {acesso.temSenha ? <Senha assetId={ativo.id} aoErrar={setErro} /> : null}
            {acesso.vpnNotes ? <Dado rotulo="VPN" valor={acesso.vpnNotes} /> : null}
          </dl>
        )
      ) : (
        <Editar
          assetId={ativo.id}
          acesso={acesso}
          aoSalvar={async () => {
            await recarregar();
            setEditando(false);
          }}
          aoErrar={setErro}
        />
      )}
    </article>
  );
}

function Dado({
  rotulo,
  valor,
  copiavel = false,
}: {
  rotulo: string;
  valor: string;
  copiavel?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="acesso-linha">
      <dt className="acesso-rotulo">{rotulo}</dt>
      <dd className="acesso-valor">
        <span className="mono">{valor}</span>
        {copiavel ? (
          <button
            type="button"
            className="btn -fantasma -sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(valor)
                .then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                })
                .catch(() => undefined);
            }}
          >
            {copiado ? 'copiado' : 'copiar'}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * A senha, sob pedido.
 *
 * Fechada por padrão porque abrir o chamado não é pedir a senha, e cada
 * revelação vai para a auditoria — uma trilha que registrasse toda
 * abertura de chamado não diria mais nada sobre quem realmente
 * precisou dela.
 */
function Senha({ assetId, aoErrar }: { assetId: string; aoErrar: (m: string) => void }) {
  const [valor, setValor] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);

  return (
    <div className="acesso-linha">
      <dt className="acesso-rotulo">Senha</dt>
      <dd className="acesso-valor">
        {valor === null ? (
          <>
            <span className="mono">••••••••</span>
            <button
              type="button"
              className="btn -secundario -sm"
              disabled={pedindo}
              onClick={() => {
                setPedindo(true);
                void revelarSenhaRemota(assetId)
                  .then((r) => setValor(r.secret))
                  .catch((e: unknown) =>
                    aoErrar(e instanceof ErroDaApi ? e.message : 'Não foi possível revelar.'),
                  )
                  .finally(() => setPedindo(false));
              }}
            >
              {pedindo ? 'Revelando…' : 'Revelar'}
            </button>
            <span className="campo-ajuda">Fica registrado quem revelou.</span>
          </>
        ) : (
          <>
            <span className="mono">{valor}</span>
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => {
                void navigator.clipboard?.writeText(valor).catch(() => undefined);
              }}
            >
              copiar
            </button>
            <button type="button" className="btn -fantasma -sm" onClick={() => setValor(null)}>
              esconder
            </button>
          </>
        )}
      </dd>
    </div>
  );
}

function Editar({
  assetId,
  acesso,
  aoSalvar,
  aoErrar,
}: {
  assetId: string;
  acesso: AcessoRemotoView;
  aoSalvar: () => Promise<void>;
  aoErrar: (m: string) => void;
}) {
  const [tailscale, setTailscale] = useState(acesso.tailscaleIp ?? '');
  const [vpn, setVpn] = useState(acesso.vpnNotes ?? '');
  const [tipo, setTipo] = useState<RemoteAccessKind | ''>(acesso.remoteAccessKind ?? '');
  const [id, setId] = useState(acesso.remoteAccessId ?? '');
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  // A mesma função que a API usa: a tela não reimplementa a regra.
  const problemaNoIp = tailscale.trim() ? tailscaleInvalido(tailscale.trim()) : null;

  return (
    <form
      className="pilha-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (problemaNoIp) return;
        setSalvando(true);

        void salvarAcessoRemoto(assetId, {
          tailscaleIp: tailscale.trim() || null,
          vpnNotes: vpn.trim() || null,
          remoteAccessKind: tipo || null,
          remoteAccessId: id.trim() || null,
          // Campo em branco **não** apaga a senha: a tela nunca a
          // mostra, e portanto não tem como reenviá-la. Para apagar há
          // o botão próprio.
          ...(senha ? { remoteAccessSecret: senha } : {}),
        })
          .then(aoSalvar)
          .catch((e2: unknown) =>
            aoErrar(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
          )
          .finally(() => setSalvando(false));
      }}
    >
      <div className="campo">
        <label className="campo-rotulo" htmlFor={`ts-${assetId}`}>
          IP do Tailscale
        </label>
        <input
          id={`ts-${assetId}`}
          className="input"
          value={tailscale}
          onChange={(e) => setTailscale(e.target.value)}
          placeholder="100.101.102.103"
        />
        {problemaNoIp ? <span className="campo-erro">{problemaNoIp}</span> : null}
      </div>

      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`tipo-${assetId}`}>
            Acesso remoto
          </label>
          <select
            id={`tipo-${assetId}`}
            className="select"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as RemoteAccessKind | '')}
          >
            <option value="">Nenhum</option>
            {REMOTE_ACCESS_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROTULO_ACESSO_REMOTO[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor={`id-${assetId}`}>
            ID
          </label>
          <input
            id={`id-${assetId}`}
            className="input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="123 456 789"
          />
        </div>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={`senha-${assetId}`}>
          Senha
        </label>
        <input
          id={`senha-${assetId}`}
          className="input"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder={acesso.temSenha ? 'Guardada. Digite para trocar.' : 'Nenhuma guardada.'}
        />
        <span className="campo-ajuda">
          Guardada cifrada. Em branco, fica a que já está lá.
          {acesso.temSenha ? (
            <>
              {' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setSalvando(true);
                  void salvarAcessoRemoto(assetId, { remoteAccessSecret: null })
                    .then(aoSalvar)
                    .catch(() => aoErrar('Não foi possível apagar a senha.'))
                    .finally(() => setSalvando(false));
                }}
              >
                Apagar a senha
              </button>
            </>
          ) : null}
        </span>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={`vpn-${assetId}`}>
          VPN
        </label>
        <textarea
          id={`vpn-${assetId}`}
          className="textarea"
          rows={2}
          value={vpn}
          onChange={(e) => setVpn(e.target.value)}
          placeholder="Qual VPN, usuário, ponta de conexão."
        />
      </div>

      <button type="submit" className="btn -primario" disabled={salvando || Boolean(problemaNoIp)}>
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
