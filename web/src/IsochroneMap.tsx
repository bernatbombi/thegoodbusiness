import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const BCN_COORD = { lat: 41.3874, lon: 2.1686 }

const CONTOUR_FILL_LAYER = 'isochrone-fill'
const CONTOUR_SOURCE = 'isochrone-source'

type Mode = 'pedestrian' | 'auto'
type Coord = { lat: number; lon: number }

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
      </div>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
