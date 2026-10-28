// Netlify Function: NASA FIRMS + limites provinciales oficiales (Georef).
// Requiere variable NASA_FIRMS_MAP_KEY en Netlify (no ponerla en GitHub).
const GEOREF='https://apis.datos.gob.ar/georef/api/v2.0/provincias.geojson';
const BANDS=[
  [-73.7,-55.3,-53.4,-46.5],
  [-73.7,-46.5,-53.4,-37.5],
  [-73.7,-37.5,-53.4,-29.5],
  [-73.7,-29.5,-53.4,-21.5]
];
let geoCache=null, geoAt=0;
function reply(status,obj){return {statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=900':'no-store'},body:JSON.stringify(obj)}}
async function getGeo(){
 if(geoCache&&Date.now()-geoAt<86400000)return geoCache;
 const r=await fetch(GEOREF,{signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('Georef HTTP '+r.status);
 const data=await r.json();
 const features=data.features || data.provincias?.features;
 if(!Array.isArray(features)||features.length<23)throw Error('Georef no devolvió las provincias esperadas');
 geoCache=features;geoAt=Date.now();return features;
}
function withinRing(x,y,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if(((a[1]>y)!==(b[1]>y)) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function withinPolygon(x,y,rings){return rings.length>0&&withinRing(x,y,rings[0])&&!rings.slice(1).some(r=>withinRing(x,y,r))}
function contains(geom,x,y){
 if(!geom)return false;
 if(geom.type==='Polygon')return withinPolygon(x,y,geom.coordinates);
 if(geom.type==='MultiPolygon')return geom.coordinates.some(p=>withinPolygon(x,y,p));
 return false;
}
function csvParse(text){
 // Parser CSV: maneja comillas y comas dentro de campos.
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
  else if(c===','&&!quoted){row.push(field);field=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field=''}
  else field+=c;
 }
 row.push(field);if(row.some(v=>v!==''))rows.push(row);
 const header=rows.shift()?.map(s=>s.trim())||[];
 if(!header.includes('latitude')||!header.includes('longitude'))throw Error('Respuesta CSV inesperada de NASA');
 return rows.map(cols=>Object.fromEntries(header.map((h,i)=>[h,(cols[i]||'').trim()])));
}
function nameOf(f){const p=f.properties||{};return p.nombre||p.name||p.provincia?.nombre||p.nombre_largo||'Sin identificar'}
exports.handler=async(event)=>{
 const key=process.env.NASA_FIRMS_MAP_KEY;
 if(!key)return reply(503,{error:'Falta NASA_FIRMS_MAP_KEY en Netlify'});
 const requested=Number(event.queryStringParameters?.days||5);
 const days=[1,3,5,7].includes(requested)?requested:5;
 try{
  const provinces=await getGeo();
  const results=await Promise.all(BANDS.map(async box=>{
   const bbox=box.join(',');
   const url=`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/${bbox}/${days}`;
   const r=await fetch(url,{signal:AbortSignal.timeout(26000)});
   if(!r.ok)throw Error('NASA respondió HTTP '+r.status);
   return csvParse(await r.text());
  }));
  const seen=new Set(),points=[],daily={},ranking={};
  for(const p of results.flat()){
   const lat=Number(p.latitude),lon=Number(p.longitude);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
   const province=provinces.find(f=>contains(f.geometry,lon,lat));
   if(!province)continue;
   const id=[p.latitude,p.longitude,p.acq_date,p.acq_time,p.satellite].join('|');
   if(seen.has(id))continue;seen.add(id);
   const name=nameOf(province);
   const item={latitude:lat,longitude:lon,acq_date:p.acq_date,acq_time:p.acq_time,frp:p.frp,confidence:p.confidence,daynight:p.daynight,provincia:name};
   points.push(item);daily[item.acq_date]=(daily[item.acq_date]||0)+1;ranking[name]=(ranking[name]||0)+1;
  }
  return reply(200,{points,daily,ranking,days,area:'Provincias argentinas según Georef',sensor:'VIIRS_NOAA20_NRT',updatedAt:new Date().toISOString()});
 }catch(err){return reply(502,{error:err.message})}
};
