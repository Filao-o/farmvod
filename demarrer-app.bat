@echo off
setlocal
chcp 65001 >nul <nul
title Suno Video Compiler
rem Se place dans le dossier du script : le lanceur marche d'ou qu'on le lance.
cd /d "%~dp0"

where node >nul 2>nul <nul
if errorlevel 1 goto pasdenode

if exist "node_modules\electron\" goto lancer
echo Installation des dependances (npm install)...
call npm install
if errorlevel 1 goto echecnpm
if exist "node_modules\electron\" goto lancer
echo [!] L'interface graphique (Electron) n'a pas pu etre installee.
echo     Relance "npm install electron", ou utilise lancer-video.bat (ligne de commande).
goto fin

:lancer
call npm start
goto fin

:pasdenode
echo [!] Node.js est introuvable.
echo     Installe la version LTS depuis https://nodejs.org
echo     (ou lance installer-windows.ps1), puis rouvre cette fenetre.
goto fin

:echecnpm
echo [!] npm install a echoue. Verifie ta connexion internet et relance.

:fin
pause
endlocal
