<#
.SINOPSE
    Instala o agente de inventário como tarefa agendada.

.DESCRICAO
    Copia o agente e a configuração para `C:\Program Files\NortyDesk\Agente`,
    tranca a pasta para que só administradores e o SYSTEM leiam, e cria a
    tarefa que varre a máquina.

    Precisa de PowerShell **como administrador**.

.EXEMPLO
    .\Instalar.ps1 -Url https://chamados.norty.com.br/api/v1 -Chave nd_xxx
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Url,
    [Parameter(Mandatory = $true)] [string] $Chave,
    [string] $Destino = (Join-Path $env:ProgramFiles 'NortyDesk\Agente'),
    [string] $Hora = '12:00'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$souAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $souAdmin) {
    throw 'Rode este script num PowerShell aberto como administrador.'
}

New-Item -ItemType Directory -Path $Destino -Force | Out-Null

Copy-Item (Join-Path $PSScriptRoot 'NortyInventario.ps1') $Destino -Force

@{ url = $Url; chave = $Chave } |
    ConvertTo-Json |
    Set-Content -Path (Join-Path $Destino 'agente.json') -Encoding UTF8

# A chave fica em texto no disco — é o que o PowerShell consegue ler sem
# depender de quem está logado. O que dá para fazer é tirar todo mundo
# que não precisa dela: herança desligada, e só SYSTEM e administradores.
#
# A consequência prática: **a chave é por empresa, e o escopo dela é só
# `inventario:enviar`**. Quem a pegar consegue mandar inventário, e nada
# mais — não abre chamado, não lê chamado, não vê ninguém.
$acl = Get-Acl $Destino
$acl.SetAccessRuleProtection($true, $false)
$acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }

foreach ($quem in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        $quem, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}

Set-Acl -Path $Destino -AclObject $acl

# Duas disparadas: na subida e uma vez por dia.
#
# Só na subida deixaria de fora a máquina que ninguém desliga; só diária
# deixaria de fora o notebook que fica desligado no horário. `RandomDelay`
# porque cem máquinas subindo juntas de manhã não podem chegar juntas.
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Configuracao "{1}"' -f
    (Join-Path $Destino 'NortyInventario.ps1'), (Join-Path $Destino 'agente.json'))

$naSubida = New-ScheduledTaskTrigger -AtStartup
$naSubida.Delay = 'PT5M'

$diaria = New-ScheduledTaskTrigger -Daily -At $Hora
$diaria.RandomDelay = 'PT30M'

$comoSystem = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -RunLevel Highest

$config = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName 'Norty Desk — Inventário' `
    -Description 'Varre o hardware desta máquina e envia para a central de serviços da Norty.' `
    -Action $acao -Trigger @($naSubida, $diaria) -Principal $comoSystem -Settings $config -Force |
    Out-Null

Write-Host 'Agente instalado. Varrendo agora para conferir…'

& (Join-Path $Destino 'NortyInventario.ps1') -Configuracao (Join-Path $Destino 'agente.json')
