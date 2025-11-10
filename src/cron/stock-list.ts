/**
 * 주식 종목 리스트 갱신
 * KRX에서 전체 종목 리스트를 가져와 Redis에 저장
 * 매일 1회 실행
 */

import { setCache } from '../lib/redis'

interface StockInfo {
  code: string
  name: string
  market: 'KOSPI' | 'KOSDAQ'
}

/**
 * 종목 리스트 갱신 메인 함수
 */
export async function updateStockList(): Promise<void> {
  console.log('📋 종목 리스트 갱신 시작...')

  try {
    // KRX API에서 전종목 데이터 가져오기
    const kospiStocks = await fetchKRXStocks('KOSPI')
    const kosdaqStocks = await fetchKRXStocks('KOSDAQ')

    const allStocks: StockInfo[] = [...kospiStocks, ...kosdaqStocks]

    // Redis에 저장 (24시간 TTL)
    await setCache('stock-list', allStocks, 24 * 60 * 60)

    console.log(`✅ 종목 리스트 갱신 완료: 총 ${allStocks.length}개`)
    console.log(`   - KOSPI: ${kospiStocks.length}개`)
    console.log(`   - KOSDAQ: ${kosdaqStocks.length}개`)

  } catch (error) {
    console.error('❌ 종목 리스트 갱신 실패:', error)
  }
}

/**
 * KRX API에서 종목 정보 가져오기
 */
async function fetchKRXStocks(market: 'KOSPI' | 'KOSDAQ'): Promise<StockInfo[]> {
  try {
    // KRX 오픈 API 사용
    const marketCode = market === 'KOSPI' ? 'STK' : 'KSQ'
    
    const response = await fetch('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
      },
      body: new URLSearchParams({
        'bld': 'dbms/MDC/STAT/standard/MDCSTAT01901',
        'mktId': marketCode,
        'share': '1',
        'csvxls_isNo': 'false',
      })
    })

    if (!response.ok) {
      throw new Error(`KRX API 오류: ${response.status}`)
    }

    const data: any = await response.json()
    
    // KRX API 응답 형식에 맞게 파싱
    const stocks: StockInfo[] = data.OutBlock_1?.map((item: any) => ({
      code: item.ISU_SRT_CD?.padStart(6, '0') || item.SHORT_CODE?.padStart(6, '0'),
      name: item.ISU_ABBRV || item.ISU_NM,
      market
    })) || []

    // 유효한 종목만 필터링 (코드가 6자리 숫자)
    return stocks.filter(stock => 
      stock.code && 
      stock.name && 
      /^\d{6}$/.test(stock.code)
    )

  } catch (error) {
    console.error(`❌ ${market} 종목 조회 실패:`, error)
    return []
  }
}
