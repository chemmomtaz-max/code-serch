@echo off
echo ==============================================
echo  GitHub Sync and Push Script 
echo ==============================================

cd /d "%~dp0"

:: Initialize Git if not done
if not exist .git (
    echo [1] Initializing Git Repository...
    git init
    git branch -M main
)

:: Ensure origin is set
echo [2] Checking Remote...
git remote remove origin 2>nul
git remote add origin https://github.com/chemmomtaz-max/code-serch.git

:: Stage and Commit our local work first
echo [3] Staging and Committing local files...
git add .
git commit -m "OSINT App Local Changes"

:: Fetch remote changes
echo [4] Syncing (Pulling) from GitHub...
:: Using rebase to put our local changes on top of whatever was on GitHub (like README)
git pull origin main --rebase

:: Push it back
echo [5] Pushing final code to GitHub...
git push -u origin main

echo.
echo ==============================================
echo  Done! Please check your GitHub repository.
echo ==============================================
pause
