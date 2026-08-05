# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the backend code
COPY . .

# Expose the API port
EXPOSE 3000

# Start directly using tsx without needing compilation
CMD ["npx", "tsx", "src/index.ts"]