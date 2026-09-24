<#
.SINOPSE
    Roda o agente com um hardware de mentira e grava o JSON que ele
    produziria.

.DESCRICAO
    Serve para duas coisas, e as duas importam:

    1. **Rodar o agente fora do Windows.** `Get-CimInstance` não existe
       no Linux; aqui ele é substituído por uma função que devolve o
       que uma máquina de verdade devolveria. Isso exercita o caminho
       inteiro — tratamento de tipo, arredondamento, os campos que não
       vão quando o dado não existe.

    2. **Congelar o formato.** A saída vira a amostra que a suíte da API
       manda para `POST /intake/inventario`. Se alguém mudar o que o
       agente emite sem mudar o que a API aceita, o teste de lá quebra —
       que é o único jeito de as duas pontas não divergirem em silêncio,
       já que elas não compartilham código.

.EXEMPLO
    pwsh -File agente/teste/GerarVarredura.ps1 -Saida amostra.json
#>

[CmdletBinding()]
param(
    [string] $Saida = (Join-Path $PSScriptRoot '../../apps/api/test/amostras/varredura-windows.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
    O hardware de mentira.

    Os valores são os que uma máquina de verdade devolve, com as
    esquisitices que interessam: a série de fábrica no pente, o espaço
    sobrando no nome do processador, o `Capacity` em bytes.
#>
function Get-CimInstance {
    param(
        [string] $ClassName,
        [string] $Namespace = 'root/cimv2',
        [switch] $ErrorAction
    )

    switch ("$Namespace/$ClassName") {
        'root/cimv2/Win32_ComputerSystem' {
            return @([pscustomobject] @{ Manufacturer = 'Dell Inc.'; Model = 'Latitude 5420' })
        }
        'root/cimv2/Win32_ComputerSystemProduct' {
            return @([pscustomobject] @{ UUID = '4C4C4544-0039-5310-8052-B4C04F565431' })
        }
        'root/cimv2/Win32_BIOS' {
            return @([pscustomobject] @{ SerialNumber = '9SR0123' })
        }
        'root/cimv2/Win32_OperatingSystem' {
            return @([pscustomobject] @{ Caption = 'Microsoft Windows 11 Pro'; Version = '10.0.22631' })
        }
        'root/cimv2/Win32_SystemEnclosure' {
            return @([pscustomobject] @{ ChassisTypes = @(10) })
        }
        'root/cimv2/Win32_Processor' {
            return @([pscustomobject] @{
                Name                      = '11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz'
                NumberOfCores             = 4
                NumberOfLogicalProcessors = 8
                MaxClockSpeed             = 2400
                AddressWidth              = 64
            })
        }
        'root/cimv2/Win32_PhysicalMemory' {
            return @(
                [pscustomobject] @{
                    Manufacturer = 'Kingston'; PartNumber = 'KVR26S19S8/8 '
                    SerialNumber = 'E1A2B3C4'; Capacity = 8589934592
                    SMBIOSMemoryType = 26; Speed = 3200; DeviceLocator = 'DIMM A'
                },
                # Pente sem série de verdade: o servidor descarta o texto
                # de fábrica, e a peça passa a ser reconhecida pelo slot.
                [pscustomobject] @{
                    Manufacturer = 'Samsung'; PartNumber = 'M471A1K43DB1'
                    SerialNumber = 'To Be Filled By O.E.M.'; Capacity = 8589934592
                    SMBIOSMemoryType = 26; Speed = 3200; DeviceLocator = 'DIMM B'
                }
            )
        }
        'root/cimv2/Win32_DiskDrive' {
            return @(
                [pscustomobject] @{
                    Model = 'Samsung SSD 980 512GB'; SerialNumber = 'S64ANS0T123456'
                    Size = 512110190592; MediaType = 'Fixed hard disk media'
                    InterfaceType = 'SCSI'
                },
                # Pendrive esquecido na USB: não é inventário, e o agente
                # o descarta antes de enviar.
                [pscustomobject] @{
                    Model = 'SanDisk Cruzer'; SerialNumber = 'USB123'
                    Size = 32000000000; MediaType = 'Removable Media'
                    InterfaceType = 'USB'
                }
            )
        }
        'root/Microsoft/Windows/Storage/MSFT_PhysicalDisk' {
            return @([pscustomobject] @{
                SerialNumber = 'S64ANS0T123456'; MediaType = 4; BusType = 17
            })
        }
        default { throw "Classe não simulada: $Namespace/$ClassName" }
    }
}

$env:COMPUTERNAME = 'NB-FIN-03'

$configuracao = Join-Path ([IO.Path]::GetTempPath()) 'agente-teste.json'
@{ url = 'https://exemplo.invalido/v1'; chave = 'nd_de_mentira' } |
    ConvertTo-Json | Set-Content -Path $configuracao -Encoding UTF8

# O agente imprime o JSON no modo `-Simular`, depois das linhas de
# registro. Pegamos o objeto direto em vez de recortar a saída: o que se
# quer congelar é o que ele monta, não como ele o imprime.
$agente = Join-Path $PSScriptRoot '..\NortyInventario.ps1'
$linhas = & $agente -Configuracao $configuracao -Simular

$json = ($linhas | Where-Object { $_ -notmatch '^\d{4}-\d{2}-\d{2} \[' }) -join "`n"

$pasta = Split-Path $Saida -Parent
if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta -Force | Out-Null }

# Reserializado, para o arquivo não depender do espaçamento do
# `ConvertTo-Json` de cada versão do PowerShell.
($json | ConvertFrom-Json | ConvertTo-Json -Depth 6) |
    Set-Content -Path $Saida -Encoding UTF8

Write-Host "Amostra gravada em $Saida"
