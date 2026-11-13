FROM node:20-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
# Inject backend URLs at build time via env vars
ARG VITE_ML_URL
ARG VITE_AGENT_URL
ARG VITE_RAG_URL
ENV VITE_ML_URL=$VITE_ML_URL
ENV VITE_AGENT_URL=$VITE_AGENT_URL
ENV VITE_RAG_URL=$VITE_RAG_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
