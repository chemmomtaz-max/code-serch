@echo off
echo ======================================
echo    Pushing to GitHub...
echo ======================================
echo.

cd /d "%~dp0"

:: Init git if not already initialized
if not exist ".git" (
    echo Initializing git repository...
    git init
)

:: Set remote (update if exists)
echo Setting remote origin...
git remote remove origin 2>nul
git remote add origin https://github.com/chemmomtaz-max/code-serch.git

:: Stage all files
echo Staging all files...
git add .

:: Commit
echo Committing...
git commit -m "OSINT Search App - Full multilingual entity-grouped results"

:: Set branch to main and push
echo Pushing to GitHub...
git branch -M main
git push -u origin main --force

echo.
echo ======================================
echo    Done! Check your GitHub repo.
echo ======================================
pause
