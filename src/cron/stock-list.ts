/**
 * 주식 종목 리스트 갱신
 * 한국투자증권 종목 마스터 파일에서 전체 종목 리스트를 가져와 Redis에 저장
 * 매일 1회 실행
 */

import { setCache } from '../lib/redis'
import AdmZip from 'adm-zip'

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
    // 한투 종목 마스터 파일에서 전종목 데이터 가져오기
    const kospiStocks = await fetchKISStocks('KOSPI')
    const kosdaqStocks = await fetchKISStocks('KOSDAQ')

    const allStocks: StockInfo[] = [...kospiStocks, ...kosdaqStocks]

    // Redis에 저장 (24시간 TTL)
    await setCache('stock-list', allStocks, 24 * 60 * 60)

    console.log(`✅ 종목 리스트 갱신 완료: 총 ${allStocks.length}개`)
    console.log(`   - KOSPI: ${kospiStocks.length}개`)
    console.log(`   - KOSDAQ: ${kosdaqStocks.length}개`)

  } catch (error) {
    console.error('❌ 종목 리스트 갱신 실패:', error)
    throw error
  }
}

/**
 * 한투 종목 마스터 파일에서 종목 정보 가져오기
 */
async function fetchKISStocks(market: 'KOSPI' | 'KOSDAQ'): Promise<StockInfo[]> {
  try {
    const url = market === 'KOSPI'
      ? 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip'
      : 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip'
    
    console.log(`📥 ${market} 종목 마스터 파일 다운로드 중...`)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`한투 마스터 파일 다운로드 실패: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // ZIP 압축 해제
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries()
    
    if (zipEntries.length === 0) {
      throw new Error('ZIP 파일이 비어있습니다')
    }
    
    // 첫 번째 파일 (.mst) 읽기
    const mstFile = zipEntries[0]
    const mstContent = mstFile.getData()
    
    // .mst 파일 파싱 (cp949 인코딩, 고정폭 텍스트)
    const text = mstContent.toString('binary')
    const lines = text.split('\n')
    
    const stocks: StockInfo[] = []
    
    for (const line of lines) {
      if (line.length < 21) continue
      
      // 고정폭 파싱
      const code = line.substring(0, 9).trim()  // 종목코드 (9자리)
      const name = line.substring(21, 40).trim()  // 한글명 (시작 위치 21)
      
      // 유효한 종목만 추가 (6자리 숫자 코드)
      if (/^\d{6}$/.test(code) && name) {
        stocks.push({
          code,
          name,
          market
        })
      }
    }
    
    console.log(`✅ ${market} 종목 파싱 완료: ${stocks.length}개`)
    return stocks

  } catch (error) {
    console.error(`❌ ${market} 종목 조회 실패:`, error)
    throw error
  }
}
