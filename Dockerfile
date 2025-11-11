# Node.js + Python3 이미지
FROM node:18-alpine

# Python3 설치
RUN apk add --no-cache python3

# 작업 디렉토리 설정
WORKDIR /app

# package.json 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN npm run build

# 포트 노출
EXPOSE 3000

# 실행
CMD ["npm", "start"]
