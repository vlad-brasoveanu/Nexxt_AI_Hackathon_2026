"""Isolated local preview, without Docker. Never use this SQLite mode for bank deployment."""
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
RUNTIME = ROOT / '.runtime'
RUNTIME.mkdir(exist_ok=True, mode=0o700)
credentials = RUNTIME / 'preview-password.txt'
if not credentials.exists():
    credentials.write_text(secrets.token_urlsafe(24))
    credentials.chmod(0o600)
env = {**os.environ, 'PYTHONPATH': str(ROOT / 'backend'),
       'CASECHECK_DATABASE_URL': 'sqlite:///' + str(RUNTIME / 'local-preview.db'),
       'CASECHECK_STORAGE_DIR': str(RUNTIME / 'preview-documents'),
       'CASECHECK_SECURE_COOKIES': 'false', 'CASECHECK_ALLOWED_ORIGINS': '[]',
       'CASECHECK_FRONTEND_DIR': str(ROOT / 'frontend/dist'),
       'CASECHECK_DEMO_PASSWORD': credentials.read_text().strip()}
if not (ROOT / 'frontend/dist/index.html').exists():
    subprocess.run(['npm', 'run', 'build', '--prefix', 'frontend'], check=True)
subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], env=env, check=True)
subprocess.run([sys.executable, '-m', 'app.seed'], env=env, check=True)
print(f'Local preview: http://127.0.0.1:8000\nUsers: manager / analyst / supervisor\nPassword file: {credentials}', flush=True)
subprocess.run([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], env=env, check=True)
