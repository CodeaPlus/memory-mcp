FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./

# Instalar solo deps de producción y limpiar todo lo que no se necesita en runtime
RUN npm ci --omit=dev --no-audit --no-fund && \
    # Limpiar caché de npm (múltiples ubicaciones posibles)
    npm cache clean --force && \
    rm -rf /root/.npm ~/.npm /tmp/npm-* && \
    # Eliminar binarios nativos de otras plataformas (@surrealdb/node usa napi-rs)
    find /app/node_modules -name '*.node' \
      ! \( -name '*linux-x64*' -o -name '*linux_x64*' \) \
      -delete 2>/dev/null || true && \
    # Eliminar archivos innecesarios de node_modules
    find /app/node_modules -name '*.map' -delete 2>/dev/null || true && \
    find /app/node_modules -name '*.md' -delete 2>/dev/null || true && \
    find /app/node_modules -name 'CHANGELOG*' -o -name 'LICENCE*' | xargs rm -f 2>/dev/null || true && \
    find /app/node_modules -type d \
      \( -name '__tests__' -o -name 'test' -o -name 'tests' -o -name 'coverage' -o -name 'docs' -o -name 'example' -o -name 'examples' \) \
      -exec rm -rf {} + 2>/dev/null || true

# Solo el JS compilado
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
