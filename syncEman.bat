@echo off
robocopy "D:\Github_Repos\GreatTest" "D:\Github_Repos\just-working\code" /MIR /XD .git .venv __pycache__ /XF .env
pause