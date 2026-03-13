FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# npm ci limpio — sin residuos de versiones anteriores
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./

# Solo deps de producción + limpiar caché de npm y binarios nativos no usados
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    # @surrealdb/node descarga binarios para múltiples plataformas — eliminar los que no son linux-x64
    find /app/node_modules/@surrealdb -name '*.node' ! -name '*linux*x64*' -delete 2>/dev/null || true && \
    find /app/node_modules -name '*.map' -delete 2>/dev/null || true && \
    find /app/node_modules -type d -name '__tests__' -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true

# Solo el JS compilado
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
