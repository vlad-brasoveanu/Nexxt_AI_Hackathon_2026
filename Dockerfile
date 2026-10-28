FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
COPY fixtures /build/fixtures
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY backend backend
COPY alembic.ini .
COPY --from=frontend /build/frontend/dist /app/frontend/dist
ENV PYTHONPATH=/app/backend CASECHECK_FRONTEND_DIR=/app/frontend/dist
RUN useradd --create-home casecheck && mkdir -p /app/.runtime/documents && chown -R casecheck:casecheck /app
USER casecheck
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
