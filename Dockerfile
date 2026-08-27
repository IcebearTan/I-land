# 多阶段构建：Node 构建前端 → Python 运行时托管
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/tests ./tests
COPY --from=frontend-build /build/dist ./frontend/dist

ENV ILAND_DB_PATH=/data/iland.db \
    ILAND_UPLOADS_DIR=/data/uploads

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
