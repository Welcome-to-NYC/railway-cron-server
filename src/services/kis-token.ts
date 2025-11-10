/**
 * 한국투자증권 API 토큰 관리
 */

import { getCache, setCache } from '../lib/redis'

const TOKEN_TTL = 23 * 60 * 60 // 23시간

/**
 * 환경에 따른 캐시 키 생성 (모의계좌/실전계좌 구분)
 */
function getTokenCacheKey(): string {
  const baseUrl = process.env.KIS_BASE_URL || ''
  const isVTS = baseUrl.includes('vts')  // 모의계좌 여부
  return isVTS ? 'kis-token-vts' : 'kis-token-prod'
}

/**
 * 토큰 가져오기
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    // Redis 캐시 확인 (환경별 키)
    const cacheKey = getTokenCacheKey()
    const cached = await getCache<{ token: string; expiresAt: number }>(cacheKey)
    
    if (cached && cached.expiresAt > Date.now()) {
      console.log('✅ 캐시된 토큰 사용 (Redis)')
      return cached.token
    }

    // 새 토큰 발급
    const appKey = process.env.KIS_APP_KEY
    const appSecret = process.env.KIS_APP_SECRET
    const baseUrl = process.env.KIS_BASE_URL

    if (!appKey || !appSecret || !baseUrl) {
      console.error('❌ KIS API 환경변수 미설정')
      return null
    }

    console.log('🔑 토큰 발급 시도...')
    
    const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ 토큰 발급 실패: HTTP ${response.status}`)
      console.error('응답:', errorText)
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.access_token) {
      console.error('❌ 토큰 없음:', data)
      throw new Error('토큰 없음')
    }

    // Redis에 캐시 저장 (23시간, 환경별 키)
    const token = data.access_token
    const expiresAt = Date.now() + (23 * 60 * 60 * 1000)
    
    await setCache(cacheKey, { token, expiresAt }, TOKEN_TTL)

    console.log(`✅ 토큰 발급 성공 (${cacheKey}에 저장)`)
    return token

  } catch (error) {
    console.error('❌ 토큰 발급 실패:', error)
    return null
  }
}
