@echo off
echo ==========================================
echo   Starting Tensile Test Analyzer
echo ==========================================

echo Installing dependencies...
pip install -r requirements.txt

echo Starting server...
start http://127.0.0.1:5000
python app.py

pause
