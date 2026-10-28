// Radar Ambiental — proxy INA. No necesita claves.
// El servicio INA usa /pub/datos/datos&parametro=valor (sin ?).
const ROOT = 'https://alerta.ina.gob.ar/pub/datos/';
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=600'};
const answer = (statusCode, body) => ({statusCode,headers,body:JSON.stringify(body)});
const value = (x,...keys) => keys.map(k=>x?.[k]).find(v=>v!==undefined&&v!==null);
const rows = x => Array.isArray(x)?x: ['data','datos','results','items','series','observaciones','observations'].map(k=>x?.[k]).find(Array.isArray)||[];
async function ina(resource,params={}) {
  const suffix=Object.keys(params).length?'&'+new URLSearchParams(params).toString():'';
  const response=await fetch(ROOT+resource+suffix,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error('El INA respondió HTTP '+response.status);
  const raw=await response.text();
  let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('El INA devolvió una respuesta no JSON')}
  return parsed;
}
function riverFor(station,river){
  const explicit=String(river||'').toLowerCase();
  if(/paraguay/.test(explicit))return 'Río Paraguay';
  if(/uruguay/.test(explicit))return 'Río Uruguay';
  if(/iguaz[uú]/.test(explicit))return 'Río Iguazú';
  if(/paran[aá]/.test(explicit))return 'Río Paraná';
  // Coincidencias conservadoras de localidades, no inferencia por subcadenas.
  const n=String(station||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const patterns=[
    ['Río Paraná',/^(corrientes|posadas|rosario|parana|santa fe|san pedro|diamante|villa constitucion|puerto rico)(?:\s*[-(]|$)/],
    ['Río Paraguay',/^(formosa|clorinda|pilcomayo|puerto bermejo)(?:\s*[-(]|$)/],
    ['Río Uruguay',/^(concordia|paso de los libres|colon|concepcion del uruguay|gualeguaychu|monte caseros)(?:\s*[-(]|$)/],
    ['Río Iguazú',/^(puerto iguazu|iguazu)(?:\s*[-(]|$)/]
  ];
  return patterns.find(([,p])=>p.test(n))?.[0]||'Estaciones por verificar';
}
exports.handler=async event=>{
  const q=event.queryStringParameters||{};
  try{
    if(q.action==='catalog'){
      const raw=await ina('series');
      if(raw?.mensaje&&/error|faltante/i.test(raw.title||''))throw Error(raw.mensaje);
      const source=rows(raw);
      const options=source.map(s=>{
        const id=Number(value(s,'seriesid','seriesId','series_id','id'));
        const station=String(value(s,'estacion_nombre','siteName','site_name','nombreEstacion')||'').trim();
        const variable=String(value(s,'var_nombre','varName','variableName')||'').trim();
        const unit=String(value(s,'unit_nombre','unitName','unidad')||'').trim();
        const river=String(value(s,'rio_nombre','rio','river')||'');
        const toDate=String(value(s,'to_date','toDate')||'');
        const obsCount=Number(value(s,'obs_count','obsCount')||0);
        return {id,station,variable,unit,river:riverFor(station,river),toDate,obsCount};
      }).filter(s=>Number.isSafeInteger(s.id)&&s.id>0&&s.station&&/altura hidrom[eé]trica|nivel hidrom[eé]trico|nivel del (r[ií]o|agua)/i.test(s.variable)&&/^(m|metro|metros)$/i.test(s.unit));
      options.sort((a,b)=>b.toDate.localeCompare(a.toDate)||b.obsCount-a.obsCount);
      return answer(200,{options,matched:options.length,total:source.length,warning:options.length?'':'No se encontraron series de altura hidrométrica en metros con metadatos reconocibles.'});
    }
    const id=String(q.seriesId||'');
    if(!/^\d{1,12}$/.test(id))return answer(400,{error:'Ingresá un ID de serie válido.'});
    const days=Math.min(365,Math.max(1,Number.parseInt(q.days,10)||30));
    const end=new Date(),start=new Date(end.getTime()-days*86400000);
    const fmt=d=>d.toISOString().slice(0,10);
    const data=await ina('datos',{timeStart:fmt(start),timeEnd:fmt(end),seriesId:id,format:'json'});
    if(data?.mensaje&&/no se encontraron resultados/i.test(data.mensaje))return answer(200,{seriesId:Number(id),start:fmt(start),end:fmt(end),data:[],warning:'El INA no tiene observaciones para esta serie y período.'});
    if(data?.mensaje&&data?.title)return answer(502,{error:'INA: '+data.mensaje});
    return answer(200,{seriesId:Number(id),start:fmt(start),end:fmt(end),data});
  }catch(e){return answer(502,{error:'No se pudo consultar el INA: '+e.message})}
};
