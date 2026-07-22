FROM node:22-alpine as build
# Version affichée sur le site (injectée au build par GitHub Actions)
ARG APP_VERSION=dev
ARG BUILD_DATE=
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_BUILD_DATE=$BUILD_DATE
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
