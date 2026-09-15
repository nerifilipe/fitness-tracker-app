FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.lock pyproject.toml ./
RUN pip install -r requirements.lock
COPY app ./app
RUN pip install --no-deps .
COPY alembic.ini ./
COPY migrations ./migrations
COPY scripts/start_service.py ./scripts/start_service.py
RUN useradd --create-home --uid 10001 fitness
USER fitness
EXPOSE 10000
CMD ["python", "scripts/start_service.py"]
