FROM node:20-alpine

# Install Docker CLI for executing docker commands from within the container
RUN apk add --no-cache docker-cli shadow bash

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application source
COPY . .

# Create servers directory
RUN mkdir -p /app/servers

EXPOSE 3000

CMD ["node", "server.js"]
