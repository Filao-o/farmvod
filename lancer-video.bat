@echo off
chcp 65001 >nul
title Suno Video Compiler
cd /d "%~dp0"

echo ================================================
echo   PRODUCTION D'UNE VIDEO LONGUE
echo ================================================
echo.
echo Projets disponibles :
dir /b /ad projets 2>nul
echo.

set /p PROJET="Nom du projet a compiler : "
if "%PROJET%"=="" goto fin

echo.
echo Mode de rendu :
echo   1 = Test rapide (30 secondes, pour valider les visuels)
echo   2 = Production complete (duree cible du projet)
echo.
set /p MODE="Choix (1 ou 2) : "

set OPTIONS=
if "%MODE%"=="1" (
    set OPTIONS=--test 30
) else (
    set /p REP="Envoyer sur YouTube en prive apres compilation ? (o/N) : "
    if /i "%REP%"=="o" set OPTIONS=--upload
)

echo.
echo Lancement... (ne ferme pas cette fenetre)
echo.

node index.js --projet %PROJET% %OPTIONS%

:fin
echo.
echo ================================================
pause
