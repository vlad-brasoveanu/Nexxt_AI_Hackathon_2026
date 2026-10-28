FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY backend backend
COPY alembic.ini .
ENV PYTHONPATH=/app/backend
RUN useradd --create-home casecheck && mkdir -p /app/.runtime/documents && chown -R casecheck:casecheck /app
USER casecheck
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
