import { daysUntil } from '@/lib/utils'
import type { VenueLocation, WeatherSnapshot } from '@/types'
import { FORECAST_HORIZON_DAYS, fetchForecast, fetchSeasonalOutlook } from './openMeteo'

/**
 * Single entry point the UI calls. Swapping weather providers later means
 * changing this file (and openMeteo.ts) — nothing in the Vejret section
 * needs to know which API is behind it.
 */
export async function getWeatherOutlook(
  location: VenueLocation,
  targetDate: Date,
): Promise<WeatherSnapshot> {
  const days = daysUntil(targetDate)

  if (days >= 0 && days <= FORECAST_HORIZON_DAYS) {
    const forecast = await fetchForecast(location, targetDate)
    if (forecast) return forecast
  }

  return fetchSeasonalOutlook(location, targetDate)
}

export { FORECAST_HORIZON_DAYS }
