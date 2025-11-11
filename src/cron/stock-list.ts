/**
 * 주식 종목 리스트 갱신
 * Python 스크립트로 한투 종목 마스터 파일 파싱 후 Redis에 저장
 * 매일 1회 실행
 */

import { setCache } from '../lib/redis'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

interface StockInfo {
  code: string
  name: string
  market: 'KOSPI' | 'KOSDAQ'
}

/**
 * 종목 리스트 갱신 메인 함수
 */
export async function updateStockList(): Promise<void> {
  console.log(' 종목 리스트 갱신 시작...')
  
  try {
    // Python 스크립트 실행
    const scriptPath = path.join(__dirname, '../../scripts/fetch_stocks.py')
    const { stdout } = await execAsync(`python3 ${scriptPath}`)
    
    // JSON 파싱
    const allStocks: StockInfo[] = JSON.parse(stdout)
    
    if (!Array.isArray(allStocks) || allStocks.length === 0) {
      throw new Error('Python 스크립트에서 유효한 데이터를 받지 못했습니다')
    }

    // Redis에 저장 (24시간 TTL)
    await setCache('stock-list', allStocks, 24 * 60 * 60)
    
    const kospiCount = allStocks.filter(s => s.market === 'KOSPI').length
    const kosdaqCount = allStocks.filter(s => s.market === 'KOSDAQ').length

    console.log(` 종목 리스트 갱신 완료: 총 ${allStocks.length}개`)
    console.log(`   - KOSPI: ${kospiCount}개`)
    console.log(`   - KOSDAQ: ${kosdaqCount}개`)

  } catch (error) {
    console.error(' 종목 리스트 갱신 실패:', error)
    throw error
  }
}

