/**
 * 코인 가격 Cron Job
 * 3분마다 전체 코인 가격을 갱신하여 Vercel KV에 저장
 * 업비트 Rate Limit: 캔들 API 초당 10회
 */

import { setCache, getCache } from '../lib/redis'

const UPBIT_API_BASE_URL = 'https://api.upbit.com/v1'
const TIME_INTERVALS = ['1h', '24h', '7d', '30d'] as const
const RATE_LIMIT_PER_SECOND = 8 // 초당 8회 (안전 마진)

/**
 * 코인 가격 갱신 메인 함수
 */
export async function updateCoinPrices(): Promise<void> {
  const startTime = Date.now()
  
  // 🔒 중복 실행 방지
  const lockKey = 'cron:update-coin-prices:lock'
  const isLocked = await getCache<boolean>(lockKey)
  
  if (isLocked) {
    console.warn('⚠️ 이전 코인 Cron이 아직 실행 중입니다.')
    return
  }
  
  // Lock 설정 (5분 TTL)
  await setCache(lockKey, true, 300)
  console.log('🔒 코인 가격 갱신 Lock 설정')

  try {
    // 1️⃣ 전체 마켓 리스트 가져오기
    const marketsResponse = await fetch(`${UPBIT_API_BASE_URL}/market/all`)
    const allMarkets: any = await marketsResponse.json()
    
    // KRW 마켓만 필터링
    const krwMarkets: string[] = allMarkets
      .filter((m: any) => m.market.startsWith('KRW-'))
      .map((m: any) => m.market)
    
    console.log(`🚀 코인 갱신 시작: ${krwMarkets.length}개`)

    // 2️⃣ Ticker (현재가) 일괄 조회
    const tickerResponse = await fetch(
      `${UPBIT_API_BASE_URL}/ticker?markets=${krwMarkets.join(',')}`
    )
    const tickers: any = await tickerResponse.json()
    
    // Ticker 캐시 저장
    for (const ticker of tickers) {
      await setCache(`upbit-ticker:${ticker.market}`, [ticker], 200)
    }

    // 3️⃣ Candles - 배치 병렬 처리 (초당 8개씩)
    let successCount = 0
    let failedCount = 0
    const failedRequests: Array<{ market: string; interval: string }> = []
    
    // 모든 요청 목록 생성
    const allRequests: Array<{ market: string; interval: string }> = []
    for (const market of krwMarkets) {
      for (const interval of TIME_INTERVALS) {
        allRequests.push({ market, interval })
      }
    }
    
    const totalBatches = Math.ceil(allRequests.length / RATE_LIMIT_PER_SECOND)
    console.log(`📊 ${allRequests.length}개 요청 → ${totalBatches}개 배치 (예상: ${totalBatches}초)`)
    
    // 초당 8개씩 배치 처리 (스마트 대기)
    for (let i = 0; i < allRequests.length; i += RATE_LIMIT_PER_SECOND) {
      const batchStartTime = Date.now()
      const batch = allRequests.slice(i, i + RATE_LIMIT_PER_SECOND)
      
      // 배치 내 병렬 처리
      const results = await Promise.allSettled(
        batch.map(async ({ market, interval }) => {
          try {
            const candleData = await fetchCandleData(market, interval)
            
            if (candleData) {
              await setCache(
                `upbit-candles:${market}:${interval}`,
                candleData,
                200
              )
              return { success: true }
            } else {
              failedRequests.push({ market, interval })
              return { success: false }
            }
          } catch (error: any) {
            if (error.message?.includes('429')) {
              failedRequests.push({ market, interval })
            } else {
              console.error(`❌ ${market} ${interval}: ${error.message}`)
            }
            return { success: false }
          }
        })
      )
      
      // 성공/실패 카운트
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++
        } else {
          failedCount++
        }
      })
      
      // 다음 배치 전 스마트 대기
      if (i + RATE_LIMIT_PER_SECOND < allRequests.length) {
        const elapsed = Date.now() - batchStartTime
        const waitTime = Math.max(0, 1000 - elapsed)
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    // 4️⃣ 실패한 요청 재시도
    if (failedRequests.length > 0) {
      console.log(`🔄 ${failedRequests.length}개 재시도 중...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      let retrySuccess = 0
      
      for (let i = 0; i < failedRequests.length; i += RATE_LIMIT_PER_SECOND) {
        const retryStartTime = Date.now()
        const retryBatch = failedRequests.slice(i, i + RATE_LIMIT_PER_SECOND)
        
        const retryResults = await Promise.allSettled(
          retryBatch.map(async ({ market, interval }) => {
            try {
              const candleData = await fetchCandleData(market, interval)
              
              if (candleData) {
                await setCache(
                  `upbit-candles:${market}:${interval}`,
                  candleData,
                  200
                )
                return { success: true }
              }
              return { success: false }
            } catch (error: any) {
              console.warn(`⚠️ ${market} ${interval} 재시도 실패`)
              return { success: false }
            }
          })
        )
        
        retryResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            retrySuccess++
          }
        })
        
        // 다음 재시도 배치 전 스마트 대기
        if (i + RATE_LIMIT_PER_SECOND < failedRequests.length) {
          const elapsed = Date.now() - retryStartTime
          const waitTime = Math.max(0, 1000 - elapsed)
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime))
          }
        }
      }
      
      successCount += retrySuccess
      failedCount -= retrySuccess
      console.log(`✅ 재시도 완료: ${retrySuccess}/${failedRequests.length}개 성공`)
    }

    const duration = Date.now() - startTime
    console.log(`✅ 코인 가격 갱신 완료: ${successCount}개 성공, ${failedCount}개 실패 (${(duration / 1000).toFixed(1)}초)`)

  } catch (error) {
    console.error('❌ 코인 가격 갱신 실패:', error)
  } finally {
    // Lock 해제
    await setCache(lockKey, false, 1)
    console.log('🔓 코인 가격 갱신 Lock 해제')
  }
}

/**
 * Candle 데이터 조회 및 등락률 계산
 */
async function fetchCandleData(market: string, interval: string): Promise<any> {
  try {
    const config = getCandleConfig(interval)
    
    const response = await fetch(
      `${UPBIT_API_BASE_URL}/candles/${config.endpoint}?market=${market}&count=${config.count}`
    )

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('HTTP 429 - Rate Limit')
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const candles: any = await response.json()

    if (candles.length < 2) {
      return {
        success: true,
        data: {
          market,
          interval,
          currentPrice: candles[0]?.trade_price || 0,
          changeRate: 0
        }
      }
    }

    const currentCandle = candles[0]
    const previousCandle = candles[candles.length - 1]
    const changeRate = (currentCandle.trade_price - previousCandle.opening_price) / previousCandle.opening_price

    return {
      success: true,
      data: {
        market,
        interval,
        currentPrice: currentCandle.trade_price,
        previousPrice: previousCandle.opening_price,
        changeRate,
        changePercent: changeRate * 100,
        candles: candles.slice(0, 5)
      },
      timestamp: Date.now()
    }

  } catch (error: any) {
    if (error.message?.includes('429')) {
      throw error
    }
    throw error
  }
}

/**
 * Candle endpoint 설정
 */
function getCandleConfig(interval: string): { endpoint: string; count: number } {
  switch (interval) {
    case '1h':
      return { endpoint: 'minutes/60', count: 2 }
    case '24h':
      return { endpoint: 'days', count: 2 }
    case '7d':
      return { endpoint: 'days', count: 8 }
    case '30d':
      return { endpoint: 'days', count: 31 }
    default:
      return { endpoint: 'days', count: 2 }
  }
}
