#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lê os relatórios HTML do Farmax (FortesReport) e cruza dívida com cadastro.

O FortesReport exporta HTML posicional: cada célula é um <div> com left/top
absolutos, sem <table>. A leitura reconstrói as linhas agrupando os divs pelo
`top` e as colunas pela faixa de `left`.

Uso:
    python3 parse_relatorios.py \
        --atraso  "contas em atraso.htm" \
        --abertas "contas abertas.htm" \
        --cadastro "Relatorio Resumido de Clientes.htm" \
        --emissao 07/09/2026 --corte 01/01/2026 --saida ./saida
"""
import argparse
import csv
import datetime as dt
import html
import os
import re
from collections import defaultdict

DIV = re.compile(
    r'<div style="position:absolute;left:(-?\d+)px;top:(-?\d+)px;[^"]*">'
    r'<font class="f\d">(.*?)</font></div>', re.S)
PAGINA = re.compile(r'<div style="position:relative;width:794px;height:1123px[^"]*">')
COD_CLIENTE = re.compile(r'\d{7}')

# Faixas de `left` que delimitam cada coluna, por relatório.
COLS_DIVIDA = [(130, 'filial'), (225, 'codigo'), (570, 'nome'), (680, 'total'), (10**9, 'dias')]
COLS_CADASTRO = [(85, 'codigo'), (315, 'nome'), (380, 'cadastro'), (450, 'telefone'),
                 (605, 'contato'), (685, 'limite'), (10**9, 'percentual')]


def linhas_do_relatorio(caminho):
    """Devolve cada linha visual do relatório como lista de (left, texto)."""
    bruto = open(caminho, 'rb').read().decode('iso-8859-1')
    for pagina in PAGINA.split(bruto)[1:]:
        agrupadas = defaultdict(list)
        for left, top, txt in DIV.findall(pagina):
            texto = html.unescape(re.sub(r'<[^>]+>', '', txt)).strip()
            if texto:
                agrupadas[int(top)].append((int(left), texto))
        for top in sorted(agrupadas):
            yield sorted(agrupadas[top])


def em_colunas(celulas, colunas):
    campos = {}
    for left, texto in celulas:
        for limite, nome in colunas:
            if left < limite:
                campos[nome] = texto
                break
    return campos


def numero(texto):
    """Converte o formato brasileiro do relatório: '2.680,00' -> 2680.0."""
    if not texto:
        return None
    try:
        return float(texto.replace('.', '').replace(',', '.'))
    except ValueError:
        return None


def data(texto):
    try:
        return dt.datetime.strptime(texto, '%d/%m/%Y').date()
    except (ValueError, TypeError):
        return None


def ler_divida(caminho):
    """Filial | Cliente | Nome | Total | Dias Atraso -> {codigo: registro}"""
    registros = {}
    for celulas in linhas_do_relatorio(caminho):
        c = em_colunas(celulas, COLS_DIVIDA)
        if not COD_CLIENTE.fullmatch(c.get('codigo', '')):
            continue
        registros[c['codigo']] = {
            'codigo': c['codigo'],
            'nome': c.get('nome', '').strip(),
            'total': numero(c.get('total')) or 0.0,
            'dias_atraso': int(numero(c.get('dias')) or 0),
        }
    return registros


def ler_cadastro(caminho):
    """Codigo | Nome | Cadastro | Telefone | Contato | Limite -> {codigo: registro}"""
    registros = {}
    for celulas in linhas_do_relatorio(caminho):
        c = em_colunas(celulas, COLS_CADASTRO)
        if not COD_CLIENTE.fullmatch(c.get('codigo', '')):
            continue
        registros[c['codigo']] = {
            'codigo': c['codigo'],
            'nome': c.get('nome', '').strip(),
            'cadastro': c.get('cadastro', ''),
            'telefone': c.get('telefone', ''),
            'contato': c.get('contato', ''),
            'limite': numero(c.get('limite')) or 0.0,
        }
    return registros


def segmentar(saldos, abertas, cadastro, emissao, corte):
    """Cruza os três relatórios num registro por cliente.

    `saldos` traz o saldo devedor e o atraso do título MAIS ANTIGO;
    `abertas` traz o título em aberto MAIS RECENTE — é ele que revela se o
    cliente ainda comprava depois da data de corte.
    """
    prescricao = emissao - dt.timedelta(days=5 * 365 + 1)  # CC art. 206 §5º I
    dias_corte = (emissao - corte).days
    linhas = []
    for codigo, saldo in saldos.items():
        venc = emissao - dt.timedelta(days=saldo['dias_atraso'])
        info = cadastro.get(codigo, {})
        recente = abertas.get(codigo)
        ativo = recente is not None and recente['dias_atraso'] <= dias_corte
        antiga = venc < corte

        if ativo and antiga:
            seg, acao = 'A', 'Cobrar agora — comprou depois do corte e deve de antes'
        elif ativo:
            seg, acao = 'B', 'Cobrança de rotina — dívida toda posterior ao corte'
        elif venc >= prescricao:
            seg, acao = 'C', 'Campanha de acordo com desconto'
        else:
            seg, acao = 'D', 'Prescrita e sem movimento — baixar, não vale cobrar'

        linhas.append({
            'segmento': seg,
            'codigo': codigo,
            'nome': info.get('nome') or saldo['nome'],
            'saldo_devedor': round(saldo['total'], 2),
            'dias_atraso': saldo['dias_atraso'],
            'venc_mais_antigo': venc.strftime('%d/%m/%Y'),
            'titulo_recente_venc': (emissao - dt.timedelta(days=recente['dias_atraso'])).strftime('%d/%m/%Y') if recente else '',
            'titulo_recente_valor': round(recente['total'], 2) if recente else '',
            'telefone': info.get('telefone', ''),
            'data_cadastro': info.get('cadastro', ''),
            'limite_credito': round(info.get('limite', 0.0), 2),
            'prescrita': 'SIM' if venc < prescricao else 'NAO',
            'acao': acao,
        })
    linhas.sort(key=lambda r: (r['segmento'], -r['saldo_devedor']))
    return linhas


def gravar_csv(caminho, linhas):
    if not linhas:
        return
    with open(caminho, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), delimiter=';')
        w.writeheader()
        w.writerows(linhas)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--atraso', required=True, help='Relatório de Clientes em Atraso (saldo total)')
    p.add_argument('--abertas', required=True, help='Relatório de Clientes em Débito (título recente)')
    p.add_argument('--cadastro', required=True, help='Relatório Resumido de Clientes')
    p.add_argument('--emissao', required=True, help='Data de emissão dos relatórios, dd/mm/aaaa')
    p.add_argument('--corte', default='01/01/2026', help='Data de corte da análise, dd/mm/aaaa')
    p.add_argument('--saida', default='./saida', help='Pasta dos CSVs gerados')
    args = p.parse_args()

    emissao, corte = data(args.emissao), data(args.corte)
    if not emissao or not corte:
        p.error('datas devem estar em dd/mm/aaaa')

    saldos = ler_divida(args.atraso)
    abertas = ler_divida(args.abertas)
    cadastro = ler_cadastro(args.cadastro)
    linhas = segmentar(saldos, abertas, cadastro, emissao, corte)

    os.makedirs(args.saida, exist_ok=True)
    gravar_csv(os.path.join(args.saida, 'devedores_segmentado.csv'), linhas)
    # Fila de migração: quem tem título em aberto posterior ao corte.
    fila = [l for l in linhas if l['segmento'] in ('A', 'B')]
    gravar_csv(os.path.join(args.saida, 'norty_farma_fila.csv'), fila)

    print(f"{len(cadastro)} clientes no cadastro | {len(saldos)} devedores | "
          f"{len(abertas)} com título em aberto")
    for seg in 'ABCD':
        g = [l for l in linhas if l['segmento'] == seg]
        print(f"  {seg}: {len(g):>3} clientes  R$ {sum(l['saldo_devedor'] for l in g):>10,.2f}")
    print(f"  TOTAL: {len(linhas)} clientes  R$ {sum(l['saldo_devedor'] for l in linhas):,.2f}")
    print(f"CSVs em {args.saida}/")


if __name__ == '__main__':
    main()
