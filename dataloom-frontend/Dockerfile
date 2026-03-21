FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3200

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
