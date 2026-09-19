FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --omit=dev --ignore-scripts \
  && npm ci --prefix backend \
  && npm ci --prefix frontend

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app /app
COPY backend ./backend
COPY frontend ./frontend
COPY supabase ./supabase
RUN npm run build --prefix backend && npm run build --prefix frontend

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/supabase ./supabase
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
