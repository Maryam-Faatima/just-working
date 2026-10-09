@echo off
robocopy "D:\FYP\GreatTest" "D:\FYP\just working\code" /MIR /XD .git .venv __pycache__ /XF .env
pause