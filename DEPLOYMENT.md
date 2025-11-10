# 🚀 Railway 배포 가이드

## 📋 사전 준비

### 1. Vercel KV 정보 확인

Vercel Dashboard → Project → Storage → KV에서:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

복사해두기

### 2. 한국투자증권 API 정보

- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `KIS_BASE_URL`

---

## 🛠️ Railway 배포 단계

### Step 1: Railway 계정 생성
1. [Railway](https://railway.app/) 접속
2. GitHub 계정으로 로그인

### Step 2: 새 프로젝트 생성
1. Dashboard → "New Project"
2. "Deploy from GitHub repo" 선택
3. `railway-cron-server` 레포지토리 선택
   
   (또는 로컬에서 직접 배포)

### Step 3: 환경 변수 설정

Railway Dashboard → Project → Variables:

```
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=...
KIS_APP_SECRET=...
NODE_ENV=production
PORT=3000
```

### Step 4: 배포 확인

1. Railway가 자동으로 빌드 및 배포
2. Logs 탭에서 로그 확인:
   ```
   🚀 Railway Cron Server Started
   Port: 3000
   📈 주식: */5 * * * * (5분마다)
   💰 코인: */3 * * * * (3분마다)
   ```

### Step 5: Health Check

Railway가 제공하는 URL로 접속:
```
GET https://your-railway-app.up.railway.app/health
```

응답:
```json
{
  "status": "ok",
  "timestamp": "2025-11-10T...",
  "uptime": 123.456
}
```

---

## 🔧 로컬에서 Railway CLI로 배포

### 1. Railway CLI 설치
```bash
npm install -g @railway/cli
```

### 2. 로그인
```bash
railway login
```

### 3. 프로젝트 링크
```bash
cd railway-cron-server
railway link
```

### 4. 배포
```bash
railway up
```

---

## 📝 Next.js 프로젝트 수정 (Vercel)

### Step 1: Vercel Cron 제거

`vercel.json` 수정:

```json
{
  "crons": []
}
```

### Step 2: Cron Route 파일 유지 (선택사항)

Cron route 파일들은 유지하되, 자동 실행은 Railway에서만 수행
- `app/api/cron/update-prices/route.ts`
- `app/api/cron/update-coin-prices/route.ts`

수동 호출은 여전히 가능 (디버깅/테스트용)

### Step 3: 배포

```bash
git add vercel.json
git commit -m "chore: Vercel Cron 제거, Railway로 이관"
git push origin main
```

---

## ✅ 검증 체크리스트

- [ ] Railway 서버 정상 실행 중
- [ ] `/health` 엔드포인트 응답 확인
- [ ] Railway 로그에서 Cron 실행 확인
- [ ] Vercel KV에 데이터 저장 확인
- [ ] Next.js 앱에서 주식/코인 데이터 조회 정상
- [ ] Vercel 함수 실행 시간 감소 확인

---

## 🐛 트러블슈팅

### Railway 서버가 시작 안 됨

**증상**: 빌드 성공했지만 서버 크래시

**해결**:
1. Logs 확인
2. 환경 변수 확인 (특히 KV credentials)
3. `PORT` 환경 변수 확인

### CSV 파일을 찾을 수 없음

**증상**: `CSV 파일을 찾을 수 없습니다` 에러

**해결**:
```bash
# data 폴더 확인
ls -la data/

# CSV 파일 복사
cp ../같이가자/lib/merged_data_20251031.csv data/

# Git에 추가
git add data/
git commit -m "Add stock CSV data"
git push
```

### Cron이 실행 안 됨

**증상**: Railway는 실행 중이지만 Cron 로그 없음

**해결**:
1. Railway 로그 확인
2. 수동 트리거 테스트:
   ```bash
   curl -X POST https://your-railway-app.up.railway.app/trigger/stocks
   ```
3. node-cron 스케줄 확인

### Vercel KV 연결 실패

**증상**: `Cannot connect to Redis` 에러

**해결**:
1. `KV_REST_API_URL` 형식 확인 (https:// 포함)
2. `KV_REST_API_TOKEN` 정확성 확인
3. Vercel KV가 활성화되어 있는지 확인

---

## 💰 비용 최적화

### Railway 플랜

**Hobby Plan: $5/월**
- 512MB RAM
- 1 vCPU
- 충분함 ✅

**Pro Plan: $20/월** (필요시)
- 8GB RAM
- 8 vCPU
- 더 많은 프로젝트

### Vercel 함수 실행 시간 절감

**Before**:
- 주식 Cron: 180초 × 288회/일 = 51,840초 (14.4시간/일)
- 코인 Cron: 112초 × 480회/일 = 53,760초 (14.9시간/일)
- **합계: 29.3시간/일 = 879시간/월**

**After**:
- Cron 실행: Railway에서 처리
- Vercel 함수: API 조회만 (1-2초)
- **Vercel 함수 실행 시간: ~90% 감소**

---

## 📊 모니터링

### Railway 로그 확인
```bash
railway logs
```

### 실시간 모니터링
Railway Dashboard → Project → Metrics:
- CPU 사용량
- 메모리 사용량
- 네트워크 트래픽

### Cron 실행 확인
Railway 로그에서:
```
[2025-11-10T12:00:00Z] 📈 주식 가격 갱신 시작
[2025-11-10T12:03:00Z] ✅ 주식 가격 갱신 완료: 2636개 성공
[2025-11-10T12:03:00Z] 💰 코인 가격 갱신 시작
[2025-11-10T12:05:00Z] ✅ 코인 가격 갱신 완료: 896개 성공
```

---

## 🔗 참고 링크

- [Railway 공식 문서](https://docs.railway.app/)
- [Railway CLI](https://docs.railway.app/develop/cli)
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
- [node-cron](https://github.com/node-cron/node-cron)
