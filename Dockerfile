# Base image eka Node 20
FROM node:20-alpine

# Working directory eka set kireema
WORKDIR /usr/src/app

# Package files copy kireema
COPY package*.json ./

# Dependencies install kireema
RUN npm install

# Project files okkoma copy kireema
COPY . .

# Server eka run wena port eka expose kireema
EXPOSE 5000

# App eka start karana command eka
CMD ["npx", "tsx", "src/server.ts"]