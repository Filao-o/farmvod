@echo off
setlocal
chcp 65001 >nul <nul
title Suno Video Compiler
rem Se place dans le dossier du script : le lanceur marche d'ou qu'on le lance.
cd /d "%~dp0"

where node >nul 2>nul <nul
if errorlevel 1 goto pasdenode

if exist "node_modules\" goto pret
echo Premiere utilisation : installation des dependances (npm install)...
call npm install
if errorlevel 1 goto echecnpm
echo.

:pret
echo ================================================
echo   PRODUCTION D'UNE VIDEO LONGUE
echo ================================================
echo.
echo Projets disponibles :
dir /b /ad projets 2>nul
echo.

set "PROJET="
set /p "PROJET=Nom du projet a compiler : "
if "%PROJET%"=="" goto fin

echo.
echo Mode de rendu :
echo   1 = Test rapide (video limitee a 30 secondes)
echo   2 = Production complete (duree cible du projet)
echo.
set "MODE="
set /p "MODE=Choix (1 ou 2) : "

set "OPTIONS="
if "%MODE%"=="1" goto modetest

set "REP="
set /p "REP=Envoyer sur YouTube en prive apres compilation ? (o/N) : "
if /i "%REP%"=="o" set "OPTIONS=--upload"
goto lancer

:modetest
set "OPTIONS=--test 30"

:lancer
echo.
echo Lancement... (ne ferme pas cette fenetre)
echo.

node index.js --projet "%PROJET%" %OPTIONS%
goto fin

:pasdenode
echo [!] Node.js est introuvable.
echo     Installe la version LTS depuis https://nodejs.org
echo     (ou lance installer-windows.ps1), puis rouvre cette fenetre.
goto fin

:echecnpm
echo [!] npm install a echoue. Verifie ta connexion internet et relance.

:fin
echo.
echo ================================================
pause
endlocal
