@echo off
title Development Environment

:: 1. Start Adminer from server folder (port 8080)
cd server && start /b php -S 127.0.0.1:8080

:: 2. Start server, client, dan worker email ingestion
start /b npm run dev & cd ../client && start /b npm run dev -- --host & cd ../server && start /b npm run worker

:: 3. Wait for 3 seconds for services to spin up, then open browser
timeout /t 3 /nobreak > nul

echo Open browser for Client and Adminer...
start msedge http://172.17.70.24:5173/
start msedge http://127.0.0.1:8080/adminer.php

echo All services are running!
pause