// Netlify Function: proxy de consulta de series observadas del INA.
exports.handler = async (event) => {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'};
  const q = event.queryStringParameters || {};
  const id = String(q.seriesId || '');
  if (!/^\d{1,12}$/.test(id)) return {statusCode:400,headers,body:JSON.stringify({error:'Ingresá un ID de serie numérico válido.'})};
  const days = Math.min(365,Math.max(1,Number(q.days)||30));
  const end = new Date();
  const start = new Date(end.getTime()-days*86400000);
  const fmt = d => d.toISOString().slice(0,10);
  const params = new URLSearchParams({seriesId:id,timeStart:fmt(start),timeEnd:fmt(end)});
  const url = 'https://alerta.ina.gob.ar/pub/datos/datos?' + params.toString();
  try {
    const res = await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!res.ok) throw new Error('INA respondió HTTP '+res.status);
    const raw = await res.json();
    return {statusCode:200,headers,body:JSON.stringify({source:'INA',seriesId:Number(id),start:fmt(start),end:fmt(end),data:raw})};
  } catch(err) {
    return {statusCode:502,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({error:'No se pudo consultar INA: '+err.message})};
  }
};
