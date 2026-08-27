import { useState } from 'react';
import type { BusinessSegment, LeadSource } from '@veyra/core';
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, useAvisos } from '../components';
import { ROTULO_ORIGEM } from '../app/rotulos';
import { useSessao } from '../app/sessao';
import { criarLead } from '../data/acoes';
import { PRODUTOS, USUARIOS } from '../data/base';

const SEGMENTOS: [BusinessSegment, string][] = [
  ['consorcio', 'Consórcio'],
  ['seguro', 'Seguro'],
  ['saude', 'Plano de saúde'],
  ['financeiro', 'Produto financeiro'],
  ['servicos', 'Serviços'],
];

const VENDEDORES = USUARIOS.filter((u) => ['vendedor', 'supervisor'].includes(u.papel));

/**
 * Novo lead
 *
 * Só quatro campos são obrigatórios: nome, telefone, origem e segmento.
 * Um formulário que exige tudo na entrada é um formulário que o vendedor
 * pula — e o lead volta para o caderno. O resto se completa depois, na
 * ficha, conforme a conversa acontece.
 */
export function FormularioLead({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { usuario, invalidar } = useSessao();
  const { avisar } = useAvisos();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [origem, setOrigem] = useState<LeadSource>('whatsapp');
  const [segmento, setSegmento] = useState<BusinessSegment>('consorcio');
  const [produtoId, setProdutoId] = useState('');
  const [valor, setValor] = useState('');
  const [responsavelId, setResponsavelId] = useState(
    VENDEDORES.some((v) => v.id === usuario.id) ? usuario.id : VENDEDORES[0].id,
  );
  const [observacoes, setObservacoes] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const produtosDoSegmento = PRODUTOS.filter((p) => p.segmento === segmento && p.ativo);

  function limpar() {
    setNome('');
    setTelefone('');
    setEmail('');
    setCidade('');
    setUf('');
    setValor('');
    setObservacoes('');
    setProdutoId('');
    setErros({});
  }

  function salvar() {
    /* A validação é local e específica: "campo obrigatório" não diz o que
       fazer, "informe ao menos DDD e número" diz. */
    const novosErros: Record<string, string> = {};
    if (nome.trim().length < 3) novosErros.nome = 'Informe o nome completo do contato.';
    if (telefone.replace(/\D/g, '').length < 10) {
      novosErros.telefone = 'Informe ao menos DDD e número, com 10 dígitos.';
    }
    if (email && !email.includes('@')) novosErros.email = 'E-mail sem “@”.';

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    const lead = criarLead({
      nome,
      telefone,
      email: email || undefined,
      cidade: cidade || undefined,
      uf: uf || undefined,
      origem,
      segmento,
      produtoId: produtoId || undefined,
      valorEstimado: valor ? Number(valor.replace(/\./g, '').replace(',', '.')) : undefined,
      responsavelId,
      observacoes: observacoes || undefined,
    });

    invalidar();
    limpar();
    aoFechar();
    avisar({
      tom: 'sucesso',
      titulo: `${lead.nome} entrou no funil`,
      texto: `Score inicial ${lead.score} · ${lead.temperatura} · distribuído para ${
        USUARIOS.find((u) => u.id === lead.responsavelId)?.nome.split(' ')[0] ?? 'a equipe'
      }.`,
    });
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura={620}
      titulo="Novo lead"
      descricao="Nome, telefone, origem e segmento bastam. O resto se completa na ficha, conforme a conversa acontece."
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar}>
            Criar lead
          </Botao>
        </>
      }
    >
      <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Campo rotulo="Nome completo *" erro={erros.nome}>
            <Entrada
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ana Beatriz Souza"
              invalido={!!erros.nome}
              autoFocus
            />
          </Campo>

          <Campo rotulo="Telefone / WhatsApp *" erro={erros.telefone}>
            <Entrada
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 98814-2203"
              invalido={!!erros.telefone}
            />
          </Campo>
        </div>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Campo rotulo="E-mail" erro={erros.email}>
            <Entrada
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana.souza@email.com.br"
              invalido={!!erros.email}
            />
          </Campo>

          <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-end' }}>
            <Campo rotulo="Cidade" className="vy-grow">
              <Entrada value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
            </Campo>
            <Campo rotulo="UF" className="">
              <Entrada
                value={uf}
                onChange={(e) => setUf(e.target.value.slice(0, 2))}
                placeholder="SP"
                style={{ width: 68 }}
                maxLength={2}
              />
            </Campo>
          </div>
        </div>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Campo rotulo="Origem *">
            <Selecao value={origem} onChange={(e) => setOrigem(e.target.value as LeadSource)}>
              {(Object.keys(ROTULO_ORIGEM) as LeadSource[]).map((chave) => (
                <option key={chave} value={chave}>
                  {ROTULO_ORIGEM[chave]}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Segmento *">
            <Selecao
              value={segmento}
              onChange={(e) => {
                setSegmento(e.target.value as BusinessSegment);
                setProdutoId('');
              }}
            >
              {SEGMENTOS.map(([chave, rotulo]) => (
                <option key={chave} value={chave}>
                  {rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Produto de interesse">
            <Selecao value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
              <option value="">Ainda não sei</option>
              {produtosDoSegmento.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>

        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Campo rotulo="Valor estimado (R$)">
            <Entrada
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="150.000"
              inputMode="decimal"
            />
          </Campo>

          <Campo rotulo="Responsável">
            <Selecao value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              {VENDEDORES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>

        <Campo rotulo="Observações">
          <AreaTexto
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="O que o cliente falou, restrição de orçamento, prazo desejado…"
          />
        </Campo>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', lineHeight: 'var(--leading-normal)' }}>
          O score inicial é calculado na criação a partir da origem, do valor e dos dados preenchidos — e recalculado a
          cada interação. Você não digita score.
        </p>
      </div>
    </Modal>
  );
}
