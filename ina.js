
 // Netlify Function. INA catalog discovery and observed hydrometric data.
const BASE='https://alerta.ina.gob.ar/pub/datos/';
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'};
const reply=(statusCode,obj)=>({statusCode,headers:HEAD,body:JSON.stringify(obj)});
async function get(resource,params={}){
 const url=BASE+resource+'?'+new URLSearchParams(params);
 const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('INA respondió HTTP '+res.status+' ('+resource+')');
 return res.json();
}
function arr(v){if(Array.isArray(v))return v;if(!v||typeof v!=='object')return [];for(const k of ['data','results','items','series','estaciones','variables','datos'])if(Array.isArray(v[k]))return v[k];return [];}
function field(x,...names){for(const n of names)if(x?.[n]!=null)return x[n];return null;}
function label(x){return String(field(x,'nombre','name','descripcion','description','siteName','site_name')||'');}
exports.handler=async(event)=>{
 const q=event.queryStringParameters||{};
 try{
  if(q.action==='catalog'){
   const [rawSeries,rawSites,rawVars]=await Promise.all([get('series'),get('estaciones'),get('variables')]);
   const sites=arr(rawSites),vars=arr(rawVars),series=arr(rawSeries);
   const siteById=new Map(sites.map(s=>[String(field(s,'siteCode','site_code','id','estacionId','estacion_id')),s]));
   const varById=new Map(vars.map(v=>[String(field(v,'varId','var_id','id')),v]));
   const options=series.map(s=>{
    const id=field(s,'seriesId','series_id','id');
    const site=field(s,'estacion','station','site')||siteById.get(String(field(s,'siteCode','site_code','estacionId','estacion_id')))||{};
    const variable=field(s,'variable')||varById.get(String(field(s,'varId','var_id')))||{};
    const station=String(field(s,'siteName','site_name','nombreEstacion')||label(site)||'');
    const river=String(field(s,'rio','river','cuenca')||field(site,'rio','river','cuenca','nombreRio')||'');
    const variableName=String(field(s,'varName','variableName')||label(variable)||'');
    const unit=String(field(s,'unitName','unidad','unit')||field(variable,'unidad','unit')||'');
    return {id:Number(id),station,river,variable:variableName,unit};
   }).filter(x=>Number.isSafeInteger(x.id)&&x.id>0&&x.station);
   // Keep only recognizable hydrometric-level series. If metadata lacks names,
   // expose catalog with explicit warning instead of guessing a variable.
   const levels=options.filter(x=>/nivel|altura|hidrom[eé]tric/i.test(x.variable));
   return reply(200,{options:levels,allSeriesCount:series.length,matched:levels.length,
    warning:levels.length?'':'El catálogo no incluye nombres de variables suficientes para identificar niveles de agua automáticamente.'});
  }
  const id=String(q.seriesId||'');
  if(!/^\d{1,12}$/.test(id))return reply(400,{error:'Serie INA inválida'});
  const days=Math.min(365,Math.max(1,parseInt(q.days,10)||30));
  const end=new Date(),start=new Date(end.getTime()-days*86400000);
  const fmt=d=>d.toISOString().slice(0,10);
  const data=await get('datos',{seriesId:id,timeStart:fmt(start),timeEnd:fmt(end)});
  return reply(200,{seriesId:Number(id),start:fmt(start),end:fmt(end),data});
 }catch(e){return reply(502,{error:'No se pudo consultar INA: '+e.message});}
};
