# installer-windows.ps1
# Script d'installation des dependances pour Suno Video Compiler
# Lancer dans PowerShell en admin : Set-ExecutionPolicy Bypass -Scope Process; .\installer-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "  Suno Video Compiler - Installation Windows" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# --- 1. Verifier / installer winget ---
$hasWinget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $hasWinget) {
    Write-Host "[!] winget non trouve. Installe App Installer depuis le Microsoft Store." -ForegroundColor Red
    Write-Host "    https://aka.ms/getwinget" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] winget disponible" -ForegroundColor Green

# --- 2. Git ---
$hasGit = Get-Command git -ErrorAction SilentlyContinue
if (-not $hasGit) {
    Write-Host "[>>] Installation de Git..." -ForegroundColor Yellow
    winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
    $env:PATH = "$env:PATH;C:\Program Files\Git\cmd"
} else {
    Write-Host "[OK] Git deja installe : $(git --version)" -ForegroundColor Green
}

# --- 3. Node.js ---
$hasNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $hasNode) {
    Write-Host "[>>] Installation de Node.js LTS..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    $env:PATH = "$env:PATH;C:\Program Files\nodejs"
} else {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js deja installe : $nodeVersion" -ForegroundColor Green
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($major -lt 18) {
        Write-Host "[!] Node.js >= 18 requis (tu as $nodeVersion). Mise a jour..." -ForegroundColor Yellow
        winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    }
}

# --- 4. FFmpeg ---
$hasFFmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $hasFFmpeg) {
    Write-Host "[>>] Installation de FFmpeg..." -ForegroundColor Yellow
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    Write-Host "[!] Redemarrer le terminal apres install pour que ffmpeg soit dans le PATH." -ForegroundColor Yellow
} else {
    Write-Host "[OK] FFmpeg deja installe" -ForegroundColor Green
    ffmpeg -version 2>&1 | Select-Object -First 1
}

# --- 5. Cloner / mettre a jour le repo ---
$projetDir = "$env:USERPROFILE\Desktop\suno-video-compiler"

if (Test-Path "$projetDir\.git") {
    Write-Host "`n[>>] Mise a jour du repo sur le Bureau..." -ForegroundColor Yellow
    Push-Location $projetDir
    git pull origin main
    Pop-Location
} else {
    Write-Host "`n[>>] Clonage du repo sur le Bureau..." -ForegroundColor Yellow
    git clone https://github.com/filao-o/farmvod.git $projetDir
}

# --- 6. npm install ---
Write-Host "`n[>>] Installation des packages npm..." -ForegroundColor Yellow
Push-Location $projetDir
npm install
Pop-Location

# --- 7. Verifications finales ---
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  Verification finale" -ForegroundColor Green
Write-Host "================================================`n" -ForegroundColor Green

$checks = @(
    @{ Name = "Git";     Cmd = "git --version" },
    @{ Name = "Node.js"; Cmd = "node --version" },
    @{ Name = "npm";     Cmd = "npm --version" },
    @{ Name = "FFmpeg";  Cmd = "ffmpeg -version" },
    @{ Name = "FFprobe"; Cmd = "ffprobe -version" }
)

foreach ($c in $checks) {
    try {
        $out = Invoke-Expression $c.Cmd 2>&1 | Select-Object -First 1
        Write-Host "  [OK] $($c.Name) : $out" -ForegroundColor Green
    } catch {
        Write-Host "  [!!] $($c.Name) : NON TROUVE - relancer le terminal ou installer manuellement" -ForegroundColor Red
    }
}

# --- 8. Structure projets ---
$audioDir = Join-Path $projetDir "projets"
if (-not (Test-Path $audioDir)) {
    New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "  Installation terminee !" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "`n  Projet installe dans : $projetDir" -ForegroundColor White
Write-Host "  Pour tester : cd $projetDir && node index.js --aide" -ForegroundColor White
Write-Host "`n  Si FFmpeg vient d'etre installe, FERME et ROUVRE ce terminal." -ForegroundColor Yellow
Write-Host ""
