FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk update && apk add --no-cache openssl python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

# Start script that pushes the schema to the DB before running the bot
RUN echo '#!/bin/sh' > start.sh
RUN echo 'npx prisma db push --accept-data-loss' >> start.sh
RUN echo 'node dist/migrate.js' >> start.sh
RUN echo 'npm start' >> start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
