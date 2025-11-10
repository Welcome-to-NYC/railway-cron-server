# Railway Cron Server

주식 및 코인 데이터를 주기적으로 수집하여 Vercel KV에 저장하는 Railway 서버입니다.

## 🎯 목적

Vercel의 Cron Job 대신 Railway에서 24시간 실행되는 서버로 데이터 수집을 처리하여 Vercel 서버리스 함수 실행 시간을 절약합니다.

## 📊 아키텍처

```
Railway (Node.js 서버)
  ├── Express 서버
  ├── node-cron
  ├── 주식 Cron (5분마다)
  ├── 코인 Cron (3분마다)
  └── Vercel KV 저장

↓ Redis/KV

Vercel (Next.js)
  ├── 프론트엔드 (SSR/Static)
  └── API Routes (Redis 읽기만)
```

## 🚀 시작하기

### 1. 의존성 설치

```bash
cd railway-cron-server
npm install
```

### 2. 환경 변수 설정

`.env` 파일 생성:

```env
# Vercel KV
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token

# 한국투자증권 API
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=your_app_key
KIS_APP_SECRET=your_app_secret

# 서버
PORT=3000
NODE_ENV=production
```

### 3. 로컬 개발

```bash
npm run dev
```

### 4. 빌드

```bash
npm run build
npm start
```

## 📦 Railway 배포

### 1. Railway 프로젝트 생성

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성
railway init
```

### 2. 환경 변수 설정

Railway Dashboard에서 환경 변수 추가:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `KIS_BASE_URL`
- `NODE_ENV=production`

### 3. CSV 파일 업로드

`data/` 폴더에 `merged_data_20251031.csv` 파일 추가:

```bash
mkdir -p data
cp ../같이가자/lib/merged_data_20251031.csv data/
```

### 4. 배포

```bash
railway up
```

또는 GitHub 연동 자동 배포 설정

## 🔧 API 엔드포인트

### Health Check
```
GET /health
```

### 수동 트리거
```
POST /trigger/stocks  # 주식 가격 갱신
POST /trigger/coins   # 코인 가격 갱신
```

## ⏰ Cron 스케줄

- **주식**: `*/5 * * * *` (5분마다)
- **코인**: `*/3 * * * *` (3분마다)

## 💰 비용 비교

| 항목 | Vercel Cron | Railway 분리 |
|------|-------------|--------------|
| Vercel Pro | $20/월 | $20/월 |
| 함수 실행 시간 | ~90시간/월 | ~10시간/월 |
| Railway | - | $5/월 |
| **총 비용** | **$20-30/월** | **$25/월 (고정)** |

## 📝 참고사항

- Railway Hobby Plan: $5/월 (512MB RAM, 1 vCPU)
- Vercel 함수 실행 시간 90% 절감
- 24시간 안정적 데이터 수집
- Vercel KV는 여전히 Vercel에서 관리

## 🔗 관련 링크

- [Railway 공식 문서](https://docs.railway.app/)
- [Vercel KV 공식 문서](https://vercel.com/docs/storage/vercel-kv)
- [node-cron 문서](https://github.com/node-cron/node-cron)

## 📄 라이선스

MIT
