# Start from an official Node.js image that includes FFmpeg support.
# Alpine is a lightweight Linux version — keeps the server fast and small.
FROM node:18-alpine

# Install FFmpeg directly into the Docker container.
# Because we're building the container itself, we have full permissions here.
RUN apk add --no-cache ffmpeg

# Set the working directory inside the container.
WORKDIR /app

# Copy your package.json first (so Docker can cache the npm install step).
COPY package.json .

# Install your Node.js dependencies.
RUN npm install

# Copy the rest of your server code into the container.
COPY . .

# Tell the container which port your Express server listens on.
EXPOSE 3000

# The command that starts your server when the container boots up.
CMD ["node", "server.js"]
