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
    
    // Buffer를 줄 단위로 분리 (0x0A = \n)
    const lines: Buffer[] = []
    let start = 0
    for (let i = 0; i < mstContent.length; i++) {
      if (mstContent[i] === 0x0A) {  // \n
        lines.push(mstContent.subarray(start, i))
        start = i + 1
      }
    }
    if (start < mstContent.length) {
      lines.push(mstContent.subarray(start))
    }
    
    const stocks: StockInfo[] = []
    
    for (const lineBytes of lines) {
      // 최소 길이 체크
      if (lineBytes.length < backLength + 21) continue
      
      // 바이트 단위로 정확하게 슬라이싱 (구조체 기반)
      const codeBytes = lineBytes.subarray(0, 9)                                      // 단축코드
      const nameBytes = lineBytes.subarray(21, lineBytes.length - backLength)        // 한글명
      const scrtGrpBytes = lineBytes.subarray(lineBytes.length - backLength, lineBytes.length - backLength + 2)  // 증권그룹구분
      
      // cp949로 디코딩
      const code = iconv.decode(codeBytes, 'cp949').trim()
      const name = iconv.decode(nameBytes, 'cp949').trim()
      const scrtGrpCode = iconv.decode(scrtGrpBytes, 'cp949')
      
      // 6자리 숫자 코드 + 일반 주식(ST)만 필터링
      if (/^\d{6}$/.test(code) && name && scrtGrpCode === 'ST') {
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
