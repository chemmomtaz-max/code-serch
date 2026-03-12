@echo off
echo ==============================================
echo  GitHub Final Sync Script
echo ==============================================

cd /d "%~dp0"

echo [1] Checking Git configuration...
git branch -M main

echo [2] Merging GitHub files with your local code...
:: This fixes the error by allowing unrelated histories to merge
git config pull.rebase false
git pull origin main --allow-unrelated-histories

echo [3] Pushing everything safely to GitHub...
git push -u origin main

echo.
echo ==============================================
echo  Done! Please check your GitHub repository.
echo ==============================================
pause
