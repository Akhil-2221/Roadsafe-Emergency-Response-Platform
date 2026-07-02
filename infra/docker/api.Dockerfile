FROM node:20-alpine
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "--exit-child", "src/index.ts"]
