# installer-windows.ps1
# Installe les prerequis (Node.js LTS, FFmpeg) puis les dependances npm du projet,
# DANS LE DOSSIER OU SE TROUVE CE SCRIPT (aucun chemin en dur, aucun clonage).
#
# Usage : clic droit sur le fichier > "Executer avec PowerShell", ou dans PowerShell :
#   Set-ExecutionPolicy Bypass -Scope Process; .\installer-windows.ps1

$ErrorActionPreference = "Stop"
$projetDir = $PSScriptRoot

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "  Suno Video Compiler - Installation Windows" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan
Write-Host "  Dossier du projet : $projetDir`n"

# Recharge le PATH (machine + utilisateur) pour voir ce que winget vient d'installer
# sans avoir a rouvrir le terminal.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:PATH = "$machine;$user"
}

# --- 1. winget ---
$hasWinget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $hasWinget) {
    Write-Host "[!] winget non trouve. Installe 'App Installer' depuis le Microsoft Store :" -ForegroundColor Red
    Write-Host "    https://aka.ms/getwinget" -ForegroundColor Yellow
    Write-Host "    Ou installe a la main Node.js (https://nodejs.org) et FFmpeg (https://ffmpeg.org)," -ForegroundColor Yellow
    Write-Host "    puis lance 'npm install' dans le dossier du projet." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] winget disponible" -ForegroundColor Green

# --- 2. Node.js (>= 18) ---
$besoinNode = $true
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($major -ge 18) {
        Write-Host "[OK] Node.js deja installe : $nodeVersion" -ForegroundColor Green
        $besoinNode = $false
    } else {
        Write-Host "[!] Node.js >= 18 requis (tu as $nodeVersion). Mise a jour..." -ForegroundColor Yellow
    }
}
if ($besoinNode) {
    Write-Host "[>>] Installation de Node.js LTS..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Update-SessionPath
}

# --- 3. FFmpeg (ffmpeg + ffprobe) ---
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "[OK] FFmpeg deja installe" -ForegroundColor Green
} else {
    Write-Host "[>>] Installation de FFmpeg..." -ForegroundColor Yellow
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    Update-SessionPath
}

# --- 4. npm install (dans le dossier du script) ---
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host "`n[>>] Installation des packages npm..." -ForegroundColor Yellow
    Push-Location $projetDir
    try { npm install } finally { Pop-Location }
} else {
    Write-Host "`n[!] npm introuvable dans ce terminal. Ferme-le, rouvres-en un," -ForegroundColor Yellow
    Write-Host "    puis lance 'npm install' dans : $projetDir" -ForegroundColor Yellow
}

# --- 5. Verifications finales ---
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  Verification finale" -ForegroundColor Green
Write-Host "================================================`n" -ForegroundColor Green

$checks = @(
    @{ Name = "Node.js"; Exe = "node";    Args = @("--version") },
    @{ Name = "npm";     Exe = "npm";     Args = @("--version") },
    @{ Name = "FFmpeg";  Exe = "ffmpeg";  Args = @("-version") },
    @{ Name = "FFprobe"; Exe = "ffprobe"; Args = @("-version") }
)

$manquants = 0
foreach ($c in $checks) {
    if (Get-Command $c.Exe -ErrorAction SilentlyContinue) {
        $out = & $c.Exe @($c.Args) 2>$null | Select-Object -First 1
        Write-Host "  [OK] $($c.Name) : $out" -ForegroundColor Green
    } else {
        $manquants++
        Write-Host "  [!!] $($c.Name) : introuvable dans ce terminal" -ForegroundColor Red
    }
}

Write-Host "`n================================================" -ForegroundColor Cyan
if ($manquants -eq 0) {
    Write-Host "  Installation terminee !" -ForegroundColor Cyan
} else {
    Write-Host "  Installation incomplete : FERME et ROUVRE le terminal, puis relance ce script." -ForegroundColor Yellow
}
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "`n  Premier essai (sans aucun media a fournir) :" -ForegroundColor White
Write-Host "    cd `"$projetDir`"" -ForegroundColor White
Write-Host "    node outils/creer-demo.js" -ForegroundColor White
Write-Host "    node index.js --projet exemple-deep-focus --test 30" -ForegroundColor White
Write-Host ""
