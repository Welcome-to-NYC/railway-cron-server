# ⚡ 빠른 시작 가이드

## 📦 의존성 설치

```bash
cd railway-cron-server
npm install
```

## 🔑 환경 변수 설정

`.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 수정:
- Vercel Dashboard → Storage → KV에서 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 복사
- 한투 API Key 입력

## 🧪 로컬 테스트

```bash
npm run dev
```

브라우저에서 확인:
```
http://localhost:3000/health
```

## 🚀 Railway 배포

### 1. Railway 계정 생성
https://railway.app/

### 2. 새 프로젝트 생성
- "New Project" → "Deploy from GitHub repo"

### 3. 환경 변수 설정
Railway Dashboard에서 `.env` 내용 복사

### 4. 배포 확인
Railway 로그에서 다음 메시지 확인:
```
🚀 Railway Cron Server Started
📈 주식: */5 * * * * (5분마다)
💰 코인: */3 * * * * (3분마다)
```

## ✅ Next.js 프로젝트 수정

`vercel.json` 파일:
```json
{
  "crons": []
}
```

커밋 & 푸시:
```bash
cd ../같이가자
git add vercel.json
git commit -m "chore: Vercel Cron 제거"
git push
```

## 🎉 완료!

- ✅ Railway 서버 실행 중
- ✅ 주식 5분마다 갱신
- ✅ 코인 3분마다 갱신
- ✅ Vercel 비용 절감

## 📊 비용

- Railway Hobby: $5/월
- Vercel 함수 실행 시간 90% 감소
- 총 절감: ~$5-10/월

## 🔗 링크

- 자세한 배포 가이드: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 프로젝트 설명: [README.md](./README.md)
