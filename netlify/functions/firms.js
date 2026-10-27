
exports.handler = async function (event) {
  const key = process.env.NASA_FIRMS_MAP_KEY;

  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta la clave NASA" })
    };
  }

  const requestedDays = Number(event.queryStringParameters?.days);
  const days = [1, 2, 3, 4, 5, 6, 7].includes(requestedDays)
    ? requestedDays
    : 7;

  const bbox = "-63.5,-41.2,-56.5,-33.0";

  const url =
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/` +
    `${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/${bbox}/${days}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NASA respondió ${response.status}`);
    }

    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/);

    if (!lines.length || !lines[0].includes("latitude")) {
      throw new Error("Respuesta CSV inesperada");
    }

    const headers = lines[0].split(",");

    const data = lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(",");
        const item = {};

        headers.forEach((header, index) => {
          item[header.trim()] = values[index]?.trim();
        });

        return item;
      });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=900"
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Error NASA FIRMS:", error.message);

    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "No se pudieron obtener los datos de NASA"
      })
    };
  }
};
