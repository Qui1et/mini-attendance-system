# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json vite.config.ts ./
RUN npm install --force
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80