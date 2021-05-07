FROM node:16.1.0-slim
WORKDIR /app
COPY package.json ./app
RUN npm install
COPY . /app
CMD ["npm", "start"]