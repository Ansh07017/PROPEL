# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the backend code
COPY . .

# Build the TypeScript project to generate the 'dist' folder
RUN npm run build

# Expose the API port
EXPOSE 3000

# Start the compiled production server
CMD ["npm", "start"]