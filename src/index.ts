/**
 * Railway Cron Server
 * Express 서버 + node-cron으로 주식/코인 데이터 갱신
 */

import express from 'express'
import cron from 'node-cron'
import dotenv from 'dotenv'
import { updateStockPrices } from './cron/stocks'
import { updateCoinPrices } from './cron/coins'

// 환경 변수 로드
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// JSON 파싱
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// 수동 트리거 엔드포인트
app.post('/trigger/stocks', async (req, res) => {
  console.log('🔄 수동 주식 가격 갱신 트리거')
  updateStockPrices().catch(console.error)
  res.json({ message: '주식 가격 갱신 시작됨' })
})

app.post('/trigger/coins', async (req, res) => {
  console.log('🔄 수동 코인 가격 갱신 트리거')
  updateCoinPrices().catch(console.error)
  res.json({ message: '코인 가격 갱신 시작됨' })
})

// 서버 시작
app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Railway Cron Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
KV URL: ${process.env.KV_REST_API_URL ? '✅ Connected' : '❌ Missing'}
KIS API: ${process.env.KIS_APP_KEY ? '✅ Configured' : '❌ Missing'}

Cron Jobs:
  📈 주식: */5 * * * * (5분마다)
  💰 코인: */3 * * * * (3분마다)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `)

  // 주식 Cron: 5분마다
  cron.schedule('*/5 * * * *', async () => {
    console.log(`\n[${ new Date().toISOString()}] 📈 주식 가격 갱신 시작`)
    try {
      await updateStockPrices()
    } catch (error) {
      console.error('주식 Cron 에러:', error)
    }
  })

  // 코인 Cron: 3분마다
  cron.schedule('*/3 * * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] 💰 코인 가격 갱신 시작`)
    try {
      await updateCoinPrices()
    } catch (error) {
      console.error('코인 Cron 에러:', error)
    }
  })

  // 서버 시작 후 즉시 한 번 실행 (선택사항)
  console.log('\n🔄 초기 데이터 갱신 시작...\n')
  Promise.all([
    updateStockPrices().catch(console.error),
    updateCoinPrices().catch(console.error)
  ]).then(() => {
    console.log('\n✅ 초기 데이터 갱신 완료\n')
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})
