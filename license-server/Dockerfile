FROM node:18-alpine
WORKDIR /app
COPY server.js ./
RUN mkdir -p data
ENV PORT=4444 HOST=0.0.0.0
EXPOSE 4444
CMD ["node", "server.js"]
