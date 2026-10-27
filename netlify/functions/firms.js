// Radar Ambiental — NASA FIRMS Argentina
// Función de Netlify: netlify/functions/firms.js

const GEOREF =
  "https://apis.datos.gob.ar/georef/api/v2.0/provincias.geojson";

// Dividimos Argentina en cuatro franjas para consultar NASA.
const BANDS = [
  [-73.7, -55.3, -53.4, -46.5],
  [-73.7, -46.5, -53.4, -37.5],
  [-73.7, -37.5, -53.4, -29.5],
  [-73.7, -29.5, -53.4, -21.5]
];

let geoCache = null;
let geoAt = 0;

// Respuesta JSON para el navegador
function reply(status, obj) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "public, max-age=900"
          : "no-store"
    },
    body: JSON.stringify(obj)
  };
}

// Obtener los límites provinciales
async function getGeo() {
  if (geoCache && Date.now() - geoAt < 86400000) {
    return geoCache;
  }

  const response = await fetch(GEOREF, {
    signal: AbortSignal.timeout(18000)
  });

  if (!response.ok) {
    throw new Error("Georef HTTP " + response.status);
  }

  const data = await response.json();

  const features =
    data.features || data.provincias?.features;

  if (!Array.isArray(features) || features.length < 23) {
    throw new Error(
      "Georef no devolvió las provincias esperadas"
    );
  }

  geoCache = features;
  geoAt = Date.now();

  return features;
}

// Determinar si un punto está dentro de un polígono
function withinRing(x, y, ring) {
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const a = ring[i];
    const b = ring[j];

    if (
      (a[1] > y) !== (b[1] > y) &&
      x <
        ((b[0] - a[0]) * (y - a[1])) /
          (b[1] - a[1]) +
          a[0]
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function withinPolygon(x, y, rings) {
  return (
    rings.length > 0 &&
    withinRing(x, y, rings[0]) &&
    !rings.slice(1).some(
      ring => withinRing(x, y, ring)
    )
  );
}

function contains(geometry, x, y) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return withinPolygon(
      x,
      y,
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(
      polygon => withinPolygon(x, y, polygon)
    );
  }

  return false;
}

// Convertir el CSV de NASA a objetos JavaScript
function csvParse(text) {
  const rows = [];

  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (
      (c === "\n" || c === "\r") &&
      !quoted
    ) {
      if (c === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);

      if (row.some(value => value !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field);

  if (row.some(value => value !== "")) {
    rows.push(row);
  }

  const headers =
    rows.shift()?.map(value => value.trim()) || [];

  if (
    !headers.includes("latitude") ||
    !headers.includes("longitude")
  ) {
    throw new Error(
      "Respuesta CSV inesperada de NASA"
    );
  }

  return rows.map(columns =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        (columns[index] || "").trim()
      ])
    )
  );
}

// Obtener el nombre de una provincia
function nameOf(feature) {
  const properties = feature.properties || {};

  return (
    properties.nombre ||
    properties.name ||
    properties.provincia?.nombre ||
    properties.nombre_largo ||
    "Sin identificar"
  );
}

// Función principal de Netlify
exports.handler = async function (event) {
  const key = process.env.NASA_FIRMS_MAP_KEY;

  if (!key) {
    return reply(503, {
      error: "Falta NASA_FIRMS_MAP_KEY en Netlify"
    });
  }

  const requestedDays = Number(
    event.queryStringParameters?.days || 5
  );

  const days = [1, 3, 5, 7].includes(requestedDays)
    ? requestedDays
    : 5;

  try {
    // 1. Obtener límites provinciales
    const provinces = await getGeo();

    // 2. Consultar NASA para las cuatro franjas
    const results = await Promise.all(
      BANDS.map(async box => {
        const bbox = box.join(",");

        const url =
          "https://firms.modaps.eosdis.nasa.gov" +
          "/api/area/csv/" +
          encodeURIComponent(key) +
          "/VIIRS_NOAA20_NRT/" +
          bbox +
          "/" +
          days;

        const response = await fetch(url, {
          signal: AbortSignal.timeout(26000)
        });

        if (!response.ok) {
          throw new Error(
            "NASA respondió HTTP " + response.status
          );
        }

        return csvParse(await response.text());
      })
    );

    // 3. Clasificar detecciones por provincia
    const seen = new Set();
    const points = [];
    const daily = {};
    const ranking = {};

    for (const point of results.flat()) {
      const lat = Number(point.latitude);
      const lon = Number(point.longitude);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ) {
        continue;
      }

      const province = provinces.find(
        feature => contains(
          feature.geometry,
          lon,
          lat
        )
      );

      // Excluir puntos fuera de Argentina
      if (!province) continue;

      // Evitar detecciones duplicadas
      const id = [
        point.latitude,
        point.longitude,
        point.acq_date,
        point.acq_time,
        point.satellite
      ].join("|");

      if (seen.has(id)) continue;

      seen.add(id);

      const provinceName = nameOf(province);

      const item = {
        latitude: lat,
        longitude: lon,
        acq_date: point.acq_date,
        acq_time: point.acq_time,
        frp: point.frp,
        confidence: point.confidence,
        provincia: provinceName
      };

      points.push(item);

      // Conteo diario
      daily[item.acq_date] =
        (daily[item.acq_date] || 0) + 1;

      // Conteo por provincia
      ranking[provinceName] =
        (ranking[provinceName] || 0) + 1;
    }

    // 4. Devolver los datos al HTML
    return reply(200, {
      points,
      daily,
      ranking,
      days,
      area: "Provincias argentinas según Georef",
      sensor: "VIIRS_NOAA20_NRT",
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    return reply(502, {
      error: error.message
    });
  }
};
