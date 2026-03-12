@echo off
echo ==============================================
echo  GitHub FORCE PUSH Script 
echo ==============================================

cd /d "%~dp0"

echo [1] Setting Branch...
git branch -M main

echo [2] Forcing Upload (Overwriting everything on GitHub with this folder)...
git push -u origin main --force

echo.
echo ==============================================
echo  Done! Please check your GitHub repository.
echo ==============================================
pause
