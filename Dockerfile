# --- Build stage -------------------------------------------------------------
# The browser cannot run .tsx, so the app must be bundled before it is served.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* variables at build time, so the key has to be present
# here rather than at container runtime.
#   docker build --build-arg VITE_API_KEY=... .
# NOTE: anything inlined this way ships inside the public JS bundle.
ARG VITE_API_KEY=""
ENV VITE_API_KEY=$VITE_API_KEY

RUN npm run build

# --- Serve stage -------------------------------------------------------------
FROM nginx:1.25-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/omnitrivia.conf /etc/nginx/conf.d/omnitrivia.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
