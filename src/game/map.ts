/**
 * Static map URL builder.
 *
 * The classic OSM staticmap services (staticmap.openstreetmap.de / .fr) are
 * defunct, so v1 uses Yandex Static Maps, which is free without an API key for
 * low-volume use and supports URL-composed markers. Swap the provider here if
 * needed — the rest of the code only calls `buildMapUrl(lat, lng)`.
 */
export function buildMapUrl(lat: number, lng: number, zoom = 10): string {
  return (
    'https://static-maps.yandex.ru/1.x/' +
    `?ll=${lng},${lat}&z=${zoom}&size=600,400&l=map&pt=${lng},${lat},pm2rdm`
  )
}
