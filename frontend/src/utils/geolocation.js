// ============================================================
// Geolocation 유틸 — 현재 위치 → 장소명 변환
// ============================================================
//
// 사용처: 기록 전송 시 memories.location_name 저장
// Reverse geocoding: OpenStreetMap Nominatim (무료, API 키 없음)
// 위치 권한 거부 또는 실패 시 null 반환 (저장 차단 없음)
// ============================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const GEO_TIMEOUT = 5000 // 위치 획득 최대 대기 시간 (ms)

/**
 * 기기의 현재 좌표를 가져옵니다.
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
function getCurrentCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null), // 거부 또는 에러 → null
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT, maximumAge: 60000 }
    )
  })
}

/**
 * 좌표를 한국어 장소명으로 변환합니다 (Nominatim reverse geocoding).
 * city → town → suburb → county 순으로 fallback.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string | null>}
 */
async function reverseGeocode(latitude, longitude) {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?lat=${latitude}&lon=${longitude}&format=json&accept-language=ko`,
      { headers: { 'Accept-Language': 'ko' } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const addr = data.address || {}

    const parts = [addr.city, addr.town, addr.suburb].filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
    return addr.county || addr.state || null
  } catch {
    return null
  }
}

/**
 * 현재 위치를 장소명 문자열로 반환합니다.
 * 권한 거부, 타임아웃, API 실패 모두 null로 처리합니다.
 * @returns {Promise<string | null>}
 */
export async function getCurrentLocationName() {
  const coords = await getCurrentCoords()
  if (!coords) return null
  return reverseGeocode(coords.latitude, coords.longitude)
}
