FROM node:24-alpine
WORKDIR /app
COPY server.cjs ./
COPY public ./public
ENV PORT=3210
EXPOSE 3210
USER node
CMD ["node", "server.cjs"]
