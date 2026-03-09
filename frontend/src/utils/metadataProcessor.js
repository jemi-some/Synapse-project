// 메타데이터 처리 유틸리티 함수들
import { reverseGeocodeWithCache } from '../services/geocoding'

function toAspectRatio(w, h) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h);
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

function parseFlashOn(flash) {
  if (typeof flash === "string") return /fired/i.test(flash);
  return false;
}

function normalizeColorSpace(raw) {
  const cs = raw?.ColorSpace;
  const desc = raw?.ProfileDescription || raw?.ColorSpaceData;
  if (desc?.toLowerCase().includes("display p3")) return "Display P3";
  if (typeof cs === "string" && /sRGB/i.test(cs)) return "sRGB";
  if (typeof desc === "string" && /adobe\s*rgb/i.test(desc)) return "AdobeRGB";
  return "Unknown";
}

function toLocalISO(dateInput, offset) {
  if (!dateInput) return { utc: null, local: null };
  
  try {
    let date;
    
    // Date 객체인 경우
    if (dateInput instanceof Date) {
      date = dateInput;
    }
    // 문자열인 경우 
    else if (typeof dateInput === 'string') {
      // EXIF 형식인 경우: "2024:08:14 19:50:30" -> "2024-08-14T19:50:30"
      if (dateInput.includes(':')) {
        const processedDate = dateInput.replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/, '$1-$2-$3T$4');
        date = new Date(processedDate);
      } else {
        date = new Date(dateInput);
      }
    }
    else {
      return { utc: null, local: null };
    }
    
    const utc = date.toISOString();
    
    // 오프셋이 없으면 현재 시간대 사용
    if (!offset) {
      const timezoneOffset = date.getTimezoneOffset();
      const sign = timezoneOffset > 0 ? '-' : '+';
      const hours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
      const minutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
      const localOffset = `${sign}${hours}:${minutes}`;
      const local = new Date(date.getTime() - timezoneOffset * 60000).toISOString().replace("Z", localOffset);
      return { utc, local };
    }
    
    const match = offset.match(/([+-])(\d{2}):(\d{2})/);
    if (!match) return { utc, local: utc };
    
    const [, sign, hh, mm] = match;
    const m = (parseInt(hh) * 60 + parseInt(mm)) * (sign === "-" ? -1 : 1);
    const localMs = date.getTime() + m * 60_000;
    const local = new Date(localMs).toISOString().replace("Z", offset);
    return { utc, local };
  } catch (error) {
    console.warn('날짜 변환 오류:', error, dateInput);
    return { utc: null, local: null };
  }
}

function timeBuckets(localISO) {
  if (!localISO) return { weekday: null, timeOfDay: null, season: null };
  
  try {
    const dt = new Date(localISO.replace(/([+-]\d{2}):(\d{2})$/, "$1$2"));
    const hour = parseInt(localISO.slice(11, 13));
    const month = parseInt(localISO.slice(5, 7));
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getUTCDay()];
    const timeOfDay = hour < 5 ? "night" : hour < 11 ? "morning" : hour < 16 ? "afternoon" : hour < 20 ? "evening" : "night";
    const season = month>=3 && month<=5 ? "spring" : month<=8 ? "summer" : month<=11 ? "autumn" : "winter";
    return { weekday: wd, timeOfDay, season };
  } catch (error) {
    console.warn('시간 버킷 계산 오류:', error);
    return { weekday: null, timeOfDay: null, season: null };
  }
}

export async function extractForAestheticAI(json) {
  const raw = json?.raw_metadata || json || {};
  const gps = json?.gps || {};
  
  // 이미지 크기
  const width = raw.ExifImageWidth ?? raw.ImageWidth ?? json?.image?.width;
  const height = raw.ExifImageHeight ?? raw.ImageHeight ?? json?.image?.height;
  
  // 시간 정보 처리 - 다양한 경로에서 날짜 찾기
  let dateOriginal = raw.DateTimeOriginal || raw.DateTime || raw.CreateDate || 
                     json?.dateTime?.original || json?.CreateDate || json?.DateTime;
  
  // 날짜를 못 찾으면 파일의 lastModified 시간 사용
  if (!dateOriginal && json?.lastModified) {
    dateOriginal = json.lastModified;
  }
  
  const offset = raw.OffsetTimeOriginal || raw.OffsetTime;
  const { utc, local } = toLocalISO(dateOriginal, offset);
  const tb = timeBuckets(local || utc);

  // 촬영 설정
  const shutter = raw.ExposureTime ?? json?.settings?.shutterSpeed;
  const iso = raw.ISO ?? json?.settings?.iso ?? null;
  const fnum = raw.FNumber ?? json?.settings?.aperture ?? null;

  // 조명 조건 분석
  const lightCondition =
    (iso ?? 0) <= 80 && (shutter ?? 0) >= 1/120 ? "bright"
    : (iso ?? 0) > 400 || (shutter ?? 1) < 1/60 ? "dim"
    : "normal";

  // 모션 블러 위험도 계산
  const fl35 = raw.FocalLengthIn35mmFormat ?? raw.FocalLength;
  const blurThreshold = fl35 ? 1 / (2 * fl35) : 1/60;
  const motionBlurRisk =
    shutter && shutter < blurThreshold ? (shutter < blurThreshold/2 ? "high" : "medium") : "low";

  // 화면비 계산
  const aspectRatio = (width && height) ? toAspectRatio(width, height) : null;

  // 파일명에서 주제 힌트 추출
  const fileName = json?.name || json?.fileName || json?.file_name;
  let subjectHint = undefined;
  if (fileName) {
    if (/치킨|chicken/i.test(fileName)) subjectHint = "치킨, 음식";
    else if (/음식|food|요리|meal/i.test(fileName)) subjectHint = "음식";
    else if (/풍경|landscape|자연|nature/i.test(fileName)) subjectHint = "풍경, 자연";
    else if (/인물|portrait|사람|people/i.test(fileName)) subjectHint = "인물";
    else if (/동물|animal|고양이|개|cat|dog/i.test(fileName)) subjectHint = "동물";
  }

  // 위치 정보 처리 및 주소 조회
  let locationData = {
    hasLocation: gps.latitude != null && gps.longitude != null,
    lat: gps.latitude ?? null,
    lon: gps.longitude ?? null,
    alt: gps.altitude ?? null
  }
  
  // GPS 좌표가 있으면 주소 정보 조회
  if (locationData.hasLocation) {
    try {
      const addressInfo = await reverseGeocodeWithCache(locationData.lat, locationData.lon)
      
      if (addressInfo) {
        locationData = {
          ...locationData,
          // 주소 정보 추가
          fullAddress: addressInfo.fullAddress,
          shortAddress: addressInfo.shortAddress,
          country: addressInfo.country,
          countryCode: addressInfo.countryCode,
          state: addressInfo.state,
          city: addressInfo.city,
          district: addressInfo.district,
          neighbourhood: addressInfo.neighbourhood,
          road: addressInfo.road,
          poi: addressInfo.poi
        }
      }
    } catch (error) {
      console.error('주소 조회 중 오류:', error)
    }
  }

  return {
    fileName,
    captureTime: {
      utc,
      local,
      timezoneOffset: offset,
      weekday: tb.weekday,
      timeOfDay: tb.timeOfDay,
      season: tb.season
    },
    camera: {
      make: raw.Make || json?.camera?.make,
      model: raw.Model || json?.camera?.model,
      lensModel: raw.LensModel || json?.camera?.lens
    },
    settings: {
      iso,
      aperture: fnum,
      shutterSeconds: shutter,
      wb: raw.WhiteBalance ?? "Auto",
      flashOn: parseFlashOn(raw.Flash),
      metering: raw.MeteringMode,
      program: raw.ExposureProgram,
      focalLengthMm: raw.FocalLength,
      focalLength35mm: fl35
    },
    image: {
      width,
      height,
      orientation: height > width ? "Vertical" : "Horizontal",
      megapixels: width && height ? Math.round((width*height)/1e5)/10 : null,
      aspectRatio
    },
    color: {
      space: normalizeColorSpace(raw)
    },
    location: locationData,
    derived: {
      lightCondition,
      motionBlurRisk,
      subjectHint
    }
  };
}