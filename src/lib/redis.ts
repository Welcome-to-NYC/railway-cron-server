/**
 * Redis 클라이언트 (ioredis)
 * Railway 서버에서 Redis에 연결
 */

import Redis from 'ioredis'

// Redis 클라이언트 (싱글톤)
let redisClient: Redis | null = null

function getRedisClient(): Redis {
  if (!redisClient) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL 환경 변수가 설정되지 않았습니다')
    }
    
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null
        return Math.min(times * 200, 1000)
      }
    })
    
    console.log('✅ Redis 클라이언트 연결 완료')
  }
  
  return redisClient
}

/**
 * 캐시 저장
 */
export async function setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
  try {
    const redis = getRedisClient()
    
    if (ttl) {
      await redis.setex(key, ttl, JSON.stringify(value))
    } else {
      await redis.set(key, JSON.stringify(value))
    }
    
    // 성공 로그 제거 (너무 많음)
  } catch (error) {
    console.error(`❌ Cache save failed: ${key}`, error)
    throw error
  }
}

/**
 * 캐시 읽기
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient()
    const data = await redis.get(key)
    
    if (!data) return null
    
    return JSON.parse(data) as T
  } catch (error) {
    console.error(`❌ Cache read failed: ${key}`, error)
    return null
  }
}

/**
 * 캐시 삭제
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const redis = getRedisClient()
    await redis.del(key)
    console.log(`🗑️ Cache deleted: ${key}`)
  } catch (error) {
    console.error(`❌ Cache delete failed: ${key}`, error)
  }
}

/**
 * 캐시 존재 확인
 */
export async function hasCache(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient()
    const exists = await redis.exists(key)
    return exists === 1
  } catch (error) {
    console.error(`❌ Cache exists check failed: ${key}`, error)
    return false
  }
}
