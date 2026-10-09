FROM node:26-slim

WORKDIR /app

# install only needed runtime deps
RUN apt-get update && apt-get install -y \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# copy project
COPY . .

RUN npm install --omit=dev

# Finished games and their Stockfish reviews are saved here as JSON.
# Mount a volume on it (docker run -v chess-data:/app/data ...) or they vanish with the container.
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]