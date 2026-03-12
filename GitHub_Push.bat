@echo off
echo ==============================================
echo  GitHub Push Script for OSINT Search App
echo ==============================================

cd /d "%~dp0"

:: Initialize repository if needed
if not exist .git (
    echo [1] Initializing Git Repository...
    git init
)

:: Set up remote origin
echo [2] Setting up Remote Origin...
git remote remove origin 2>nul
git remote add origin https://github.com/chemmomtaz-max/code-serch.git

:: Stage all files
echo [3] Staging Files...
git add .

:: Commit
echo [4] Committing Changes...
git commit -m "OSINT Search App: Added multilang and entity grouping UI"

:: Change branch and Push
echo [5] Pushing to GitHub...
git branch -M main
git push -u origin main --force

echo.
echo ==============================================
echo  Done! Please check your GitHub repository.
echo ==============================================
pause
