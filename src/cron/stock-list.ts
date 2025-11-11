/**
 * 주식 종목 리스트 갱신
 * 한국투자증권 종목 마스터 파일에서 전체 종목 리스트를 가져와 Redis에 저장
 * 매일 1회 실행
 */

import { setCache } from '../lib/redis'
import AdmZip from 'adm-zip'
import * as iconv from 'iconv-lite'

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
    
    // KOSPI: 뒤 228바이트, KOSDAQ: 뒤 222바이트
    const backLength = market === 'KOSPI' ? 228 : 222
    
    // cp949로 전체 디코딩 후 줄 단위 분리
    const text = iconv.decode(mstContent, 'cp949')
    const lines = text.split('\n')
    
    const stocks: StockInfo[] = []
    let totalLines = 0
    let stCount = 0
    let otherCount = 0
    
    for (const row of lines) {
      if (row.length < backLength + 21) continue
      totalLines++
      
      // Python 코드 그대로: 앞부분과 뒷부분 분리
      const rf1 = row.substring(0, row.length - backLength)  // 앞부분
      const rf2 = row.substring(row.length - backLength)     // 뒷부분 (228 or 222)
      
      // 앞부분 파싱
      const code = rf1.substring(0, 9).trim()   // 단축코드
      const name = rf1.substring(21).trim()     // 한글명
      
      // 뒷부분 파싱 (field_specs 첫번째: 그룹코드 2자리)
      const 그룹코드 = rf2.substring(0, 2)
      
      // 디버깅 (첫 5개만)
      if (totalLines <= 5) {
        console.log(`[${market}] code: ${code}, name: ${name}, 그룹코드: "${그룹코드}"`)
      }
      
      if (그룹코드 === 'ST') stCount++
      else otherCount++
      
      // 6자리 숫자 코드 + 일반 주식(ST)만 필터링
      if (/^\d{6}$/.test(code) && name && 그룹코드 === 'ST') {
        stocks.push({
          code,
          name,
          market
        })
      }
    }
    
    console.log(`[${market}] 총 ${totalLines}줄, ST: ${stCount}개, 기타: ${otherCount}개`)
    
    console.log(`✅ ${market} 종목 파싱 완료: ${stocks.length}개`)
    return stocks

  } catch (error) {
    console.error(`❌ ${market} 종목 조회 실패:`, error)
    throw error
  }
}
