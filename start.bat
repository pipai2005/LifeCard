@echo off
setlocal
cd /d "%~dp0"

rem ==========================================================================
rem  knowledge-base - Windows launcher
rem
rem  IMPORTANT: KEEP THIS FILE ASCII-ONLY.
rem
rem  cmd.exe reads .bat files using the console OEM codepage, which is GBK
rem  (cp936) on Chinese Windows. Chinese characters inside a .bat get
rem  mis-decoded, and because cmd tracks its position in the file by byte
rem  offset, that desyncs the parser - it then executes fragments of lines as
rem  commands, producing errors like:
rem      'odejs.org' is not recognized as an internal or external command
rem
rem  Do NOT put "chcp 65001" near the top either: switching the codepage
rem  mid-file breaks the byte-offset tracking even when the remaining content
rem  is plain ASCII.
rem ==========================================================================

title knowledge-base

set "NODE_EXE="

rem --- 1) Node.js already on PATH? ---
for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"

rem --- 2) Otherwise probe the usual install locations ---
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%APPDATA%\npm\node.exe" set "NODE_EXE=%APPDATA%\npm\node.exe"
if not defined NODE_EXE if exist "%NVM_SYMLINK%\node.exe" set "NODE_EXE=%NVM_SYMLINK%\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" set "NODE_EXE=%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
if not defined NODE_EXE if exist "D:\dev\nodejs_learning\nodejs\node.exe" set "NODE_EXE=D:\dev\nodejs_learning\nodejs\node.exe"
if not defined NODE_EXE if exist "D:\nodejs\node.exe" set "NODE_EXE=D:\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nodejs\node.exe" set "NODE_EXE=C:\nodejs\node.exe"

rem --- 3) Scan the WorkBuddy managed runtime directory ---
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do if not defined NODE_EXE if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"

if defined NODE_EXE goto run

rem --------------------------------------------------------------------------
echo.
echo   ==========================================================
echo    Node.js was NOT found on this computer.
echo   ==========================================================
echo.
echo   This tool runs on Node.js. Please install the LTS version:
echo.
echo       https://nodejs.org/
echo.
echo   After installing, close this window and double-click
echo   start.bat again.
echo.
pause
exit /b 1

:run
echo.
echo   ==========================================================
echo    knowledge-base - personal notes
echo   ==========================================================
echo.
echo    Node.js : %NODE_EXE%
echo    Address : http://127.0.0.1:4321
echo.
echo    A browser window should open automatically.
echo    Keep this window open while using the tool.
echo    Press Ctrl + C to stop the service.
echo.

rem Switch the console to UTF-8 so Node's output renders correctly.
rem This MUST stay below every parsing-sensitive line above.
chcp 65001 >nul

"%NODE_EXE%" server.js --open
set "EXITCODE=%ERRORLEVEL%"

echo.
echo   Service stopped (exit code %EXITCODE%).
echo.
pause
