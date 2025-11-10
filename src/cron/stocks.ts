/**
 * 주식 가격 Cron Job
 * 5분마다 전체 주식 가격을 갱신하여 Vercel KV에 저장
 */

import { getAccessToken } from '../services/kis-token'
import { setCache, getCache } from '../lib/redis'
import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'

// 타입 정의
interface StockPrice {
  code: string
  currentPrice: number
  changeRate: number
  change: number
  prevClose: number
  high: number
  low: number
  open: number
  volume: number
  marketCap: number
  isUp: boolean
  isDown: boolean
  isFlat: boolean
  changeRateAbs: number
  changeAbs: number
  changeRateFormatted: string
  changePriceFormatted: string
  currentPriceFormatted: string
  lastUpdated: string
}

interface StockPriceCache {
  prices: Record<string, StockPrice>
  lastUpdated: string
}

class KisApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public msgCode: string
  ) {
    super(message)
    this.name = 'KisApiError'
  }
}

const KIS_BASE_URL = process.env.KIS_BASE_URL || ''
const KIS_APP_KEY = process.env.KIS_APP_KEY || ''
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || ''
const TIMEOUT_MS = 280000 // 280초
const DELAY_BETWEEN_REQUESTS = 67 // 67ms = 초당 15개
const CACHE_UPDATE_CHUNK = 100

/**
 * 주식 가격 갱신 메인 함수
 */
export async function updateStockPrices(): Promise<void> {
  const startTime = Date.now()
  
  // 🔒 중복 실행 방지
  const lockKey = 'cron:update-prices:lock'
  const isLocked = await getCache<boolean>(lockKey)
  
  if (isLocked) {
    console.warn('⚠️ 이전 주식 Cron이 아직 실행 중입니다.')
    return
  }
  
  // Lock 설정 (5분 TTL)
  await setCache(lockKey, true, 300)
  console.log('🔒 주식 가격 갱신 Lock 설정')

  try {
    // 1️⃣ 전체 종목 가져오기
    const codes = await getStockCodes()
    console.log(`📊 대상 종목: ${codes.length}개`)

    // 2️⃣ 토큰 가져오기
    const token = await getAccessToken()
    if (!token) {
      throw new Error('토큰 발급 실패')
    }

    // 3️⃣ 가격 갱신
    const result = await fetchPricesIncremental(codes, token, startTime)

    const duration = Date.now() - startTime
    console.log(`✅ 주식 가격 갱신 완료: ${result.successCount}개 성공, ${result.failedCount}개 실패 (${(duration / 1000).toFixed(1)}초)`)

  } catch (error) {
    console.error('❌ 주식 가격 갱신 실패:', error)
  } finally {
    // Lock 해제
    await setCache(lockKey, false, 1)
    console.log('🔓 주식 가격 갱신 Lock 해제')
  }
}

/**
 * CSV에서 종목 코드 가져오기
 */
async function getStockCodes(): Promise<string[]> {
  try {
    // CSV 파일 경로 (data 폴더에 복사 필요)
    const csvPath = path.join(__dirname, '../../data/merged_data_20251031.csv')
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV 파일을 찾을 수 없습니다: ${csvPath}`)
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8')
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })

    const codes = records.map((record: any) => record.code).filter(Boolean)
    console.log(`✅ CSV에서 ${codes.length}개 종목 로드 완료`)
    return codes

  } catch (error) {
    console.error('❌ CSV 로드 실패:', error)
    throw error
  }
}

/**
 * 전체 종목 시간차 발사 처리
 */
async function fetchPricesIncremental(
  codes: string[],
  token: string,
  startTime: number
): Promise<{ successCount: number; failedCount: number }> {
  
  let successCount = 0
  let failedCount = 0
  const failedCodes: string[] = []
  
  // 에러 타입별 집계
  const errorStats = {
    rateLimit: 0,
    delisted: 0,
    suspended: 0,
    timeout: 0,
    network: 0,
    apiError: 0,
    unknown: 0
  }
  
  // Redis에서 기존 캐시 읽기
  const existingCache = await getCache<StockPriceCache>('stock-prices') || {
    prices: {},
    lastUpdated: new Date().toISOString()
  }
  
  // lastUpdated 기준으로 정렬
  const sortedCodes = codes.sort((a, b) => {
    const timeA = existingCache.prices[a]?.lastUpdated || '1970-01-01T00:00:00.000Z'
    const timeB = existingCache.prices[b]?.lastUpdated || '1970-01-01T00:00:00.000Z'
    return timeA.localeCompare(timeB)
  })
  
  console.log(`🔄 정렬 완료: 전체 ${sortedCodes.length}개 종목 시간차 발사 (초당 15개)`)
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  
  // 전체 Promise 생성 (시간차 발사)
  const promises = sortedCodes.map((code, idx) =>
    delay(idx * DELAY_BETWEEN_REQUESTS).then(async () => {
      // 타임아웃 체크
      const elapsed = Date.now() - startTime
      if (elapsed > TIMEOUT_MS) {
        throw new Error('TIMEOUT')
      }
      
      try {
        const result = await fetchSinglePrice(code, token)
        
        if ((idx + 1) % CACHE_UPDATE_CHUNK === 0) {
          console.log(`💾 중간 캐시 업데이트: ${idx + 1}개 완료`)
        }
        
        return { success: true, result, code, errorType: null }
      } catch (error) {
        let errorType = 'unknown'
        let retry = false
        
        if (error instanceof KisApiError) {
          if (error.msgCode === 'EGW00201') {
            errorType = 'rateLimit'
            retry = true
          } else if (error.msgCode === 'EGW00123') {
            errorType = 'delisted'
          } else if (error.msgCode === 'EGW00124') {
            errorType = 'suspended'
          } else {
            errorType = 'apiError'
          }
        } else if (error instanceof Error) {
          if (error.message === 'TIMEOUT') {
            errorType = 'timeout'
          } else if (error.message.includes('fetch') || error.message.includes('network')) {
            errorType = 'network'
          }
        }
        
        return { success: false, result: null, code, retry, errorType }
      }
    })
  )
  
  console.log(`📤 전체 ${promises.length}개 요청 발사 완료 (예상: ${Math.ceil(promises.length * DELAY_BETWEEN_REQUESTS / 1000)}초)`)
  
  // 점진적 결과 처리
  const chunkSize = CACHE_UPDATE_CHUNK
  const retryList: string[] = []
  
  for (let i = 0; i < promises.length; i += chunkSize) {
    const chunk = promises.slice(i, i + chunkSize)
    const settled = await Promise.allSettled(chunk)
    
    const succeeded: StockPrice[] = []
    
    settled.forEach((item, idx) => {
      if (item.status === 'fulfilled') {
        const { success, result, code, retry, errorType } = item.value
        if (success && result) {
          successCount++
          succeeded.push(result)
        } else {
          failedCount++
          failedCodes.push(code)
          if (retry) {
            retryList.push(code)
          }
          
          // 에러 타입별 집계
          if (errorType === 'rateLimit') errorStats.rateLimit++
          else if (errorType === 'delisted') errorStats.delisted++
          else if (errorType === 'suspended') errorStats.suspended++
          else if (errorType === 'timeout') errorStats.timeout++
          else if (errorType === 'network') errorStats.network++
          else if (errorType === 'apiError') errorStats.apiError++
          else errorStats.unknown++
        }
      } else {
        failedCount++
        const code = sortedCodes[i + idx]
        failedCodes.push(code)
        errorStats.unknown++
      }
    })
    
    // 성공한 것들 즉시 캐시 업데이트
    if (succeeded.length > 0) {
      await updateCacheIncremental(existingCache, succeeded)
    }
    
    if ((i + chunkSize) % 500 === 0 || i + chunkSize >= promises.length) {
      console.log(`📊 진행: ${Math.min(i + chunkSize, promises.length)}/${promises.length} (성공: ${successCount}, 실패: ${failedCount})`)
    }
  }
  
  // 에러 통계 로그
  const totalCodes = sortedCodes.length
  console.log(`
✅ 1차 완료:
  - 성공: ${successCount}개 (${(successCount/totalCodes*100).toFixed(1)}%)
  - 실패: ${failedCount}개 (${(failedCount/totalCodes*100).toFixed(1)}%)
    ${errorStats.rateLimit > 0 ? `└ Rate Limit: ${errorStats.rateLimit}개` : ''}
    ${errorStats.delisted > 0 ? `└ 상장폐지: ${errorStats.delisted}개` : ''}
    ${errorStats.suspended > 0 ? `└ 거래정지: ${errorStats.suspended}개` : ''}
    ${errorStats.timeout > 0 ? `└ 타임아웃: ${errorStats.timeout}개` : ''}
    ${errorStats.network > 0 ? `└ 네트워크: ${errorStats.network}개` : ''}
    ${errorStats.apiError > 0 ? `└ API 에러: ${errorStats.apiError}개` : ''}
    ${errorStats.unknown > 0 ? `└ 알 수 없음: ${errorStats.unknown}개` : ''}
  - 재시도 대상: ${retryList.length}개
  `.trim())
  
  // 재시도
  if (retryList.length > 0 && Date.now() - startTime < TIMEOUT_MS) {
    console.log(`🔁 재시도 시작: ${retryList.length}개`)
    
    const retryPromises = retryList.map((code, idx) =>
      delay(idx * DELAY_BETWEEN_REQUESTS).then(async () => {
        try {
          const result = await fetchSinglePrice(code, token)
          return { success: true, result, code }
        } catch {
          return { success: false, result: null, code }
        }
      })
    )
    
    const retrySettled = await Promise.allSettled(retryPromises)
    const retrySucceeded: StockPrice[] = []
    
    retrySettled.forEach((item) => {
      if (item.status === 'fulfilled' && item.value.success) {
        successCount++
        failedCount--
        retrySucceeded.push(item.value.result!)
        const idx = failedCodes.indexOf(item.value.code)
        if (idx > -1) failedCodes.splice(idx, 1)
      }
    })
    
    if (retrySucceeded.length > 0) {
      await updateCacheIncremental(existingCache, retrySucceeded)
      console.log(`✅ 재시도 완료: ${retrySucceeded.length}개 성공`)
    }
  }
  
  return { successCount, failedCount }
}

/**
 * 단일 종목 가격 조회
 */
async function fetchSinglePrice(code: string, token: string): Promise<StockPrice> {
  const response = await fetch(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${code}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': KIS_APP_KEY,
        'appsecret': KIS_APP_SECRET,
        'tr_id': 'FHKST01010100',
        'custtype': 'P'
      }
    }
  )

  const data: any = await response.json()
  
  if (!response.ok) {
    const msgCode = data.msg_cd || 'UNKNOWN'
    const message = data.msg1 || `HTTP ${response.status}`
    throw new KisApiError(message, String(response.status), msgCode)
  }
  
  if (data.rt_cd !== '0') {
    const msgCode = data.msg_cd || 'UNKNOWN'
    const message = data.msg1 || 'API Error'
    throw new KisApiError(message, data.rt_cd, msgCode)
  }

  const output = data.output
  const currentPrice = parseInt(output.stck_prpr || '0')
  const changeRate = parseFloat(output.prdy_ctrt || '0')
  const change = parseInt(output.prdy_vrss || '0')
  const prevClose = currentPrice - change
  
  return {
    code,
    currentPrice,
    changeRate,
    change,
    prevClose,
    high: parseInt(output.stck_hgpr || '0'),
    low: parseInt(output.stck_lwpr || '0'),
    open: parseInt(output.stck_oprc || '0'),
    volume: parseInt(output.acml_vol || '0'),
    marketCap: parseInt(output.hts_avls || '0'),
    isUp: change > 0,
    isDown: change < 0,
    isFlat: change === 0,
    changeRateAbs: Math.abs(changeRate),
    changeAbs: Math.abs(change),
    changeRateFormatted: `${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}%`,
    changePriceFormatted: `${change >= 0 ? '+' : ''}${change.toLocaleString()}원`,
    currentPriceFormatted: currentPrice.toLocaleString() + '원',
    lastUpdated: new Date().toISOString()
  }
}

/**
 * 점진적 캐시 업데이트
 */
async function updateCacheIncremental(cache: StockPriceCache, newPrices: StockPrice[]): Promise<void> {
  try {
    newPrices.forEach(price => {
      cache.prices[price.code] = price
    })
    
    cache.lastUpdated = new Date().toISOString()
    await setCache('stock-prices', cache, 3600)
  } catch (error) {
    console.error('⚠️ 캐시 업데이트 실패:', error)
  }
}
