# syntax=docker/dockerfile:1.7
FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json eslint.config.mjs .prettierrc.json ./
COPY apps ./apps
COPY services ./services
COPY contracts ./contracts
COPY scripts ./scripts
RUN npm ci --ignore-scripts \
  && npm run build -w @apaar-platform/admission-domain \
  && npm run build -w @apaar-platform/policy-digital-twin \
  && npm run build -w @apaar-platform/admission-application \
  && npm run build -w @apaar-platform/batch-ingestion \
  && npm run build -w @apaar-platform/admission-casework \
  && npm run build -w @apaar-platform/integration-gateway \
  && npm run build -w @apaar-platform/institution-portal

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
LABEL org.opencontainers.image.title="NiyamSetu | Admission Integrity & Policy Registry" \
  org.opencontainers.image.description="Independent SIH 2026 admission integrity and policy registry; official integrations are not enabled."
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/institution-portal/package.json ./apps/institution-portal/package.json
COPY services/admission-application/package.json ./services/admission-application/package.json
COPY services/admission-casework/package.json ./services/admission-casework/package.json
COPY services/admission-domain/package.json ./services/admission-domain/package.json
COPY services/batch-ingestion/package.json ./services/batch-ingestion/package.json
COPY services/integration-gateway/package.json ./services/integration-gateway/package.json
COPY services/policy-digital-twin/package.json ./services/policy-digital-twin/package.json
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && apk add --no-cache --upgrade \
    libcrypto3=3.5.9-r0 \
    libssl3=3.5.9-r0 \
    zlib=1.3.2-r1 \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /workspace/services/admission-application/dist ./services/admission-application/dist
COPY --from=build /workspace/services/admission-application/migrations ./services/admission-application/migrations
COPY --from=build /workspace/services/admission-casework/dist ./services/admission-casework/dist
COPY --from=build /workspace/services/admission-casework/migrations ./services/admission-casework/migrations
COPY --from=build /workspace/services/admission-domain/dist ./services/admission-domain/dist
COPY --from=build /workspace/services/batch-ingestion/dist ./services/batch-ingestion/dist
COPY --from=build /workspace/services/batch-ingestion/migrations ./services/batch-ingestion/migrations
COPY --from=build /workspace/services/integration-gateway/dist ./services/integration-gateway/dist
COPY --from=build /workspace/services/integration-gateway/migrations ./services/integration-gateway/migrations
COPY --from=build /workspace/apps/institution-portal/dist ./apps/institution-portal/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "services/integration-gateway/dist/server.js"]
