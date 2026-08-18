import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// `?worker&url` (not plain `?url`) routes the file through Vite's worker
// build pipeline, which bundles its sibling maplibre-gl-shared.mjs import
// into a self-contained chunk — a plain `?url` copy drops that dependency
// and the worker 404s on its own import in production.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const BCN_COORD = { lat: 41.3874, lon: 2.1686 }

const CONTOUR_FILL_LAYER = 'isochrone-fill'
const CONTOUR_SOURCE = 'isochrone-source'

type Mode = 'pedestrian' | 'auto'
type Coord = { lat: number; lon: number }

const CONTOUR_MINUTES = [5, 10, 15] as const
const CONTOUR_COLORS: Record<number, string> = { 5: '#2ecc71', 10: '#f1c40f', 15: '#e74c3c' }

type PlacesResult = {
  total: number
  types: { type: string; count: number }[]
}

export default function IsochroneMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [mode, setMode] = useState<Mode>('pedestrian')
  const [selectedCoord, setSelectedCoord] = useState<Coord>(BCN_COORD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  const [places, setPlaces] = useState<Record<number, PlacesResult> | null>(null)
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placesError, setPlacesError] = useState<string | null>(null)

  // Create the map once. Clicking just records the coordinate — fetching
  // is handled by the effect below, which always sees the latest mode/coord.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [BCN_COORD.lon, BCN_COORD.lat],
      zoom: 12,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource(CONTOUR_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: CONTOUR_FILL_LAYER,
        type: 'fill',
        source: CONTOUR_SOURCE,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35,
        },
      })
      map.addLayer({
        id: `${CONTOUR_FILL_LAYER}-outline`,
        type: 'line',
        source: CONTOUR_SOURCE,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
        },
      })
      markerRef.current = new maplibregl.Marker()
        .setLngLat([BCN_COORD.lon, BCN_COORD.lat])
        .addTo(map)
      setMapReady(true)
    })

    map.on('click', (e: MapMouseEvent) => {
      setSelectedCoord({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Re-fetch whenever the selected coordinate or mode changes, and whenever
  // the map has finished loading. Always uses the current mode/coord values.
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return

    if (markerRef.current) {
      markerRef.current.setLngLat([selectedCoord.lon, selectedCoord.lat])
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    const start = performance.now()

    fetch(`${API_URL}/isochrone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: selectedCoord.lat, lon: selectedCoord.lon, mode }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}))
          throw new Error(body.detail || `Request failed (${resp.status})`)
        }
        return resp.json()
      })
      .then((geojson) => {
        if (cancelled) return
        setElapsedMs(performance.now() - start)
        // draw largest contour first, smallest last, so all three remain visible
        geojson.features.sort((a: any, b: any) => b.properties.contour - a.properties.contour)
        const source = map.getSource(CONTOUR_SOURCE) as maplibregl.GeoJSONSource | undefined
        source?.setData(geojson)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mapReady, selectedCoord, mode])

  // Isochrone changed underneath us — any previously fetched places no
  // longer correspond to the currently drawn contours.
  useEffect(() => {
    setPlaces(null)
    setPlacesError(null)
  }, [selectedCoord, mode])

  const showPlaces = async () => {
    setPlacesLoading(true)
    setPlacesError(null)
    try {
      const results = await Promise.all(
        CONTOUR_MINUTES.map(async (minutes) => {
          const resp = await fetch(`${API_URL}/places/within`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...selectedCoord, mode, minutes }),
          })
          if (!resp.ok) {
            const body = await resp.json().catch(() => ({}))
            throw new Error(body.detail || `Request failed (${resp.status})`)
          }
          return [minutes, (await resp.json()) as PlacesResult] as const
        })
      )
      setPlaces(Object.fromEntries(results))
    } catch (e) {
      setPlacesError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlacesLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1,
          background: 'white',
          padding: 12,
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          fontFamily: 'sans-serif',
          fontSize: 14,
          minWidth: 220,
        }}
      >
        <div
          style={{
            display: 'flex',
            background: '#eef0f2',
            borderRadius: 8,
            padding: 3,
            marginBottom: 10,
          }}
        >
          {(['pedestrian', 'auto'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: 6,
                padding: '8px 0',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background 0.15s, color 0.15s',
                background: mode === m ? '#1d4ed8' : 'transparent',
                color: mode === m ? 'white' : '#333',
              }}
            >
              <span aria-hidden>{m === 'pedestrian' ? '🚶' : '🚗'}</span>
              {m === 'pedestrian' ? 'Walk' : 'Car'}
            </button>
          ))}
        </div>
        <div style={{ color: '#666', fontSize: 12.5 }}>
          Click map to compute 5/10/15 min isochrones
        </div>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 12.5 }}>
          {loading && <span style={{ color: '#1d4ed8' }}>Loading…</span>}
          {elapsedMs !== null && !loading && (
            <span style={{ color: '#666' }}>{Math.round(elapsedMs)} ms</span>
          )}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        </div>

        <button
          type="button"
          onClick={showPlaces}
          disabled={loading || placesLoading}
          style={{
            marginTop: 10,
            width: '100%',
            border: 'none',
            borderRadius: 6,
            padding: '8px 0',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: loading || placesLoading ? 'default' : 'pointer',
            background: '#111827',
            color: 'white',
            opacity: loading || placesLoading ? 0.6 : 1,
          }}
        >
          {placesLoading ? 'Checking nearby places…' : 'What’s nearby?'}
        </button>

        {placesError && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#dc2626' }}>{placesError}</div>
        )}

        {places && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CONTOUR_MINUTES.map((minutes) => {
              const result = places[minutes]
              if (!result) return null
              return (
                <div key={minutes}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: CONTOUR_COLORS[minutes],
                        display: 'inline-block',
                      }}
                    />
                    {minutes} min — {result.total} places
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {result.types.slice(0, 6).map(({ type, count }) => (
                      <span
                        key={type}
                        style={{
                          background: '#eef0f2',
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 11.5,
                          color: '#333',
                        }}
                      >
                        {type.replaceAll('_', ' ')} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
