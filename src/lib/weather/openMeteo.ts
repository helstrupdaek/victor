import type { VenueLocation, WeatherSnapshot } from '@/types'

/**
 * Open-Meteo is free and keyless, so the weather section can hit it
 * directly from the browser with no backend/secret to manage. Forecasts
 * are only reliable ~16 days out; beyond that we fall back to real
 * historical averages instead of ever inventing numbers.
 */
export const FORECAST_HORIZON_DAYS = 10

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive'
const SEASONAL_YEARS_BACK = 8

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function describeCondition(
  weatherCode: number,
  precipProbability: number | null,
  precipSumMm: number | null,
): string {
  const isWet = (precipProbability ?? 0) >= 30 || (precipSumMm ?? 0) >= 1
  if (isWet) {
    if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Sne'
    if ([95, 96, 99].includes(weatherCode)) return 'Tordenvejr'
    return 'Regn'
  }
  if ([45, 48].includes(weatherCode)) return 'Tåget'
  if (weatherCode <= 1) return 'Tørvejr og sol'
  return 'Tørvejr'
}

function clothingTip(tempC: number, isWet: boolean): string {
  if (isWet) {
    return tempC < 12
      ? 'Tag regntøj og en varm jakke med.'
      : 'Husk en paraply eller en let regnjakke.'
  }
  if (tempC < 10) return 'Det ser ud til at blive køligt — en varm jakke er en god idé.'
  if (tempC < 16) return 'En jakke til aftenen er en god idé.'
  if (tempC < 21) return 'Et let lag, som en striktrøje, er nok.'
  return 'Det ser ud til at blive varmt — let tøj er nok.'
}

interface DailyForecastResponse {
  daily: {
    time: string[]
    temperature_2m_max: number[]
    precipitation_probability_max: number[]
    windspeed_10m_max: number[]
    weathercode: number[]
  }
}

export async function fetchForecast(
  location: VenueLocation,
  targetDate: Date,
): Promise<WeatherSnapshot | null> {
  const isoDate = toIsoDate(targetDate)
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set(
    'daily',
    'temperature_2m_max,precipitation_probability_max,windspeed_10m_max,weathercode',
  )
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', isoDate)
  url.searchParams.set('end_date', isoDate)

  const response = await fetch(url.toString())
  if (!response.ok) return null
  const data = (await response.json()) as DailyForecastResponse
  const index = data.daily.time.indexOf(isoDate)
  if (index === -1) return null

  const temperatureC = data.daily.temperature_2m_max[index]
  const precipitationProbability = data.daily.precipitation_probability_max[index] ?? null
  const windKph = data.daily.windspeed_10m_max[index]
  const weatherCode = data.daily.weathercode[index]
  const isWet = (precipitationProbability ?? 0) >= 30

  return {
    kind: 'forecast',
    temperatureC,
    windKph,
    precipitationProbability,
    conditionLabel: describeCondition(weatherCode, precipitationProbability, null),
    clothingTip: clothingTip(temperatureC, isWet),
    asOf: new Date().toISOString(),
    source: 'Open-Meteo',
  }
}

interface ArchiveDayResponse {
  daily: {
    time: string[]
    temperature_2m_max: number[]
    precipitation_sum: number[]
    windspeed_10m_max: number[]
    weathercode: number[]
  }
}

export async function fetchSeasonalOutlook(
  location: VenueLocation,
  targetDate: Date,
): Promise<WeatherSnapshot> {
  const currentYear = new Date().getFullYear()
  const years = Array.from(
    { length: SEASONAL_YEARS_BACK },
    (_, i) => currentYear - 1 - i,
  ).filter((year) => year < currentYear)

  const requests = years.map(async (year) => {
    const date = new Date(year, targetDate.getMonth(), targetDate.getDate())
    const isoDate = toIsoDate(date)
    const url = new URL(ARCHIVE_ENDPOINT)
    url.searchParams.set('latitude', String(location.lat))
    url.searchParams.set('longitude', String(location.lon))
    url.searchParams.set(
      'daily',
      'temperature_2m_max,precipitation_sum,windspeed_10m_max,weathercode',
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('start_date', isoDate)
    url.searchParams.set('end_date', isoDate)

    const response = await fetch(url.toString())
    if (!response.ok) return null
    const data = (await response.json()) as ArchiveDayResponse
    if (data.daily.time.length === 0) return null
    return {
      temperatureC: data.daily.temperature_2m_max[0],
      precipitationSum: data.daily.precipitation_sum[0],
      windKph: data.daily.windspeed_10m_max[0],
      weatherCode: data.daily.weathercode[0],
    }
  })

  const results = (await Promise.all(requests)).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  )

  if (results.length === 0) {
    throw new Error('Kunne ikke hente historisk vejrdata.')
  }

  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
  const temperatureC = avg(results.map((r) => r.temperatureC))
  const windKph = avg(results.map((r) => r.windKph))
  const wetDays = results.filter((r) => r.precipitationSum >= 1).length
  const precipitationProbability = Math.round((wetDays / results.length) * 100)
  const mostCommonWeatherCode = results[0].weatherCode
  const isWet = precipitationProbability >= 30

  return {
    kind: 'seasonal-outlook',
    temperatureC: Math.round(temperatureC * 10) / 10,
    windKph: Math.round(windKph * 10) / 10,
    precipitationProbability,
    conditionLabel: describeCondition(mostCommonWeatherCode, precipitationProbability, null),
    clothingTip: clothingTip(temperatureC, isWet),
    asOf: new Date().toISOString(),
    source: `Open-Meteo historik, gennemsnit af ${results.length} år`,
  }
}
