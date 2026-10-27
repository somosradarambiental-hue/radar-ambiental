# Radar Ambiental — MVP 1.0

Web estática con mapa Leaflet y función serverless Netlify que consulta NASA FIRMS VIIRS NOAA-20 NRT.

## Publicar
1. Creá una cuenta en https://firms.modaps.eosdis.nasa.gov/api/map_key y pedí una MAP_KEY gratuita.
2. Subí este proyecto a un repositorio de GitHub (no subas la clave).
3. En Netlify: Add new project → Import an existing project → GitHub → seleccioná el repositorio. El archivo `netlify.toml` configura la publicación.
4. En Netlify → Project configuration → Environment variables, agregá `NASA_FIRMS_MAP_KEY` con el valor recibido. Marcala disponible para Functions.
5. Publicá o volvé a desplegar el proyecto para que la función lea la variable.
6. Abrí la URL de Netlify y probá el botón Actualizar datos.

**No funciona haciendo doble clic en `index.html`:** el mapa carga, pero los datos requieren la función Netlify desplegada.

## Alcance y límites
- Consulta el rectángulo -63.5,-41.2,-56.2,-33.3; **no** filtra por polígono provincial y puede incluir áreas vecinas.
- NASA Area API permite de 1 a 5 días por consulta. El selector utiliza 1, 3 o 5 días.
- Una detección de calor no confirma un incendio. La ausencia de detecciones tampoco confirma ausencia de incendios.
- El contador representa registros del sensor seleccionado, no incendios únicos.
- La consulta es a datos NRT (casi en tiempo real), no necesariamente instantáneos.
- El parser CSV es intencionalmente simple para los campos FIRMS VIIRS; ampliar con un parser robusto si cambian los formatos.
- No hay credenciales de NASA en el código público.

## Próxima mejora
Agregar polígono oficial de la provincia y filtrado punto-en-polígono, más almacenamiento en caché para evitar solicitudes redundantes.
