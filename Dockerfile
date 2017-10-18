FROM node:8.7-alpine

ENV NODE_ENV=production

RUN mkdir -p /usr/src/app
COPY . /usr/src/app

WORKDIR /usr/src/app
RUN yarn install

CMD yarn start
