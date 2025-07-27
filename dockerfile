FROM node:20

WORKDIR /app

COPY server /app
COPY public /app/public

RUN npm install

EXPOSE 3000

CMD ["npm", "start"]
