/**
 * Persistência das vagas em arquivos JSON dentro de `vagas/`.
 * Um arquivo por vaga, legível e versionável à mão.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Reduz o título a um nome de arquivo seguro (sem acento, sem separador). */
export function paraSlug(texto) {
  const slug = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'vaga';
}

/** Impede que um slug vindo da requisição escape do diretório de vagas. */
function caminhoDaVaga(diretorio, slug) {
  const seguro = paraSlug(slug);
  return { slug: seguro, caminho: path.join(diretorio, `${seguro}.json`) };
}

export function vagaEmBranco() {
  return {
    titulo: 'Nova vaga',
    descricao: '',
    criterios: [{ termo: '', sinonimos: [], peso: 3, obrigatorio: false }],
    experiencia: { anosMinimos: 0, peso: 5 },
    mensagemWhatsapp:
      'Olá {primeiroNome}, tudo bem? Recebemos seu currículo para a vaga de {vaga} e gostaríamos de convidar você para uma entrevista. Qual o melhor dia e horário para conversarmos?',
  };
}

/** Normaliza o que veio do formulário: campo faltando não pode virar `NaN`. */
export function sanearVaga(bruta) {
  const criterios = Array.isArray(bruta.criterios) ? bruta.criterios : [];
  return {
    titulo: String(bruta.titulo ?? '').trim() || 'Vaga sem título',
    descricao: String(bruta.descricao ?? '').trim(),
    criterios: criterios
      .map((c) => ({
        termo: String(c.termo ?? '').trim(),
        sinonimos: (Array.isArray(c.sinonimos) ? c.sinonimos : [])
          .map((s) => String(s).trim())
          .filter(Boolean),
        peso: Math.max(1, Math.min(10, Number(c.peso) || 1)),
        obrigatorio: Boolean(c.obrigatorio),
      }))
      .filter((c) => c.termo),
    experiencia: {
      anosMinimos: Math.max(0, Math.min(40, Number(bruta.experiencia?.anosMinimos) || 0)),
      peso: Math.max(1, Math.min(20, Number(bruta.experiencia?.peso) || 5)),
    },
    mensagemWhatsapp: String(bruta.mensagemWhatsapp ?? '').trim() || vagaEmBranco().mensagemWhatsapp,
  };
}

export async function listarVagas(diretorio) {
  await fs.mkdir(diretorio, { recursive: true });
  const arquivos = (await fs.readdir(diretorio)).filter((a) => a.endsWith('.json'));
  const vagas = [];
  for (const arquivo of arquivos) {
    try {
      const conteudo = JSON.parse(await fs.readFile(path.join(diretorio, arquivo), 'utf8'));
      vagas.push({ slug: arquivo.replace(/\.json$/, ''), titulo: conteudo.titulo ?? arquivo });
    } catch {
      // Arquivo inválido não pode esconder as vagas boas da lista.
    }
  }
  return vagas.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

export async function lerVaga(diretorio, slug) {
  const { caminho } = caminhoDaVaga(diretorio, slug);
  return sanearVaga(JSON.parse(await fs.readFile(caminho, 'utf8')));
}

export async function salvarVaga(diretorio, slug, bruta) {
  await fs.mkdir(diretorio, { recursive: true });
  const vaga = sanearVaga(bruta);
  const { slug: seguro, caminho } = caminhoDaVaga(diretorio, slug || vaga.titulo);
  await fs.writeFile(caminho, `${JSON.stringify(vaga, null, 2)}\n`, 'utf8');
  return { slug: seguro, vaga };
}

export async function apagarVaga(diretorio, slug) {
  const { caminho } = caminhoDaVaga(diretorio, slug);
  await fs.rm(caminho, { force: true });
}
