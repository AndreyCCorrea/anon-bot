FROM node:20-alpine

# Install build dependencies for native modules on Alpine
RUN apk update && apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

CMD ["npm", "start"]

