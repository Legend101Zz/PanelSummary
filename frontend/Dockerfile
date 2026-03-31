FROM node:20-alpine

WORKDIR /app

# Copy package files first (cache optimization)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
