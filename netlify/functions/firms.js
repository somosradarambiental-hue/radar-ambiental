
exports.handler = async function (event) {
  const key = process.env.NASA_FIRMS_MAP_KEY;

  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta configurar la clave NASA" })
    };
  }

  const days = [1, 2, 3, 4, 5, 6, 7].includes(
    Number(event.queryStringParameters?.days)
  ) ? Number(event.queryStringParameters.days) : 7;

  // Rectángulo aproximado de la provincia de Buenos Aires.
  const bbox = "-63.5,-41.2,-56.5,-33.0";

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/${bbox}/${days}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NASA respondió HTTP ${response.status}`);
    }

    const csv = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "public, max-age=900"
      },
      body: csv
    };
  } catch (error) {
    console.error("Error al consultar NASA FIRMS:", error.message);

    return {
      statusCode: 502,
      body: JSON.stringify({
        error: "No fue posible consultar NASA FIRMS"
      })
    };
  }
};
