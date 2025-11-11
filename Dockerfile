# Node.js + Python3 이미지
FROM node:18-alpine

# Python3 설치
RUN apk add --no-cache python3

# 작업 디렉토리 설정
WORKDIR /app

# 소스 코드 전체 복사
COPY . .

# 의존성 설치 및 빌드
RUN npm install && npm run build

# 포트 노출
EXPOSE 3000

# 실행
CMD ["npm", "start"]
