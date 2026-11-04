# Windows (PowerShell, rode UMA vez): inicia o agent no login, escondido.
# Ajuste $dir se o projeto estiver em outra pasta.
$dir  = "$PSScriptRoot\.."
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument "src/index.js" -WorkingDirectory $dir
$trg  = New-ScheduledTaskTrigger -AtLogOn
$set  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "PCRemoteAgent" -Action $act -Trigger $trg -Settings $set -Force
# Libera a porta só na rede privada:
New-NetFirewallRule -DisplayName "PC Remote Agent" -Direction Inbound -Protocol TCP -LocalPort 8765 -Profile Private -Action Allow
Write-Host "Pronto. Reinicie ou rode: Start-ScheduledTask PCRemoteAgent"
