<#
.SINOPSE
    Agente de inventário do Norty Desk. Varre a máquina e manda para a
    central de serviços.

.DESCRICAO
    Lê o hardware por CIM/WMI e envia para `POST /intake/inventario`. Não
    decide nada: quem reconhece a máquina, o que preservar e o que apagar
    é o servidor. Código que roda em duzentas máquinas de cliente não se
    corrige numa tarde — a regra que muda tem de ficar do lado que se
    testa.

    Só leitura. O agente não instala, não remove, não altera
    configuração e não abre porta nenhuma: fala de dentro para fora, por
    HTTPS, e mais nada.

.EXEMPLO
    .\NortyInventario.ps1 -Configuracao .\agente.json

.EXEMPLO
    # Mostra o que seria enviado e não envia nada. É por aqui que se
    # começa numa máquina nova.
    .\NortyInventario.ps1 -Configuracao .\agente.json -Simular
#>

[CmdletBinding()]
param(
    [string] $Configuracao = (Join-Path $PSScriptRoot 'agente.json'),
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$VERSAO_DO_AGENTE = '1.0.0'

# -------------------------------------------------------------------------
# Registro
# -------------------------------------------------------------------------

<#
    Onde o registro é escrito.

    Com reserva, e não `Join-Path $env:ProgramData` direto: em contexto
    de serviço a variável pode não existir, e `Join-Path $null` **lança**
    — no carregamento do script, antes do `try` do fim. O agente morria
    sem registro e sem código de erro, e a tarefa agendada dizia que
    tinha dado tudo certo.
#>
function CaminhoDoRegistro {
    $base = $env:ProgramData
    if (-not $base) { $base = $env:TEMP }
    if (-not $base) { $base = [IO.Path]::GetTempPath() }

    return (Join-Path $base 'NortyDesk\inventario.log')
}

$script:Log = CaminhoDoRegistro

function Escrever {
    param([string] $Texto, [string] $Nivel = 'INFO')

    $linha = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Nivel, $Texto
    Write-Host $linha

    try {
        $pasta = Split-Path $script:Log -Parent
        if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta -Force | Out-Null }

        # O registro não pode crescer para sempre numa máquina que a
        # gente não visita: acima de 1 MB, recomeça.
        if ((Test-Path $script:Log) -and (Get-Item $script:Log).Length -gt 1MB) {
            Remove-Item $script:Log -Force
        }

        Add-Content -Path $script:Log -Value $linha -Encoding UTF8
    } catch {
        # Sem poder escrever o registro, a varredura continua: o que
        # importa é o inventário chegar.
    }
}

# -------------------------------------------------------------------------
# Leitura do hardware
# -------------------------------------------------------------------------

<#
    Consulta CIM que não derruba a varredura.

    Máquina velha não responde a metade das classes, e classe ausente é
    exceção — não lista vazia. Recusar o inventário inteiro por causa de
    uma consulta deixaria de fora justamente as máquinas que mais
    interessam.
#>
function Consultar {
    param([string] $Classe, [string] $Namespace = 'root/cimv2')

    try {
        return @(Get-CimInstance -ClassName $Classe -Namespace $Namespace -ErrorAction Stop)
    } catch {
        Escrever "Não consegui ler $Classe ($($_.Exception.Message))." 'AVISO'
        return @()
    }
}

<#
    O tipo de equipamento, a partir do gabinete.

    Os códigos são os da `Win32_SystemEnclosure` (SMBIOS 7.1). O que não
    estiver na lista vira COMPUTADOR: é o palpite certo numa varredura de
    parque, e quem cadastra corrige na tela se for outra coisa.
#>
function TipoDoGabinete {
    param($Gabinete)

    if (-not $Gabinete) { return 'COMPUTADOR' }

    $tipo = Primeiro $Gabinete.ChassisTypes

    switch ($tipo) {
        8  { return 'COMPUTADOR' }  # Portátil
        9  { return 'COMPUTADOR' }  # Notebook
        10 { return 'COMPUTADOR' }  # Sub-notebook
        11 { return 'COMPUTADOR' }  # Handheld
        14 { return 'COMPUTADOR' }  # Docking station
        30 { return 'COMPUTADOR' }  # Tablet
        31 { return 'COMPUTADOR' }  # Conversível
        32 { return 'COMPUTADOR' }  # Destacável
        default { return 'COMPUTADOR' }
    }
}

<#
    A tecnologia do pente, pelo código do SMBIOS.

    Só os valores que a ficha do componente aceita. Mandar "DDR2" faria
    a API recusar a varredura inteira — e é isso mesmo que se quer
    quando o agente está desatualizado, mas não por um pente antigo que
    a gente já sabe que existe. Desconhecido: não manda o campo.
#>
function TecnologiaDaMemoria {
    param($Pente)

    $codigo = 0
    if ($Pente.PSObject.Properties['SMBIOSMemoryType']) { $codigo = [int] $Pente.SMBIOSMemoryType }

    switch ($codigo) {
        24 { return 'DDR3' }
        26 { return 'DDR4' }
        30 { return 'LPDDR4' }
        34 { return 'DDR5' }
        35 { return 'LPDDR5' }
        default { return $null }
    }
}

<#
    Tecnologia e barramento de cada disco, por número de série.

    Os dois saem de `MSFT_PhysicalDisk`, e nenhum sai da
    `Win32_DiskDrive`:

    - `MediaType` de lá diz "Fixed hard disk media" para tudo, inclusive
      para o NVMe.
    - `InterfaceType` de lá diz **"SCSI"** para praticamente todo disco
      moderno, porque SATA e NVMe chegam pela pilha SCSI do Windows. Não
      é um valor que a ficha do componente aceita, e mandá-lo faria a API
      recusar a varredura de toda máquina de verdade.

    O namespace de Storage não existe no Windows 7 e 8, e aí os dois
    campos simplesmente não vão — melhor sem o dado que com o errado.
#>
function DadosDosDiscos {
    $mapa = @{}

    foreach ($disco in (Consultar 'MSFT_PhysicalDisk' 'root/Microsoft/Windows/Storage')) {
        if (-not $disco.SerialNumber) { continue }

        $barramento = 0
        if ($disco.PSObject.Properties['BusType']) { $barramento = [int] $disco.BusType }

        $interface = switch ($barramento) {
            7  { 'USB' }
            10 { 'SAS' }
            11 { 'SATA' }
            17 { 'NVMe' }
            default { $null }
        }

        # NVMe antes do MediaType: um NVMe também se diz SSD, e o que
        # interessa saber é que ele é NVMe.
        $tecnologia = $null
        if ($barramento -eq 17) {
            $tecnologia = 'NVMe'
        } elseif ($disco.PSObject.Properties['MediaType']) {
            switch ([int] $disco.MediaType) {
                3 { $tecnologia = 'HDD' }
                4 { $tecnologia = 'SSD' }
            }
        }

        $mapa[($disco.SerialNumber).Trim()] = @{
            tecnologia = $tecnologia
            interface  = $interface
        }
    }

    return $mapa
}

<#
    O primeiro item, ou nada.

    `@(...)[0]` numa lista vazia **lança** sob `Set-StrictMode`, e é
    justamente o caso que `Consultar` existe para tolerar: classe que a
    máquina não responde volta como lista vazia, e a varredura tem de
    seguir sem ela. Sem esta função a tolerância era só aparente — o
    `catch` de lá devolvia `@()` e o `[0]` daqui derrubava tudo na linha
    seguinte.
#>
function Primeiro {
    param($Lista)

    $itens = @($Lista)
    if ($itens.Count -eq 0) { return $null }
    return $itens[0]
}

function LerMaquina {
    $sistema   = Primeiro (Consultar 'Win32_ComputerSystem')
    $produto   = Primeiro (Consultar 'Win32_ComputerSystemProduct')
    $bios      = Primeiro (Consultar 'Win32_BIOS')
    $so        = Primeiro (Consultar 'Win32_OperatingSystem')
    $gabinete  = Primeiro (Consultar 'Win32_SystemEnclosure')

    if (-not $produto -or -not $produto.UUID) {
        throw 'Sem o UUID do SMBIOS não dá para identificar a máquina. Varredura abortada.'
    }

    $doStorage = DadosDosDiscos

    $processadores = @(
        foreach ($cpu in (Consultar 'Win32_Processor')) {
            $arquitetura = $null
            if ($cpu.PSObject.Properties['AddressWidth']) {
                $arquitetura = if ([int] $cpu.AddressWidth -eq 64) { 'x86_64' } else { 'x86' }
            }

            @{
                name        = ([string] $cpu.Name).Trim()
                nucleos     = [int] $cpu.NumberOfCores
                threads     = [int] $cpu.NumberOfLogicalProcessors
                frequencia  = [int] $cpu.MaxClockSpeed
                arquitetura = $arquitetura
            }
        }
    )

    $memorias = @(
        foreach ($pente in (Consultar 'Win32_PhysicalMemory')) {
            $nome = (@($pente.Manufacturer, $pente.PartNumber) |
                     Where-Object { $_ } |
                     ForEach-Object { ([string] $_).Trim() }) -join ' '

            @{
                name         = if ($nome) { $nome } else { 'Memória' }
                serialNumber = ([string] $pente.SerialNumber).Trim()
                # Bytes para MB, como manda a ficha do componente: pente
                # de 512 MB ainda existe, e somar a frota em inteiro
                # evita o 0,5 + 0,5 que não fecha.
                capacidade   = [int] ([math]::Round([double] $pente.Capacity / 1MB))
                tecnologia   = TecnologiaDaMemoria $pente
                frequencia   = [int] $pente.Speed
                slot         = ([string] $pente.DeviceLocator).Trim()
            }
        }
    )

    $discos = @(
        foreach ($disco in (Consultar 'Win32_DiskDrive')) {
            # Só o que está preso na máquina: pendrive esquecido na USB
            # não é inventário, e apareceria e sumiria a cada varredura.
            if ($disco.PSObject.Properties['MediaType'] -and
                ([string] $disco.MediaType) -notmatch 'Fixed') { continue }

            $serie = ([string] $disco.SerialNumber).Trim()
            $extra = if ($doStorage.ContainsKey($serie)) { $doStorage[$serie] } else { @{} }

            @{
                name         = ([string] $disco.Model).Trim()
                serialNumber = $serie
                capacidade   = [int] ([math]::Round([double] $disco.Size / 1GB))
                tecnologia   = if ($extra.ContainsKey('tecnologia')) { $extra.tecnologia } else { $null }
                interface    = if ($extra.ContainsKey('interface')) { $extra.interface } else { $null }
            }
        }
    )

    return @{
        uuid          = ([string] $produto.UUID).Trim().ToLower()
        hostname      = $env:COMPUTERNAME
        serialNumber  = if ($bios) { ([string] $bios.SerialNumber).Trim() } else { $null }
        manufacturer  = if ($sistema) { ([string] $sistema.Manufacturer).Trim() } else { $null }
        model         = if ($sistema) { ([string] $sistema.Model).Trim() } else { $null }
        kind          = TipoDoGabinete $gabinete
        os            = @{
            name    = if ($so) { ([string] $so.Caption).Trim() } else { $null }
            version = if ($so) { ([string] $so.Version).Trim() } else { $null }
        }
        agente        = @{ versao = $VERSAO_DO_AGENTE }
        processadores = $processadores
        memorias      = $memorias
        discos        = $discos
    }
}

# -------------------------------------------------------------------------
# Envio
# -------------------------------------------------------------------------

function Enviar {
    param([hashtable] $Configuracao, [hashtable] $Inventario)

    # TLS 1.2 explícito: o PowerShell 5.1 ainda negocia 1.0 por padrão
    # em Windows sem o registro ajustado, e o servidor recusa. O erro
    # que aparece é "conexão encerrada", que não diz nada a quem instala.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $url  = ($Configuracao.url).TrimEnd('/') + '/intake/inventario'
    $json = $Inventario | ConvertTo-Json -Depth 6 -Compress

    $resposta = Invoke-RestMethod -Method Post -Uri $url -Body $json `
        -ContentType 'application/json; charset=utf-8' `
        -Headers @{ Authorization = "Bearer $($Configuracao.chave)" } `
        -TimeoutSec 60

    return $resposta
}

# -------------------------------------------------------------------------
# Principal
# -------------------------------------------------------------------------

try {
    if (-not (Test-Path $Configuracao)) {
        throw "Configuração não encontrada em $Configuracao. Veja o agente.exemplo.json."
    }

    $config = @{}
    (Get-Content $Configuracao -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
        ForEach-Object { $config[$_.Name] = $_.Value }

    foreach ($campo in @('url', 'chave')) {
        if (-not $config.ContainsKey($campo) -or -not $config[$campo]) {
            throw "A configuração está sem '$campo'."
        }
    }

    Escrever "Varrendo $env:COMPUTERNAME (agente $VERSAO_DO_AGENTE)."
    $inventario = LerMaquina

    Escrever ("Achei {0} processador(es), {1} pente(s) e {2} disco(s)." -f `
        $inventario.processadores.Count, $inventario.memorias.Count, $inventario.discos.Count)

    if ($Simular) {
        Escrever 'Simulação: nada foi enviado. O que iria:'
        $inventario | ConvertTo-Json -Depth 6
        exit 0
    }

    $resposta = Enviar -Configuracao $config -Inventario $inventario

    Escrever ("{0} (reconhecida por {1}). Peças: +{2} ~{3} -{4}." -f `
        $(if ($resposta.criado) { 'Máquina cadastrada' } else { 'Máquina atualizada' }),
        $resposta.reconhecidoPor,
        $resposta.componentes.criados,
        $resposta.componentes.atualizados,
        $resposta.componentes.removidos)

    exit 0
} catch {
    # A mensagem do servidor vale mais que a do PowerShell: ela vem em
    # português e diz o que fazer. "(400) Requisição Inválida" não diz.
    $detalhe = $_.Exception.Message

    try {
        $fluxo = $_.Exception.Response.GetResponseStream()
        $corpo = (New-Object IO.StreamReader($fluxo)).ReadToEnd()
        if ($corpo) { $detalhe = $corpo }
    } catch { }

    Escrever "Falhou: $detalhe" 'ERRO'
    exit 1
}
