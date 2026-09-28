# Agente de inventário — Windows

Varre o hardware da máquina e manda para a central. Cadastra o
equipamento que não existia e atualiza o que já existe, **sem tocar** no
que alguém digitou.

## O que ele lê

Identificação da máquina (UUID do SMBIOS, nome de rede, série,
fabricante, modelo), o sistema operacional, três tipos de peça
(processador, memória e disco) e as **placas de rede**: nome, MAC,
velocidade e os endereços IPv4, dizendo de cada um se veio de DHCP.

Só placa física (`Get-NetAdapter -Physical`): uma máquina comum tem
trinta adaptadores entre laço, Bluetooth, WSL, Hyper-V e VPN, e mandar
todos encheria o inventário de placa que não existe. Fora também o
`169.254.x.x`, que é a placa inventando endereço porque o DHCP não
respondeu, e o laço.

O `dhcp` de cada endereço importa do outro lado: concessão vence e vira
instantâneo, endereço fixo vira cadastro no IPAM. O agente só responde
o que o Windows diz; quem separa é o servidor.

Vale o mesmo para o **modelo** e o **sistema operacional**, e é a mesma
regra dita de outro jeito: o agente manda o texto cru. `Model` vem com o
fabricante colado na frente na HP ("HP EliteBook 840 G8 Notebook PC") e
vem como código de fábrica na Lenovo ("20XW00AABR"); `Caption` junta
produto e edição num texto só, e diz "Professionnel" na máquina
instalada em francês. Limpar isso aqui seria escrever a regra em duzentas
máquinas de cliente — que não se corrigem numa tarde. Quem limpa é o
dicionário do servidor (`docs/07-api.md`, seção 17).

## O que ele **não** faz

- Não instala, não remove, não altera configuração, não abre porta.
- Não lê arquivo, e-mail, histórico de navegação nem nada de quem usa a
  máquina.
- Não decide nada sobre o inventário: quem reconhece o equipamento, o
  que preservar e o que apagar é o servidor. É por isso que o agente
  quase não muda, e o servidor é onde estão os testes.
- Não cadastra a pessoa responsável nem gera termo: isso é decisão de
  gente, e acontece na tela depois da varredura.

## Instalação

Numa máquina, com PowerShell **como administrador**:

```powershell
.\Instalar.ps1 -Url https://chamados.norty.com.br/api/v1 -Chave nd_xxxxx
```

Isso copia o agente para `C:\Program Files\NortyDesk\Agente`, tranca a
pasta (só SYSTEM e administradores) e cria a tarefa agendada
**Norty Desk — Inventário**, que roda cinco minutos depois da subida e
uma vez por dia, com atraso aleatório para cem máquinas não chegarem
juntas.

Antes de instalar em série, vale ver o que sairia:

```powershell
.\NortyInventario.ps1 -Configuracao .\agente.json -Simular
```

## A chave

**Uma chave por empresa-cliente**, criada em Configurações → Chaves de
aplicação, com o escopo `inventario:enviar` e a empresa escolhida.

É a chave que diz de quem é o parque — o corpo da requisição não tem
como dizer outra coisa. Instalar o agente com a chave errada faz a
varredura ser recusada com `409`, e não move a máquina de carteira.

A chave fica em texto num arquivo de configuração. É o que o PowerShell
consegue ler sem depender de quem está logado, e por isso o escopo dela
é curto: quem a pegar consegue mandar inventário, e nada mais — não abre
chamado, não lê chamado, não vê pessoa nenhuma. Se vazar, revogue em
Configurações e rode o `Instalar.ps1` de novo com a chave nova.

## Registro

`C:\ProgramData\NortyDesk\inventario.log`, recomeçado a cada 1 MB.

Quando a varredura falha, a mensagem do servidor vai inteira para o
registro — ela vem em português e diz o que fazer, ao contrário do
"(400) Requisição Inválida" do PowerShell.

## Requisitos

Windows 7 ou mais novo, com PowerShell 5.1 (o que vem no Windows 10 e
11). Nada para instalar além disso.

Em Windows 7 e 8 o namespace `root/Microsoft/Windows/Storage` não
existe, e aí o agente não distingue SSD de HDD: o campo simplesmente não
vai, em vez de ir errado.

## Empacotar como `.exe`

Não é necessário — a tarefa agendada chama o `powershell.exe` direto. Se
a política da máquina exigir executável assinado, o `.ps1` pode ser
empacotado com `ps2exe` e assinado com o certificado da casa; o
comportamento é o mesmo.
