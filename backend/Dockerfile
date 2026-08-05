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

# Start the backend server (adjust if your start script is different)
CMD ["npm", "run", "dev"]