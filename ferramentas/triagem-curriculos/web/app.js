/**
 * Interface da triagem.
 *
 * O servidor faz a leitura e a pontuação; aqui ficam o formulário da vaga, a
 * fila de envio, os filtros e a montagem do link de WhatsApp. O texto extraído
 * de cada currículo vive só nesta aba — ao fechar, nada sobra.
 */

const EXTENSOES = ['.pdf', '.docx', '.txt', '.rtf', '.md', '.doc'];
const ARQUIVOS_POR_LOTE = 6;
const CURRICULOS_POR_VEZ_NA_IA = 3;

const estado = {
  slug: null,
  vaga: null,
  vagaEmBranco: null,
  resultados: [],
  iaConfigurada: false,
  analisando: false,
};

const $ = (id) => document.getElementById(id);

const el = {
  estadoIa: $('estado-ia'),
  seletorVaga: $('seletor-vaga'),
  novaVaga: $('nova-vaga'),
  tituloVaga: $('titulo-vaga'),
  descricaoVaga: $('descricao-vaga'),
  listaCriterios: $('lista-criterios'),
  novoCriterio: $('novo-criterio'),
  anosMinimos: $('anos-minimos'),
  pesoExperiencia: $('peso-experiencia'),
  mensagemWhatsapp: $('mensagem-whatsapp'),
  salvarVaga: $('salvar-vaga'),
  excluirVaga: $('excluir-vaga'),
  avisoVaga: $('aviso-vaga'),
  areaSolta: $('area-solta'),
  entradaArquivos: $('entrada-arquivos'),
  entradaPasta: $('entrada-pasta'),
  escolherArquivos: $('escolher-arquivos'),
  escolherPasta: $('escolher-pasta'),
  progresso: $('progresso'),
  progressoPreenchido: $('progresso-preenchido'),
  progressoTexto: $('progresso-texto'),
  barraFiltros: $('barra-filtros'),
  busca: $('busca'),
  notaMinima: $('nota-minima'),
  valorNota: $('valor-nota'),
  soAptos: $('so-aptos'),
  esconderConvidados: $('esconder-convidados'),
  ordenacao: $('ordenacao'),
  resumoLista: $('resumo-lista'),
  analisarIa: $('analisar-ia'),
  exportarCsv: $('exportar-csv'),
  limpar: $('limpar'),
  resultados: $('resultados'),
  vazio: $('vazio'),
};

/* ---------------------------------------------------------------- utilidades */

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(rota, {
    headers: { 'content-type': 'application/json' },
    ...opcoes,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `Falha na requisição (${resposta.status}).`);
  return dados;
}

/** Base64 a partir de bytes, em pedaços, para não estourar a pilha. */
function bytesParaBase64(bytes) {
  const pedaco = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += pedaco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + pedaco));
  }
  return btoa(binario);
}

async function paraBase64(arquivo) {
  return bytesParaBase64(new Uint8Array(await arquivo.arrayBuffer()));
}

const textoParaBase64 = (texto) => bytesParaBase64(new TextEncoder().encode(texto));

/* ------------------------------------------------------------- convite feito */

function chaveDoConvite(resultado) {
  const identidade = resultado.contato?.telefone?.digitos || resultado.arquivo;
  return `triagem:convidado:${estado.slug ?? 'sem-vaga'}:${identidade}`;
}

const foiConvidado = (r) => localStorage.getItem(chaveDoConvite(r)) !== null;

function marcarConvite(resultado, convidado) {
  if (convidado) localStorage.setItem(chaveDoConvite(resultado), new Date().toISOString());
  else localStorage.removeItem(chaveDoConvite(resultado));
}

/* ------------------------------------------------------------------- a vaga */

function linhaDeCriterio(criterio = { termo: '', sinonimos: [], peso: 3, obrigatorio: false }) {
  const linha = document.createElement('div');
  linha.className = 'criterio';
  linha.innerHTML = `
    <input type="text" class="criterio__termo" value="${esc(criterio.termo)}" placeholder="Excel" />
    <input type="text" class="criterio__sinonimos" value="${esc((criterio.sinonimos ?? []).join(', '))}" placeholder="planilha, PROCV" />
    <input type="number" class="criterio__peso" min="1" max="10" value="${Number(criterio.peso) || 3}" />
    <span class="criterio__obrigatorio">
      <input type="checkbox" class="criterio__obr" ${criterio.obrigatorio ? 'checked' : ''} title="Obrigatório" />
    </span>
    <button type="button" class="criterio__remover" title="Remover critério">&times;</button>`;
  linha.querySelector('.criterio__remover').addEventListener('click', () => linha.remove());
  return linha;
}

function mostrarVaga(vaga) {
  estado.vaga = vaga;
  el.tituloVaga.value = vaga.titulo ?? '';
  el.descricaoVaga.value = vaga.descricao ?? '';
  el.anosMinimos.value = vaga.experiencia?.anosMinimos ?? 0;
  el.pesoExperiencia.value = vaga.experiencia?.peso ?? 5;
  el.mensagemWhatsapp.value = vaga.mensagemWhatsapp ?? '';
  el.listaCriterios.replaceChildren(
    ...(vaga.criterios?.length ? vaga.criterios : [undefined]).map((c) => linhaDeCriterio(c)),
  );
}

/** Lê o formulário e devolve a vaga como o servidor espera recebê-la. */
function lerVagaDoFormulario() {
  const criterios = [...el.listaCriterios.querySelectorAll('.criterio')]
    .map((linha) => ({
      termo: linha.querySelector('.criterio__termo').value.trim(),
      sinonimos: linha
        .querySelector('.criterio__sinonimos')
        .value.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      peso: Number(linha.querySelector('.criterio__peso').value) || 1,
      obrigatorio: linha.querySelector('.criterio__obr').checked,
    }))
    .filter((c) => c.termo);

  return {
    titulo: el.tituloVaga.value.trim() || 'Vaga sem título',
    descricao: el.descricaoVaga.value.trim(),
    criterios,
    experiencia: {
      anosMinimos: Number(el.anosMinimos.value) || 0,
      peso: Number(el.pesoExperiencia.value) || 5,
    },
    mensagemWhatsapp: el.mensagemWhatsapp.value.trim(),
  };
}

function avisar(texto, erro = false) {
  el.avisoVaga.textContent = texto;
  el.avisoVaga.dataset.erro = erro ? '1' : '0';
  if (texto) setTimeout(() => { el.avisoVaga.textContent = ''; }, 4000);
}

async function carregarEstado(slugPreferido) {
  const dados = await pedir('/api/estado');
  estado.iaConfigurada = dados.iaConfigurada;
  estado.vagaEmBranco = dados.vagaEmBranco;

  el.estadoIa.textContent = dados.mensagemIa;
  el.estadoIa.className = `etiqueta ${dados.iaConfigurada ? 'etiqueta--ok' : 'etiqueta--neutra'}`;
  el.analisarIa.disabled = !dados.iaConfigurada;
  el.analisarIa.title = dados.iaConfigurada
    ? 'Lê os currículos visíveis com a IA e traz um parecer'
    : `${dados.mensagemIa} — a triagem por critérios não depende disso`;

  el.seletorVaga.replaceChildren(
    ...dados.vagas.map((v) => new Option(v.titulo, v.slug)),
    new Option('— vaga nova (não salva) —', ''),
  );

  const alvo = slugPreferido ?? dados.vagas[0]?.slug ?? '';
  el.seletorVaga.value = alvo;
  estado.slug = alvo || null;
  mostrarVaga(alvo ? await pedir(`/api/vagas/${alvo}`) : dados.vagaEmBranco);
}

/* ------------------------------------------------------------ envio e leitura */

function mostrarProgresso(feitos, total, rotulo) {
  el.progresso.hidden = false;
  el.progressoPreenchido.style.width = `${total ? (feitos / total) * 100 : 0}%`;
  el.progressoTexto.textContent = `${rotulo} ${feitos}/${total}`;
}

async function analisarArquivos(arquivos) {
  const aceitos = [...arquivos].filter((a) =>
    EXTENSOES.some((ext) => a.name.toLowerCase().endsWith(ext)),
  );
  if (!aceitos.length) {
    avisar('Nenhum arquivo com extensão suportada (PDF, DOCX, TXT, RTF).', true);
    return;
  }

  estado.analisando = true;
  const vaga = lerVagaDoFormulario();
  let feitos = 0;
  mostrarProgresso(0, aceitos.length, 'Lendo');

  for (let i = 0; i < aceitos.length; i += ARQUIVOS_POR_LOTE) {
    const lote = aceitos.slice(i, i + ARQUIVOS_POR_LOTE);
    const carga = await Promise.all(
      lote.map(async (arquivo) => ({
        nome: arquivo.name,
        conteudoBase64: await paraBase64(arquivo),
      })),
    );

    try {
      const { resultados } = await pedir('/api/analisar', {
        method: 'POST',
        body: JSON.stringify({ vaga, arquivos: carga }),
      });
      // Reenvio do mesmo arquivo substitui o resultado antigo em vez de duplicar.
      for (const resultado of resultados) {
        const existente = estado.resultados.findIndex((r) => r.arquivo === resultado.arquivo);
        if (existente >= 0) estado.resultados[existente] = resultado;
        else estado.resultados.push(resultado);
      }
    } catch (erro) {
      for (const arquivo of lote) {
        estado.resultados.push({ arquivo: arquivo.name, erro: erro.message });
      }
    }

    feitos += lote.length;
    mostrarProgresso(feitos, aceitos.length, 'Lendo');
    renderizar();
  }

  estado.analisando = false;
  el.progresso.hidden = true;
  renderizar();
}

/** Repontua o que já está na tela quando a vaga muda — sem reler os arquivos. */
async function repontuar() {
  const comTexto = estado.resultados.filter((r) => r.texto);
  if (!comTexto.length) return;

  const vaga = lerVagaDoFormulario();
  const { resultados } = await pedir('/api/analisar', {
    method: 'POST',
    body: JSON.stringify({
      vaga,
      // O texto já foi extraído: reenviamos como .txt para pular a leitura do PDF.
      arquivos: comTexto.map((r) => ({
        nome: `${r.arquivo}.txt`,
        conteudoBase64: textoParaBase64(r.texto),
      })),
    }),
  });

  resultados.forEach((novo, indice) => {
    const antigo = comTexto[indice];
    Object.assign(antigo, novo, {
      arquivo: antigo.arquivo,
      contato: antigo.contato,
      ia: antigo.ia,
    });
  });
  renderizar();
}

/* --------------------------------------------------------------------- IA */

async function analisarUmComIa(resultado) {
  if (!resultado.texto || resultado.ia?.carregando) return;
  resultado.ia = { carregando: true };
  renderizar();

  try {
    const resposta = await pedir('/api/ia', {
      method: 'POST',
      body: JSON.stringify({
        vaga: lerVagaDoFormulario(),
        texto: resultado.texto,
        nome: resultado.contato?.nome,
      }),
    });
    resultado.ia = { analise: resposta.analise, provedor: resposta.provedor, modelo: resposta.modelo };
  } catch (erro) {
    resultado.ia = { erro: erro.message };
  }
  renderizar();
}

async function analisarVisiveisComIa() {
  const fila = visiveis().filter((r) => r.texto && !r.ia?.analise);
  if (!fila.length) return;

  const total = fila.length;
  el.analisarIa.disabled = true;
  let feitos = 0;
  mostrarProgresso(0, total, 'Analisando com IA');

  const trabalhador = async () => {
    while (fila.length) {
      await analisarUmComIa(fila.shift());
      feitos += 1;
      mostrarProgresso(feitos, total, 'Analisando com IA');
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CURRICULOS_POR_VEZ_NA_IA, fila.length) }, trabalhador),
  );

  el.progresso.hidden = true;
  el.analisarIa.disabled = !estado.iaConfigurada;
  renderizar();
}

/* --------------------------------------------------------------- WhatsApp */

function montarConvite(resultado) {
  const modelo = el.mensagemWhatsapp.value || '';
  const nome = resultado.contato?.nome ?? '';
  return modelo
    .replaceAll('{primeiroNome}', resultado.contato?.primeiroNome ?? nome)
    .replaceAll('{nome}', nome)
    .replaceAll('{vaga}', el.tituloVaga.value || 'nossa vaga');
}

function linkDoWhatsapp(resultado) {
  const digitos = resultado.contato?.telefone?.digitos;
  if (!digitos) return null;
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(montarConvite(resultado))}`;
}

/* -------------------------------------------------------------- filtragem */

function visiveis() {
  const busca = el.busca.value.trim().toLowerCase();
  const notaMinima = Number(el.notaMinima.value);

  const filtrados = estado.resultados.filter((r) => {
    if (r.erro) return !busca || r.arquivo.toLowerCase().includes(busca);
    if ((r.nota ?? 0) < notaMinima) return false;
    if (el.soAptos.checked && !r.atendeObrigatorios) return false;
    if (el.esconderConvidados.checked && foiConvidado(r)) return false;
    if (!busca) return true;
    const alvo = [
      r.contato?.nome,
      r.arquivo,
      r.contato?.email,
      ...(r.criterios ?? []).filter((c) => c.encontrado).map((c) => c.termo),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return alvo.includes(busca);
  });

  const ordem = el.ordenacao.value;
  return filtrados.sort((a, b) => {
    if (a.erro !== b.erro) return a.erro ? 1 : -1;
    if (ordem === 'nome') {
      return (a.contato?.nome ?? a.arquivo).localeCompare(b.contato?.nome ?? b.arquivo, 'pt-BR');
    }
    if (ordem === 'experiencia') {
      return (b.experiencia?.anosEstimados ?? 0) - (a.experiencia?.anosEstimados ?? 0);
    }
    // Empate na nota: quem atende os obrigatórios aparece primeiro.
    if ((b.nota ?? 0) !== (a.nota ?? 0)) return (b.nota ?? 0) - (a.nota ?? 0);
    return Number(b.atendeObrigatorios ?? 0) - Number(a.atendeObrigatorios ?? 0);
  });
}

/* -------------------------------------------------------------- desenho */

const ROTULOS = {
  forte: 'Forte',
  medio: 'Talvez',
  fraco: 'Fraco',
  reprovado: 'Não atende',
};

function desenharCandidato(resultado) {
  const cartao = document.createElement('article');
  const convidado = !resultado.erro && foiConvidado(resultado);

  if (resultado.erro) {
    cartao.className = 'candidato candidato--erro';
    cartao.innerHTML = `
      <div class="candidato__linha">
        <div class="nota nota--erro">!</div>
        <div class="candidato__corpo">
          <div class="candidato__cabecalho">
            <span class="candidato__nome">${esc(resultado.arquivo)}</span>
            <span class="etiqueta etiqueta--erro">não lido</span>
          </div>
          <p class="ajuda">${esc(resultado.erro)}</p>
        </div>
      </div>`;
    return cartao;
  }

  const status = resultado.status;
  cartao.className = `candidato candidato--${status}${convidado ? ' candidato--convidado' : ''}`;

  const contato = resultado.contato ?? {};
  const link = linkDoWhatsapp(resultado);
  const anos = resultado.experiencia;

  const marcas = (resultado.criterios ?? [])
    .map((c) => {
      const classe = c.encontrado
        ? 'marca marca--tem'
        : c.obrigatorio
          ? 'marca marca--falta-obrigatorio'
          : 'marca';
      const prefixo = c.encontrado ? '✓ ' : c.obrigatorio ? '✕ ' : '';
      return `<span class="${classe}" title="peso ${c.peso}${c.obrigatorio ? ' · obrigatório' : ''}">${prefixo}${esc(c.termo)}</span>`;
    })
    .join('');

  cartao.innerHTML = `
    <div class="candidato__linha">
      <div class="nota nota--${status}">${resultado.nota}</div>
      <div class="candidato__corpo">
        <div class="candidato__cabecalho">
          <span class="candidato__nome">${esc(contato.nome ?? 'Nome não identificado')}</span>
          <span class="etiqueta etiqueta--${status}">${ROTULOS[status]}</span>
          ${convidado ? '<span class="etiqueta etiqueta--convidado">convidado</span>' : ''}
          ${contato.origemDoNome === 'arquivo' ? '<span class="ajuda">(nome vindo do arquivo)</span>' : ''}
        </div>
        <div class="candidato__contato">
          ${contato.telefone ? `<span>📱 ${esc(contato.telefone.formatado)}</span>` : '<span>📱 sem telefone no currículo</span>'}
          ${contato.email ? `<span>✉️ <a href="mailto:${esc(contato.email)}">${esc(contato.email)}</a></span>` : ''}
          ${contato.linkedin ? `<span>🔗 <a href="${esc(contato.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a></span>` : ''}
          ${anos ? `<span>⏱ ${anos.anosEstimados} ano(s)${anos.atende ? '' : ` · pede ${anos.anosMinimos}`}</span>` : ''}
        </div>
        <div class="marcas">${marcas}</div>
        <div class="candidato__acoes">
          ${
            link
              ? `<a class="botao botao--whatsapp" href="${esc(link)}" target="_blank" rel="noreferrer" data-convidar="1">Convidar no WhatsApp</a>`
              : '<span class="ajuda">Sem número para convidar — confira o texto extraído.</span>'
          }
          <button type="button" class="botao botao--fantasma" data-acao="detalhe">Detalhes</button>
          ${estado.iaConfigurada && !resultado.ia?.analise ? '<button type="button" class="botao botao--fantasma" data-acao="ia">Analisar com IA</button>' : ''}
          <label class="alternador"><input type="checkbox" data-acao="convidado" ${convidado ? 'checked' : ''} /><span>já convidei</span></label>
        </div>
        <div class="detalhe" hidden></div>
      </div>
    </div>`;

  const detalhe = cartao.querySelector('.detalhe');
  const preencherDetalhe = () => {
    const encontrados = (resultado.criterios ?? []).filter((c) => c.encontrado);
    const faltando = (resultado.criterios ?? []).filter((c) => !c.encontrado);
    const ia = resultado.ia;

    detalhe.innerHTML = `
      ${
        ia?.carregando
          ? '<p class="ajuda">Consultando a IA…</p>'
          : ia?.erro
            ? `<p class="ajuda" style="color:var(--danger)">IA: ${esc(ia.erro)}</p>`
            : ia?.analise
              ? `<div class="ia">
                   <div class="ia__topo"><strong>Leitura da IA${ia.provedor ? ` · ${esc(ia.provedor)}` : ''}</strong>
                     <span class="ia__nota">${ia.analise.nota}/100 · ${esc(ROTULOS[ia.analise.veredito] ?? ia.analise.veredito)}</span>
                   </div>
                   <p>${esc(ia.analise.resumo)}</p>
                   ${ia.analise.pontosFortes?.length ? `<h4>Pontos fortes</h4><ul>${ia.analise.pontosFortes.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
                   ${ia.analise.pontosDeAtencao?.length ? `<h4>Pontos de atenção</h4><ul>${ia.analise.pontosDeAtencao.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
                   ${ia.analise.perguntasParaEntrevista?.length ? `<h4>Perguntar na entrevista</h4><ul>${ia.analise.perguntasParaEntrevista.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
                 </div>`
              : ''
      }
      ${
        encontrados.length
          ? `<h4>Onde apareceu</h4><ul>${encontrados
              .map(
                (c) =>
                  `<li><strong>${esc(c.termo)}</strong> (${c.ocorrencias}×)<br /><span class="evidencia">${esc(c.evidencia ?? '')}</span></li>`,
              )
              .join('')}</ul>`
          : ''
      }
      ${faltando.length ? `<h4>Não encontrado</h4><ul>${faltando.map((c) => `<li>${esc(c.termo)}${c.obrigatorio ? ' <strong>(obrigatório)</strong>' : ''}</li>`).join('')}</ul>` : ''}
      ${
        anos
          ? `<h4>Experiência</h4><p>${anos.detectado ? `Cerca de ${anos.anosEstimados} ano(s), somando os períodos descritos.` : 'Nenhum período datado foi encontrado no currículo — a nota de experiência ficou zerada. Vale conferir no texto abaixo.'}</p>`
          : ''
      }
      <h4>Texto extraído${resultado.paginas ? ` (${resultado.paginas} pág.)` : ''}</h4>
      <div class="texto-bruto">${esc(resultado.texto ?? '')}</div>`;
  };

  cartao.querySelector('[data-acao="detalhe"]').addEventListener('click', (evento) => {
    detalhe.hidden = !detalhe.hidden;
    evento.currentTarget.textContent = detalhe.hidden ? 'Detalhes' : 'Fechar';
    if (!detalhe.hidden) preencherDetalhe();
  });

  cartao.querySelector('[data-acao="ia"]')?.addEventListener('click', () => {
    detalhe.hidden = false;
    analisarUmComIa(resultado);
  });

  cartao.querySelector('[data-acao="convidado"]').addEventListener('change', (evento) => {
    marcarConvite(resultado, evento.currentTarget.checked);
    renderizar();
  });

  // Clicar em "Convidar" já deixa o candidato marcado: a lista fica sendo o
  // registro de quem foi chamado, sem exigir um segundo clique.
  cartao.querySelector('[data-convidar]')?.addEventListener('click', () => {
    marcarConvite(resultado, true);
    setTimeout(renderizar, 400);
  });

  if (resultado.ia?.carregando || resultado.ia?.analise || resultado.ia?.erro) {
    detalhe.hidden = false;
    cartao.querySelector('[data-acao="detalhe"]').textContent = 'Fechar';
    preencherDetalhe();
  }

  return cartao;
}

function renderizar() {
  const lista = visiveis();
  const temResultados = estado.resultados.length > 0;

  el.barraFiltros.hidden = !temResultados;
  el.vazio.hidden = temResultados;
  el.resultados.replaceChildren(...lista.map(desenharCandidato));
  el.valorNota.textContent = el.notaMinima.value;

  const aptos = estado.resultados.filter((r) => !r.erro && r.atendeObrigatorios).length;
  const convidados = estado.resultados.filter((r) => !r.erro && foiConvidado(r)).length;
  el.resumoLista.textContent = temResultados
    ? `${lista.length} de ${estado.resultados.length} currículos · ${aptos} atendem os obrigatórios · ${convidados} convidados`
    : '';
}

/* ------------------------------------------------------------------- CSV */

function exportarCsv() {
  const linhas = [
    ['Nome', 'Telefone', 'E-mail', 'Nota', 'Situação', 'Experiência (anos)', 'Falta obrigatório', 'Convidado', 'Arquivo'],
    ...visiveis().map((r) => [
      r.contato?.nome ?? '',
      r.contato?.telefone?.formatado ?? '',
      r.contato?.email ?? '',
      r.erro ? '' : r.nota,
      r.erro ? `erro: ${r.erro}` : ROTULOS[r.status],
      r.experiencia?.anosEstimados ?? '',
      (r.faltandoObrigatorios ?? []).join(' | '),
      !r.erro && foiConvidado(r) ? 'sim' : 'não',
      r.arquivo,
    ]),
  ];

  const csv = linhas
    .map((linha) => linha.map((celula) => `"${String(celula).replaceAll('"', '""')}"`).join(';'))
    .join('\n');

  // BOM na frente para o Excel abrir os acentos corretamente.
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const ancora = document.createElement('a');
  ancora.href = url;
  ancora.download = `triagem-${estado.slug ?? 'vaga'}.csv`;
  ancora.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------- eventos */

el.escolherArquivos.addEventListener('click', () => el.entradaArquivos.click());
el.escolherPasta.addEventListener('click', () => el.entradaPasta.click());
for (const entrada of [el.entradaArquivos, el.entradaPasta]) {
  entrada.addEventListener('change', (evento) => {
    analisarArquivos(evento.target.files);
    evento.target.value = '';
  });
}

for (const evento of ['dragenter', 'dragover']) {
  el.areaSolta.addEventListener(evento, (e) => {
    e.preventDefault();
    el.areaSolta.classList.add('solta--ativa');
  });
}
for (const evento of ['dragleave', 'drop']) {
  el.areaSolta.addEventListener(evento, (e) => {
    e.preventDefault();
    el.areaSolta.classList.remove('solta--ativa');
  });
}
el.areaSolta.addEventListener('drop', (e) => analisarArquivos(e.dataTransfer.files));

el.seletorVaga.addEventListener('change', async () => {
  estado.slug = el.seletorVaga.value || null;
  mostrarVaga(estado.slug ? await pedir(`/api/vagas/${estado.slug}`) : estado.vagaEmBranco);
  await repontuar();
});

el.novaVaga.addEventListener('click', () => {
  estado.slug = null;
  el.seletorVaga.value = '';
  mostrarVaga(estado.vagaEmBranco);
});

el.novoCriterio.addEventListener('click', () => {
  const linha = linhaDeCriterio();
  el.listaCriterios.append(linha);
  linha.querySelector('.criterio__termo').focus();
});

el.salvarVaga.addEventListener('click', async () => {
  try {
    const { slug } = await pedir('/api/vagas', {
      method: 'POST',
      body: JSON.stringify({ slug: estado.slug, vaga: lerVagaDoFormulario() }),
    });
    await carregarEstado(slug);
    await repontuar();
    avisar('Vaga salva.');
  } catch (erro) {
    avisar(erro.message, true);
  }
});

el.excluirVaga.addEventListener('click', async () => {
  if (!estado.slug) return avisar('Esta vaga ainda não foi salva.', true);
  if (!confirm(`Excluir a vaga "${el.tituloVaga.value}"? Os currículos analisados continuam na tela.`)) return;
  await pedir(`/api/vagas/${estado.slug}`, { method: 'DELETE' });
  estado.slug = null;
  await carregarEstado();
  avisar('Vaga excluída.');
});

// Mexer nos critérios muda a nota de todo mundo: repontua ao sair do campo.
el.listaCriterios.addEventListener('change', repontuar);
el.anosMinimos.addEventListener('change', repontuar);
el.pesoExperiencia.addEventListener('change', repontuar);

for (const controle of [el.busca, el.notaMinima, el.soAptos, el.esconderConvidados, el.ordenacao]) {
  controle.addEventListener('input', renderizar);
}

el.analisarIa.addEventListener('click', analisarVisiveisComIa);
el.exportarCsv.addEventListener('click', exportarCsv);
el.limpar.addEventListener('click', () => {
  if (!confirm('Limpar os currículos analisados desta sessão?')) return;
  estado.resultados = [];
  renderizar();
});

carregarEstado().then(renderizar).catch((erro) => avisar(erro.message, true));
