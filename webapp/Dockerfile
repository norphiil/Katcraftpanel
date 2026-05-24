FROM node:22-alpine

RUN apk add --no-cache docker-cli shadow bash git openssh-client

WORKDIR /app

# SSH setup for git push
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application source
COPY . .

# Create servers directory
RUN mkdir -p /app/servers

EXPOSE 3000

CMD ["node", "server.js"]
