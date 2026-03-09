// 역지오코딩 서비스 - 좌표를 주소로 변환

// Nominatim (OpenStreetMap) 무료 역지오코딩 서비스
export async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=ko,en`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MemoryMoments/1.0 (contact@example.com)' // 필수 User-Agent
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (!data || data.error) {
      console.warn('역지오코딩 실패:', data?.error || 'Unknown error')
      return null
    }
    
    // 주소 정보 추출 및 정리
    const address = data.address || {}
    const displayName = data.display_name || ''
    
    return {
      // 전체 주소
      fullAddress: displayName,
      
      // 상세 주소 구성요소
      country: address.country || null,
      countryCode: address.country_code || null,
      state: address.state || address.province || null,
      city: address.city || address.town || address.village || null,
      district: address.district || address.county || null,
      neighbourhood: address.neighbourhood || address.suburb || null,
      road: address.road || address.street || null,
      houseNumber: address.house_number || null,
      postcode: address.postcode || null,
      
      // 관심지점 (POI)
      poi: address.amenity || address.shop || address.tourism || address.leisure || null,
      
      // 짧은 주소 (도시, 구/군 레벨)
      shortAddress: [address.city || address.town, address.district || address.county]
        .filter(Boolean)
        .join(', ') || displayName.split(',').slice(0, 2).join(',').trim(),
      
      // 원본 데이터
      raw: data
    }
    
  } catch (error) {
    console.error('역지오코딩 오류:', error)
    return null
  }
}

// 구글 지오코딩 API (API 키 필요시)
export async function reverseGeocodeGoogle(lat, lon, apiKey) {
  if (!apiKey) {
    console.warn('Google Geocoding API 키가 없습니다.')
    return null
  }
  
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=ko`
    
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.status !== 'OK' || !data.results?.length) {
      console.warn('Google 역지오코딩 실패:', data.status)
      return null
    }
    
    const result = data.results[0]
    const components = {}
    
    // 주소 구성요소 파싱
    result.address_components.forEach(component => {
      const types = component.types
      if (types.includes('country')) {
        components.country = component.long_name
        components.countryCode = component.short_name
      } else if (types.includes('administrative_area_level_1')) {
        components.state = component.long_name
      } else if (types.includes('locality')) {
        components.city = component.long_name
      } else if (types.includes('sublocality') || types.includes('administrative_area_level_2')) {
        components.district = component.long_name
      } else if (types.includes('route')) {
        components.road = component.long_name
      } else if (types.includes('street_number')) {
        components.houseNumber = component.long_name
      } else if (types.includes('postal_code')) {
        components.postcode = component.long_name
      }
    })
    
    return {
      fullAddress: result.formatted_address,
      shortAddress: [components.city, components.district].filter(Boolean).join(', '),
      ...components,
      raw: result
    }
    
  } catch (error) {
    console.error('Google 역지오코딩 오류:', error)
    return null
  }
}

// 캐시를 사용한 역지오코딩 (같은 좌표에 대한 중복 요청 방지)
const geocodeCache = new Map()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24시간

export async function reverseGeocodeWithCache(lat, lon) {
  // 소수점 4자리로 반올림해서 캐시 키 생성 (약 11m 정확도)
  const roundedLat = Math.round(lat * 10000) / 10000
  const roundedLon = Math.round(lon * 10000) / 10000
  const cacheKey = `${roundedLat},${roundedLon}`
  
  // 캐시 확인
  const cached = geocodeCache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data
  }
  
  // API 호출
  const result = await reverseGeocode(roundedLat, roundedLon)
  
  // 캐시 저장
  if (result) {
    geocodeCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    })
    
    // 캐시 크기 제한 (최대 100개 항목)
    if (geocodeCache.size > 100) {
      const firstKey = geocodeCache.keys().next().value
      geocodeCache.delete(firstKey)
    }
  }
  
  return result
}