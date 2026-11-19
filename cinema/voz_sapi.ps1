# Voz nativa do Windows (System.Speech, já vem no sistema): nada para instalar.
# Uso (PowerShell):  .\cinema\voz_sapi.ps1 -Texto "Você sabia que o Alasca custou menos que o Neymar?" -Saida data\voz.wav [-Rate 1] [-Voz "Maria"]
# Lista as vozes pt-BR instaladas no seu Windows:  .\cinema\voz_sapi.ps1 -Listar
# NÃO testado: eu não tenho Windows. A qualidade depende das vozes que o seu sistema já tem.
param([string]$Texto = "", [string]$Saida = "data\voz.wav", [int]$Rate = 1, [string]$Voz = "", [switch]$Listar)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Listar) { $s.GetInstalledVoices() | ForEach-Object { $i = $_.VoiceInfo; "{0}  [{1}]  {2}" -f $i.Name, $i.Culture, $i.Gender }; return }
$pt = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq "pt-BR" -and $_.Enabled }
if ($Voz) { $pt = $pt | Where-Object { $_.VoiceInfo.Name -like "*$Voz*" } }
if (-not $pt) { Write-Host "Nenhuma voz pt-BR instalada/habilitada: gere o vídeo só com legenda e trilha (sem voz)."; exit 2 }
$s.SelectVoice(($pt | Select-Object -First 1).VoiceInfo.Name); $s.Rate = $Rate; $s.Volume = 100
$pb = New-Object System.Speech.Synthesis.PromptBuilder; $pb.Culture = [Globalization.CultureInfo]"pt-BR"
foreach ($f in [regex]::Split($Texto, "(?<=[\.\?\!:;,])\s+")) {          # pausas naturais na pontuação
    if (-not $f.Trim()) { continue }; $pb.AppendText($f)
    if ($f -match "[\.\?\!]$") { $pb.AppendBreak([TimeSpan]::FromMilliseconds(320)) } elseif ($f -match "[:;]$") { $pb.AppendBreak([TimeSpan]::FromMilliseconds(220)) } else { $pb.AppendBreak([TimeSpan]::FromMilliseconds(130)) } }
New-Item -ItemType Directory -Force -Path (Split-Path $Saida) | Out-Null
$s.SetOutputToWaveFile($Saida); $s.Speak($pb); $s.Dispose(); Write-Host "ok $Saida"
