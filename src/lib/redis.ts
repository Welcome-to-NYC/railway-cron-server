/**
 * Vercel KV (Redis) 클라이언트
 * Railway 서버에서 Vercel KV에 연결
 */

import { createClient } from '@vercel/kv'

// Vercel KV 클라이언트 생성
export const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

/**
 * 캐시 저장
 */
export async function setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
  try {
    if (ttl) {
      await kv.set(key, JSON.stringify(value), { ex: ttl })
    } else {
      await kv.set(key, JSON.stringify(value))
    }
    console.log(`✅ Cache saved: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`)
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
    const data = await kv.get<string>(key)
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
    await kv.del(key)
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
    const exists = await kv.exists(key)
    return exists === 1
  } catch (error) {
    console.error(`❌ Cache exists check failed: ${key}`, error)
    return false
  }
}
