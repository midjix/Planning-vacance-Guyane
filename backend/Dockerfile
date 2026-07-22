FROM node:22-alpine
# ffmpeg : transcodage des vidéos en version allégée (lecture basse qualité fluide)
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8081
CMD ["npm", "start"]
