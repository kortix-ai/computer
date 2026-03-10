FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json ./
RUN npm install
COPY src ./src
COPY test ./test
COPY README.md TESTING.md ./
CMD ["npm", "run", "test:e2e"]
