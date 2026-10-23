@echo off
rem Runs the nightly backup. The Windows Task Scheduler starts THIS file (see README, section 7).
rem Everything it prints goes to logs\backup.log. It must stay inside the server folder.
cd /d "%~dp0"
if not exist logs mkdir logs
"C:\Program Files\nodejs\node.exe" dist\scripts\backup.js >> "%~dp0logs\backup.log" 2>&1