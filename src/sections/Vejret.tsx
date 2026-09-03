import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { CONFIRMATION_DATE, DEFAULT_VENUE_LOCATION } from '@/data/siteConfig'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import { getWeatherOutlook } from '@/lib/weather'
import { formatDanishDateLong } from '@/lib/utils'
import type { VenueLocation, WeatherSnapshot } from '@/types'

function pickWeatherIcon(conditionLabel: string) {
  const label = conditionLabel.toLowerCase()
  if (label.includes('sne')) return CloudSnow
  if (label.includes('torden')) return CloudLightning
  if (label.includes('regn')) return CloudRain
  if (label.includes('tåget')) return CloudFog
  if (label.includes('sol')) return Sun
  return Cloud
}

export function Vejret() {
  const { value: location, isLoading: isLoadingLocation } = useSiteSetting<VenueLocation>(
    'venue_location',
    DEFAULT_VENUE_LOCATION,
  )
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isLoadingLocation) return
    let cancelled = false
    setIsLoading(true)
    getWeatherOutlook(location, CONFIRMATION_DATE)
      .then((result) => {
        if (!cancelled) setWeather(result)
      })
      .catch(() => {
        if (!cancelled) setError('Kunne ikke hente vejrdata lige nu. Prøv igen senere.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isLoadingLocation, location])

  const Icon = weather ? pickWeatherIcon(weather.conditionLabel) : Cloud

  return (
    <section id="vejret" className="scroll-mt-24 bg-green-900 py-24 text-cream-50 sm:py-32">
      <Container className="max-w-3xl">
        <SectionHeading
          eyebrow="Vejret"
          title={`Vejret ${formatDanishDateLong(CONFIRMATION_DATE)}`}
          description={
            weather?.kind === 'forecast'
              ? 'Den aktuelle vejrudsigt.'
              : 'Vi kender endnu ikke den præcise vejrudsigt — herunder ser du et historisk gennemsnit for dagen. Den rigtige prognose kommer, når vi nærmer os datoen.'
          }
          className="[&_h2]:text-cream-50 [&_p]:text-cream-100/80"
        />

        <Reveal className="mt-12 rounded-2xl glass-panel !border-cream-50/15 p-8 sm:p-10">
          {isLoading && (
            <p className="text-center text-cream-100/70">Henter vejrdata...</p>
          )}

          {!isLoading && error && <p className="text-center text-cream-100/80">{error}</p>}

          {!isLoading && !error && weather && (
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
              <div className="flex items-center gap-5">
                <Icon size={56} strokeWidth={1.25} />
                <div>
                  <p className="text-5xl font-light">{Math.round(weather.temperatureC)}°C</p>
                  <p className="mt-1 text-cream-100/80">{weather.conditionLabel}</p>
                </div>
              </div>

              <div className="flex gap-8 text-sm text-cream-100/80">
                {weather.precipitationProbability !== null && (
                  <div>
                    <p className="text-cream-100/60">Nedbør</p>
                    <p className="mt-1 font-medium text-cream-50">
                      {weather.precipitationProbability}%
                    </p>
                  </div>
                )}
                <div>
                  <p className="flex items-center gap-1 text-cream-100/60">
                    <Wind size={14} /> Vind
                  </p>
                  <p className="mt-1 font-medium text-cream-50">
                    {Math.round(weather.windKph)} km/t
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && weather && (
            <p className="mt-8 border-t border-cream-50/15 pt-6 text-center text-cream-100/90">
              Det ser ud til at blive {Math.round(weather.temperatureC)}°C og{' '}
              {weather.conditionLabel.toLowerCase()}. {weather.clothingTip}
            </p>
          )}

          {!isLoading && !error && weather && (
            <p className="mt-4 text-center text-xs text-cream-100/50">Kilde: {weather.source}</p>
          )}
        </Reveal>
      </Container>
    </section>
  )
}
