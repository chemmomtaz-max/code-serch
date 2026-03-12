@echo off
echo ==============================================
echo  GitHub Fix and Push Script
echo ==============================================

cd /d "%~dp0"

echo [1] Fixing Git Email and Name Identity...
git config --global user.email "chemmomtaz-max@users.noreply.github.com"
git config --global user.name "chemmomtaz-max"

echo [2] Initializing and Staging files...
git init
git add .

echo [3] Creating the first Commit...
git commit -m "Full Application Redesign - OSINT Entity Search"

echo [4] Merging with existing GitHub Repository (if any)...
git remote remove origin 2>nul
git remote add origin https://github.com/chemmomtaz-max/code-serch.git
git branch -M main

:: This fixes the 'failed to push some refs' error 
git config pull.rebase false
git pull origin main --allow-unrelated-histories

echo [5] Pushing to GitHub...
git push -u origin main --force

echo.
echo ==============================================
echo  Done! Please check your GitHub repository.
echo ==============================================
pause
