# Local testing only. Production runs on EC2 under systemd (see deploy/), because
# the whole point of this service is a stable Elastic IP that Mercury whitelists.
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Bind all interfaces inside the container; the host port mapping is the boundary.
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
