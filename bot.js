const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');  // ← Agregar esta línea

// Elimina los warnings molestos de la librería de Telegram
process.env.NTBA_FIX_350 = 1; 
process.env.NTBA_FIX_319 = 1;

puppeteer.use(StealthPlugin());

const delay = ms => new Promise(r => setTimeout(r, ms));

/* ===============================
   CONFIGURACIÓN
================================*/

//const CONFIG = {     //////////////////////////////// AHORA SI 
 // CANAL: 'telegram',
  //TELEGRAM_TOKEN: '7892705094:AAGxa56fsyhaiQ1-iMfsjstqBvrANZoBIek',
//};

const CONFIG = {
  CANAL: process.env.CANAL || 'web', // 'telegram', 'whatsapp', 'web'
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
};



// La URL base del propio api-server (se usa a sí mismo como proxy)
const API_SELF = `http://localhost:${process.env.PORT || 3001}`;

async function verificarPermiso(userId, telefono = null, accion = 'consultar') {
  try {
    const url = `${API_SELF}/permisos/${userId}?accion=${accion}${telefono ? `&telefono=${telefono}` : ''}`;
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    return { permitido: false, mensaje: 'Error de permisos' };
  }
}

/* ===============================
   PARSEAR DIRECCIÓN
================================*/
function parsearDireccion(texto) {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = normalize(texto.trim().toLowerCase().replace(/[\(\)]/g, ''));
  const partes = t.split(',').map(p => p.trim());
  const partePrincipal = partes[0]; 

  const matchNumero = t.match(/\b(\d{1,5}(?:-[a-z0-9]+)?)\b/i);
  const numero = matchNumero ? matchNumero[1] : '';

  let depto = '';
  const matchDepto = t.match(/\b(depto?\.?|departamento|dpto\.?|piso|oficina|casa|local|torre|block|int|interior)\b\.?\s*[:#-]?\s*([a-z0-9]+(?:[\s-]*[a-z0-9]+)*)/i);
  if (matchDepto) depto = matchDepto[0].trim();

  let comuna = '';
  
  const comunasConocidas = [
    'aisen', 'algarrobo', 'alhue', 'alto biobio', 'alto del carmen', 'alto hospicio', 'ancud', 'andacollo', 'angol', 'antofagasta', 'antuco', 'antartica', 'arauco', 'arica', 'buin', 'bulnes', 'cabildo', 'cabo de hornos', 'cabrero', 'calama', 'calbuco', 'caldera', 'calera de tango', 'calera', 'calle larga', 'camarones', 'camina', 'canela', 'carahue', 'cartagena', 'casablanca', 'castro', 'catemu', 'cauquenes', 'canete', 'cerrillos', 'cerro navia', 'chaiten', 'chanco', 'chanaral', 'chepica', 'chiguayante', 'chile chico', 'chillan viejo', 'chillan', 'chimbarongo', 'cholchol', 'chonchi', 'cisnes', 'cobquecura', 'cochamo', 'cochrane', 'codegua', 'coelemu', 'coihueco', 'coinco', 'colbun', 'colchane', 'colina', 'collipulli', 'coltauco', 'combarbala', 'concepcion', 'conchali', 'concon', 'constitucion', 'contulmo', 'copiapo', 'coquimbo', 'coronel', 'corral', 'coyhaique', 'cunco', 'curacautin', 'curacavi', 'curaco de velez', 'curanilahue', 'curarrehue', 'curepto', 'dalcahue', 'diego de almagro', 'donihue', 'el bosque', 'el carmen', 'el monte', 'el quisco', 'el tabo', 'empedrado', 'ercilla', 'estacion central', 'florida', 'freire', 'freirina', 'fresia', 'frutillar', 'futaleufu', 'futrono', 'galvarino', 'gorbea', 'graneros', 'guaitecas', 'hijuelas', 'hualaihe', 'hualane', 'hualpen', 'hualqui', 'huara', 'huasco', 'huechuraba', 'illapel', 'independencia', 'iquique', 'isla de maipo', 'isla de pascua', 'juan fernandez', 'la calera', 'la cisterna', 'la cruz', 'la estrella', 'la florida', 'la granja', 'la higuera', 'la ligua', 'la pintana', 'la reina', 'la serena', 'la union', 'lago verde', 'laguna blanca', 'laja', 'lampa', 'lanco', 'las cabras', 'las condes', 'lautaro', 'lebu', 'licanten', 'limache', 'linares', 'litueche', 'llanquihue', 'llay-llay', 'lo barnechea', 'lo espejo', 'lo prado', 'lolol', 'loncoche', 'longavi', 'lonquimay', 'los alamos', 'los andes', 'los angeles', 'los lagos', 'los muermos', 'los sauces', 'los vilos', 'lumaco', 'machali', 'macul', 'mafil', 'maipu', 'malloa', 'marchigue', 'mariquina', 'maria elena', 'maria pinto', 'maule', 'maullin', 'mejillones', 'melipeuco', 'melipilla', 'molina', 'monte patria', 'mostazal', 'mulchen', 'nacimiento', 'nancagua', 'navidad', 'negrete', 'ninhue', 'nogales', 'nueva imperial', 'niquen', 'nunoa', 'ollague', 'olivar', 'olmue', 'osorno', 'ovalle', 'padre hurtado', 'padre las casas', 'paihuano', 'paillaco', 'paine', 'palena', 'palmilla', 'panguipulli', 'panquehue', 'papudo', 'paredones', 'parral', 'pedro aguirre cerda', 'pelarco', 'pelluhue', 'penaflor', 'pemuco', 'perquenco', 'pica', 'pichidegua', 'pichilemu', 'pitrufquen', 'pozo almonte', 'portezuelo', 'porvenir', 'providencia', 'pucon', 'pudahuel', 'puente alto', 'puerto montt', 'puerto octay', 'puerto varas', 'pumanque', 'puren', 'putaendo', 'quellon', 'quilicura', 'quilpue', 'quillota', 'quintero', 'quirihue', 'rancagua', 'rauco', 'renca', 'rengo', 'recoleta', 'retiro', 'rinconada', 'rio bueno', 'rio claro', 'rio hurtado', 'rio ibanez', 'rio negro', 'romeral', 'saavedra', 'sagrada familia', 'salamanca', 'san antonio', 'san bernardo', 'san carlos', 'san clemente', 'san esteban', 'san fabian', 'san felipe', 'san fernando', 'san francisco de mostazal', 'san gregorio', 'san ignacio', 'san javier', 'san joaquin', 'san jose de maipo', 'san juan de la costa', 'san miguel', 'san nicolas', 'san pablo', 'san pedro de atacama', 'san pedro de la paz', 'san pedro', 'san rafael', 'san ramon', 'san rosendo', 'san vicente', 'santa barbara', 'santa cruz', 'santa juana', 'santa maria', 'santiago', 'santo domingo', 'sierra gorda', 'talagante', 'talca', 'talcahuano', 'taltal', 'temuco', 'teno', 'teodoro schmidt', 'tierra amarilla', 'tiltil', 'timaukel', 'tirua', 'tocopilla', 'tolten', 'tome', 'torres del paine', 'tortel', 'traiguen', 'trehuaco', 'tucapel', 'valdivia', 'vallenar', 'valparaiso', 'vichuquen', 'victoria', 'vicuna', 'vilcun', 'villa alegre', 'villa alemana', 'villarrica', 'vina del mar', 'vitacura', 'yerbas buenas', 'yumbel', 'yungay', 'zapallar'
  ];
  comunasConocidas.sort((a, b) => b.length - a.length);

  if (partes.length > 1) {
    for (let i = 1; i < partes.length; i++) {
      for (const c of comunasConocidas) {
        if (partes[i].includes(c)) {
          comuna = c;
          break;
        }
      }
      if (comuna) break;
    }
  }

  if (!comuna) {
    const matchComuna = t.match(/(?:comuna|en)\s+([a-z\s]+?)(?:\s*,|\s*region|\s*rm|\s*$)/i);
    if (matchComuna) {
      comuna = matchComuna[1].trim();
    } else {
      for (const c of comunasConocidas) {
        if (t.includes(c)) { comuna = c; break; }
      }
    }
  }

  let region = 'metropolitana';

  const regionesList = [
    ['region metropolitana', 'metropolitana'], ['rm', 'metropolitana'],
    ['valparaiso', 'valparaiso'], ['quinta region', 'valparaiso'], ['v region', 'valparaiso'],
    ['ohiggins', 'ohiggins'], ['libertador', 'ohiggins'], ['vi region', 'ohiggins'],
    ['maule', 'maule'], ['vii region', 'maule'],
    ['nuble', 'nuble'], ['xvi region', 'nuble'],
    ['biobio', 'biobio'], ['viii region', 'biobio'],
    ['araucania', 'araucania'], ['ix region', 'araucania'],
    ['los rios', 'los rios'], ['xiv region', 'los rios'],
    ['los lagos', 'los lagos'], ['x region', 'los lagos'],
    ['aysen', 'aysen'], ['xi region', 'aysen'],
    ['magallanes', 'magallanes'], ['xii region', 'magallanes'],
    ['arica y parinacota', 'arica y parinacota'], ['xv region', 'arica y parinacota'],
    ['tarapaca', 'tarapaca'], ['i region', 'tarapaca'],
    ['antofagasta', 'antofagasta'], ['ii region', 'antofagasta'],
    ['atacama', 'atacama'], ['iii region', 'atacama'],
    ['coquimbo', 'coquimbo'], ['iv region', 'coquimbo'],
  ];

  for (const [key, val] of regionesList) {
    if (t.includes(key)) { region = val; break; }
  }

  if (region === 'metropolitana' && comuna) {
    const comunaRegionMap = {
      'valparaiso': 'valparaiso', 'vina del mar': 'valparaiso', 'quilpue': 'valparaiso', 'villa alemana': 'valparaiso', 'quillota': 'valparaiso', 'san antonio': 'valparaiso', 'san felipe': 'valparaiso', 'los andes': 'valparaiso', 'calera': 'valparaiso', 'la calera': 'valparaiso', 'limache': 'valparaiso', 'concon': 'valparaiso', 'quintero': 'valparaiso', 'casablanca': 'valparaiso', 'cartagena': 'valparaiso', 'el quisco': 'valparaiso', 'el tabo': 'valparaiso', 'algarrobo': 'valparaiso', 'papudo': 'valparaiso', 'zapallar': 'valparaiso', 'la ligua': 'valparaiso', 'cabildo': 'valparaiso', 'putaendo': 'valparaiso', 'panquehue': 'valparaiso', 'catemu': 'valparaiso', 'hijuelas': 'valparaiso', 'nogales': 'valparaiso', 'puchuncavi': 'valparaiso', 'olmue': 'valparaiso', 'juan fernandez': 'valparaiso', 'isla de pascua': 'valparaiso', 'rinconada': 'valparaiso', 'calle larga': 'valparaiso', 'llay-llay': 'valparaiso', 'santo domingo': 'valparaiso',
      'rancagua': 'ohiggins', 'san fernando': 'ohiggins', 'rengo': 'ohiggins', 'machali': 'ohiggins', 'graneros': 'ohiggins', 'codegua': 'ohiggins', 'mostazal': 'ohiggins', 'san francisco de mostazal': 'ohiggins', 'olivar': 'ohiggins', 'coinco': 'ohiggins', 'coltauco': 'ohiggins', 'donihue': 'ohiggins', 'malloa': 'ohiggins', 'requinoa': 'ohiggins', 'quinta de tilcoco': 'ohiggins', 'san vicente': 'ohiggins', 'pichidegua': 'ohiggins', 'las cabras': 'ohiggins', 'peumo': 'ohiggins', 'chimbarongo': 'ohiggins', 'nancagua': 'ohiggins', 'placilla': 'ohiggins', 'lolol': 'ohiggins', 'palmilla': 'ohiggins', 'peralillo': 'ohiggins', 'santa cruz': 'ohiggins', 'chepica': 'ohiggins', 'pumanque': 'ohiggins', 'pichilemu': 'ohiggins', 'marchigue': 'ohiggins', 'litueche': 'ohiggins', 'la estrella': 'ohiggins', 'navidad': 'ohiggins', 'paredones': 'ohiggins', 'san clemente': 'ohiggins',
      'talca': 'maule', 'curico': 'maule', 'linares': 'maule', 'cauquenes': 'maule', 'constitucion': 'maule', 'molina': 'maule', 'san javier': 'maule', 'parral': 'maule', 'retiro': 'maule', 'longavi': 'maule', 'villa alegre': 'maule', 'yerbas buenas': 'maule', 'colbun': 'maule', 'san rafael': 'maule', 'pelarco': 'maule', 'rio claro': 'maule', 'sagrada familia': 'maule', 'teno': 'maule', 'romeral': 'maule', 'licanten': 'maule', 'vichuquen': 'maule', 'hualane': 'maule', 'rauco': 'maule', 'curepto': 'maule', 'empedrado': 'maule', 'maule': 'maule', 'pelluhue': 'maule', 'chanco': 'maule', 'pencahue': 'maule',
      'chillan': 'nuble', 'chillan viejo': 'nuble', 'san carlos': 'nuble', 'bulnes': 'nuble', 'yungay': 'nuble', 'el carmen': 'nuble', 'pemuco': 'nuble', 'pinto': 'nuble', 'coihueco': 'nuble', 'niquen': 'nuble', 'san fabian': 'nuble', 'san nicolas': 'nuble', 'quirihue': 'nuble', 'cobquecura': 'nuble', 'trehuaco': 'nuble', 'ninhue': 'nuble', 'portezuelo': 'nuble', 'coelemu': 'nuble', 'ranquil': 'nuble', 'treguaco': 'nuble',
      'concepcion': 'biobio', 'talcahuano': 'biobio', 'coronel': 'biobio', 'los angeles': 'biobio', 'chiguayante': 'biobio', 'hualpen': 'biobio', 'san pedro de la paz': 'biobio', 'tome': 'biobio', 'penco': 'biobio', 'florida': 'biobio', 'santa juana': 'biobio', 'hualqui': 'biobio', 'cabrero': 'biobio', 'yumbel': 'biobio', 'laja': 'biobio', 'nacimiento': 'biobio', 'negrete': 'biobio', 'mulchen': 'biobio', 'quilaco': 'biobio', 'santa barbara': 'biobio', 'alto biobio': 'biobio', 'tucapel': 'biobio', 'antuco': 'biobio', 'quilleco': 'biobio', 'arauco': 'biobio', 'lebu': 'biobio', 'curanilahue': 'biobio', 'los alamos': 'biobio', 'canete': 'biobio', 'contulmo': 'biobio', 'tirua': 'biobio',
      'temuco': 'araucania', 'padre las casas': 'araucania', 'angol': 'araucania', 'victoria': 'araucania', 'nueva imperial': 'araucania', 'pitrufquen': 'araucania', 'villarrica': 'araucania', 'pucon': 'araucania', 'lautaro': 'araucania', 'traiguen': 'araucania', 'collipulli': 'araucania', 'mulchen': 'araucania', 'curacautin': 'araucania', 'lonquimay': 'araucania', 'cunco': 'araucania', 'freire': 'araucania', 'teodoro schmidt': 'araucania', 'tolten': 'araucania', 'saavedra': 'araucania', 'carahue': 'araucania', 'galvarino': 'araucania', 'cholchol': 'araucania', 'lumaco': 'araucania', 'los sauces': 'araucania', 'ercilla': 'araucania', 'perquenco': 'araucania', 'vilcun': 'araucania', 'melipeuco': 'araucania', 'curarrehue': 'araucania', 'gorbea': 'araucania', 'loncoche': 'araucania',
      'valdivia': 'los rios', 'la union': 'los rios', 'rio bueno': 'los rios', 'osorno': 'los rios', 'paillaco': 'los rios', 'futrono': 'los rios', 'lanco': 'los rios', 'mariquina': 'los rios', 'mafil': 'los rios', 'corral': 'los rios', 'panguipulli': 'los rios', 'lago ranco': 'los rios',
      'puerto montt': 'los lagos', 'puerto varas': 'los lagos', 'castro': 'los lagos', 'ancud': 'los lagos', 'calbuco': 'los lagos', 'llanquihue': 'los lagos', 'frutillar': 'los lagos', 'los muermos': 'los lagos', 'maullin': 'los lagos', 'rio negro': 'los lagos', 'purranque': 'los lagos', 'puyehue': 'los lagos', 'puerto octay': 'los lagos', 'fresia': 'los lagos', 'cochamo': 'los lagos', 'hualaihue': 'los lagos', 'chaiten': 'los lagos', 'futaleufu': 'los lagos', 'palena': 'los lagos', 'quellon': 'los lagos', 'quemchi': 'los lagos', 'dalcahue': 'los lagos', 'curaco de velez': 'los lagos', 'quinchao': 'los lagos', 'puqueldon': 'los lagos', 'chonchi': 'los lagos', 'queilen': 'los lagos', 'los lagos': 'los lagos',
      'coyhaique': 'aysen', 'aisen': 'aysen', 'cochrane': 'aysen', 'chile chico': 'aysen', 'cisnes': 'aysen', 'guaitecas': 'aysen', 'lago verde': 'aysen', 'rio ibanez': 'aysen', 'tortel': 'aysen', 'o higgins': 'aysen',
      'punta arenas': 'magallanes', 'puerto natales': 'magallanes', 'porvenir': 'magallanes', 'puerto williams': 'magallanes', 'torres del paine': 'magallanes', 'laguna blanca': 'magallanes', 'rio verde': 'magallanes', 'san gregorio': 'magallanes', 'timaukel': 'magallanes', 'cabo de hornos': 'magallanes', 'antartica': 'magallanes',
      'arica': 'arica y parinacota', 'camarones': 'arica y parinacota', 'putre': 'arica y parinacota', 'general lagos': 'arica y parinacota',
      'iquique': 'tarapaca', 'alto hospicio': 'tarapaca', 'pozo almonte': 'tarapaca', 'camina': 'tarapaca', 'colchane': 'tarapaca', 'huara': 'tarapaca', 'pica': 'tarapaca',
      'antofagasta': 'antofagasta', 'calama': 'antofagasta', 'tocopilla': 'antofagasta', 'mejillones': 'antofagasta', 'taltal': 'antofagasta', 'sierra gorda': 'antofagasta', 'san pedro de atacama': 'antofagasta', 'ollague': 'antofagasta', 'maria elena': 'antofagasta',
      'copiapo': 'atacama', 'vallenar': 'atacama', 'chanaral': 'atacama', 'caldera': 'atacama', 'tierra amarilla': 'atacama', 'diego de almagro': 'atacama', 'freirina': 'atacama', 'huasco': 'atacama', 'alto del carmen': 'atacama',
      'la serena': 'coquimbo', 'coquimbo': 'coquimbo', 'ovalle': 'coquimbo', 'illapel': 'coquimbo', 'andacollo': 'coquimbo', 'vicuna': 'coquimbo', 'paihuano': 'coquimbo', 'monte patria': 'coquimbo', 'combarbala': 'coquimbo', 'rio hurtado': 'coquimbo', 'salamanca': 'coquimbo', 'los vilos': 'coquimbo', 'canela': 'coquimbo', 'la higuera': 'coquimbo',
    };
    if (comunaRegionMap[comuna]) {
      region = comunaRegionMap[comuna];
    }
  }

  let calle = partePrincipal; 
  if (numero) calle = calle.replace(numero, '').trim();
  if (matchDepto) calle = calle.replace(normalize(matchDepto[0]), '').trim();
  if (comuna) calle = calle.replace(comuna, '').trim();
  calle = calle.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^(en|la|los|las|el)\s+/i, '').replace(/-+$/, '').trim();

  return { region, comuna: comuna || null, calle, numero, depto };
}

/* ===============================
   UTILIDADES (LEVENSHTEIN Y NÚCLEO)
================================*/

function esAbreviatura(abrev, palabra) {
  if (!abrev || !palabra) return false;
  if (abrev.length >= palabra.length) return false;
  if (abrev[0] !== palabra[0]) return false; 
  
  let i = 0, j = 0;
  while (i < abrev.length && j < palabra.length) {
      if (abrev[i] === palabra[j]) i++;
      j++;
  }
  return i === abrev.length;
}

function extraerPartes(texto, tipo = 'calle') {
  let limpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
  
  const prefijosCalles = ['av', 'avenida', 'avda', 'calle', 'c', 'pasaje', 'psje', 'pje', 'pj', 'camino', 'cno', 'jiron', 'jr', 'alameda', 'ala', 'paseo', 'pto'];
  const prefijosDeptos = ['departamento', 'depto', 'dpto', 'oficina', 'of', 'local', 'casa', 'piso', 'torre', 'block', 'interior', 'int'];
  
  const prefijos = tipo === 'calle' ? prefijosCalles : prefijosDeptos;
  prefijos.sort((a, b) => b.length - a.length);

  let p = limpio.split(/\s+/);
  if (p.length > 1 && prefijos.includes(p[0])) {
      return { prefijo: p[0], nucleo: p.slice(1).join(' ') };
  }

  for (let pref of prefijos) {
      if (limpio.startsWith(pref)) {
          let resto = limpio.slice(pref.length).trim();
          if (resto.length > 0) return { prefijo: pref, nucleo: resto };
      }
  }

  return { prefijo: '', nucleo: limpio };
}

function normalizarTexto(texto, tipo = 'calle') {
  if (!texto) return '';
  let partes = extraerPartes(texto.toString(), tipo);
  return partes.nucleo.replace(/\s+/g, ' '); 
}

function calcularDistanciaLevenshtein(a, b) {
  const matriz = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matriz[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
          const costo = a[i - 1] === b[j - 1] ? 0 : 1;
          matriz[i][j] = Math.min(matriz[i - 1][j] + 1, matriz[i][j - 1] + 1, matriz[i - 1][j - 1] + costo);
      }
  }
  return matriz[a.length][b.length];
}

// EVALUADOR UNIVERSAL (Calle y Depto)
function encontrarMejorOpcion(busqueda, opciones, tipo = 'calle') {
  const busquedaRaw = busqueda.toString().trim().toLowerCase();
  const partesUser = extraerPartes(busquedaRaw, tipo);

  for (const op of opciones) {
      if (op.texto.trim().toLowerCase() === busquedaRaw)
          return { opcion: op, score: 0, metodo: 'identidad_total', top10: [] };
  }

  if (partesUser.nucleo.length >= 1) { 
      for (const op of opciones) {
          const partesOp = extraerPartes(op.texto, tipo);
          
          if (partesOp.nucleo === partesUser.nucleo) {
              if (partesUser.prefijo === partesOp.prefijo) 
                  return { opcion: op, score: 0, metodo: 'nucleo_exacto', top10: [] };
              if (partesUser.prefijo === '') 
                  return { opcion: op, score: 0, metodo: 'nucleo_exacto_sin_prefijo', top10: [] };
              if (esAbreviatura(partesUser.prefijo, partesOp.prefijo)) 
                  return { opcion: op, score: 0, metodo: `abreviatura_inteligente (${partesUser.prefijo} ⭢ ${partesOp.prefijo})`, top10: [] };
          }
      }
  }

  const busquedaNorm = normalizarTexto(busqueda, tipo);
  for (const op of opciones) {
      if (normalizarTexto(op.texto, tipo) === busquedaNorm)
          return { opcion: op, score: 0, metodo: 'exacta_normalizada', top10: [] };
  }

  const scored = opciones.map(op => {
      const opNorm   = normalizarTexto(op.texto, tipo);
      const dist     = calcularDistanciaLevenshtein(busquedaNorm, opNorm);
      const maxLen   = Math.max(busquedaNorm.length, opNorm.length) || 1;
      const ratio    = dist / maxLen;
      const contains = opNorm.includes(busquedaNorm) || busquedaNorm.includes(opNorm);
      return { opcion: op, dist, ratio, contains };
  }).sort((a, b) => {
      if (a.contains && !b.contains) return -1;
      if (!a.contains && b.contains) return  1;
      return a.ratio - b.ratio;
  });

  const top10 = scored.slice(0, 10);
  const mejor = top10[0];

  if (mejor && (mejor.contains || mejor.ratio <= 0.35)) {
      return { opcion: mejor.opcion, score: mejor.dist, metodo: mejor.contains ? 'contains' : `ratio(${mejor.ratio.toFixed(2)})` };
  }

  return { opcion: null, metodo: 'sin_coincidencia_segura' };
}

// LÓGICA ESTRICTA PARA NÚMEROS
function encontrarMejorNumero(busqueda, opciones) {
  if (!busqueda) return { opcion: null, metodo: 'vacio' };
  const busqVal = busqueda.toString().trim().toLowerCase();
  const raizBusq = busqVal.split(/[- A-Za-z]/)[0].replace(/[^0-9]/g, '');

  for (const op of opciones) {
      const textoWeb = op.texto.toString().trim().toLowerCase();
      if (textoWeb === busqVal) return { opcion: op, metodo: 'identidad_total' };
      
      const raizWeb = textoWeb.split(/[- A-Za-z]/)[0].replace(/[^0-9]/g, '');
      if (raizWeb !== raizBusq) continue;

      const normBusq = busqVal.replace(/[^0-9a-z]/gi, '');
      const normWeb = textoWeb.replace(/[^0-9a-z]/gi, '');
      if (normBusq === normWeb) return { opcion: op, metodo: 'normalizado_match' };
  }
  
  const matchRaiz = opciones.find(op => op.texto.toString().split(/[- A-Za-z]/)[0].replace(/[^0-9]/g, '') === raizBusq);
  if (matchRaiz) return { opcion: matchRaiz, metodo: 'raiz_match' };

  return { opcion: null, metodo: 'sin_coincidencia' };
}

function generarVariacionesNumero(numero) {
  const variantes = new Set();
  const base = numero.toString().trim();
  variantes.add(base);
  variantes.add('0' + base);
  return [...variantes];
}

/* ===============================
   CLICK HUMANO
================================*/
async function clickHumano(page, element) {
  await element.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await delay(200);
  let box = await element.boundingBox();
  if (!box) {
    await page.evaluate(el => {
      el.style.display = 'block';
      el.style.visibility = 'visible';
    }, element);
    await delay(200);
    box = await element.boundingBox();
  }
  if (!box) {
    await element.evaluate(el => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click();
    });
    await delay(300);
    return;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.down();
  await delay(50);
  await page.mouse.up();
  await delay(300);
}

/* ===============================
   SELECCIONAR
================================*/
async function seleccionar(page, wrapperIndex, textoOriginal, tipo = 'general', opcionesTracker = null) {
  console.log(`\n👉 [${wrapperIndex}] Seleccionando: "${textoOriginal}" (${tipo})`);
  
  const wrapperId = await page.evaluate((idx) => {
    const wrappers = document.querySelectorAll('.vscomp-ele-wrapper');
    return wrappers[idx] ? wrappers[idx].id : null;
  }, wrapperIndex);
  console.log(`   🔑 Wrapper ID: ${wrapperId}`);
  
  const wrappers = await page.$$('.vscomp-ele-wrapper');
  const wrapper  = wrappers[wrapperIndex];
  await clickHumano(page, wrapper);
  await delay(800);

  const estadoDropdown = await page.evaluate((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    if (!dropbox) return { existe: false, abierto: false };
    const estaAbierto = dropbox.style.display !== 'none';
    return { existe: true, abierto: estaAbierto, dropboxId: dropbox.id };
  }, wrapperId);

  console.log(`   📦 Dropbox existe: ${estadoDropdown.existe}, abierto: ${estadoDropdown.abierto}`);

  if (!estadoDropdown.abierto) {
    console.log("   🔄 Dropdown cerrado, forzando apertura...");
    await clickHumano(page, wrapper);
    await delay(800);
  }

  let textoBusqueda = normalizarTexto(textoOriginal.toString(), tipo);
  if (tipo === 'calle') {
      const partes = extraerPartes(textoOriginal, 'calle');
      textoBusqueda = partes.nucleo.length > 3 ? partes.nucleo : textoOriginal.toString();
  } else if (tipo === 'numero') {
      textoBusqueda = textoOriginal.toString().match(/\d+/)?.[0] || textoOriginal.toString();
  }

  const searchInput = await page.evaluateHandle((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    return dropbox ? dropbox.querySelector('.vscomp-search-input') : null;
  }, wrapperId);
  const inputValido = await page.evaluate(el => el !== null, searchInput);
  console.log(`   🔍 inputValido: ${inputValido}`);
  
  if (inputValido) {
    const inputEl = searchInput.asElement();
    await clickHumano(page, inputEl);
    await delay(150);
    const box = await inputEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    await delay(100);
    await page.keyboard.press('Backspace');
    await delay(100);
    await inputEl.type(textoBusqueda, { delay: 80 });
    const valorEscrito = await page.evaluate(el => el.value, inputEl);
    console.log(`   ✏️ Valor en input: "${valorEscrito}"`);
    await delay(2000);
  } else {
    const globalInput = await page.$('.vscomp-search-input');
    if (globalInput) {
      await clickHumano(page, globalInput);
      await delay(150);
      await globalInput.type(textoBusqueda, { delay: 80 });
      await delay(2000);
    }
  }

  await page.waitForFunction((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    if (!dropbox) return false;
    return dropbox.querySelectorAll('.vscomp-option').length > 0;
  }, { timeout: 6000 }, wrapperId).catch(() => console.log("   ⚠️ Timeout opciones"));
  
  await delay(500);
  const opcionesDisponibles = await page.evaluate((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    if (!dropbox) return [];
    return Array.from(dropbox.querySelectorAll('.vscomp-option')).map(op => ({
      value: op.getAttribute('data-value'),
      texto: op.querySelector('.vscomp-option-text')?.getAttribute('data-tooltip') ||
             op.querySelector('.vscomp-option-text')?.textContent?.trim() || ''
    }));
  }, wrapperId);
  
  console.log(`   📋 ${opcionesDisponibles.length} opciones`);

  if (opcionesDisponibles.length > 0 && opcionesTracker) {
      opcionesTracker[tipo] = opcionesDisponibles.map(o => o.texto);
  }

  if (opcionesDisponibles.length === 0) {
    await page.keyboard.press('Escape');
    await delay(300);
    return { ok: false, opcionesDisponibles };
  }

  let coincidencia;
  if (tipo === 'calle') {
    coincidencia = encontrarMejorOpcion(textoOriginal, opcionesDisponibles, 'calle');
  } else if (tipo === 'numero') {
    coincidencia = encontrarMejorNumero(textoOriginal, opcionesDisponibles);
  } else {
    coincidencia = encontrarMejorOpcion(textoOriginal, opcionesDisponibles, 'calle'); 
  }

  if (!coincidencia || !coincidencia.opcion) {
    console.log(`   ❌ No hay coincidencia segura para "${textoOriginal}"`);
    await page.keyboard.press('Escape');
    await delay(300);
    return { ok: false, opcionesDisponibles };
  }
  
  console.log(`   🎯 "${coincidencia.opcion.texto}" [${coincidencia.metodo}]`);
  const resultado = await page.evaluate((wid, val) => {
    const wrapper = document.getElementById(wid);
    if (!wrapper) return 'wrapper no encontrado';
    if (typeof wrapper.setValue !== 'function') return 'setValue no es función';
    wrapper.setValue(val);
    return 'ok';
  }, wrapperId, coincidencia.opcion.value);
  console.log(`   📡 setValue: ${resultado}`);
  
  await delay(800);
  if (resultado !== 'ok') {
    await page.evaluate((wid, val) => {
      const suffix = wid.replace('vscomp-ele-wrapper-', '');
      const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
      if (!dropbox) return;
      const op = dropbox.querySelector(`.vscomp-option[data-value="${val}"]`);
      if (op) ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(ev =>
        op.dispatchEvent(new PointerEvent(ev, { bubbles: true, cancelable: true, pointerId: 1 }))
      );
    }, wrapperId, coincidencia.opcion.value);
    await delay(800);
  }
  
  const abierto = await page.evaluate((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const container = document.querySelector(`#vscomp-dropbox-container-${suffix} .vscomp-options-container`);
    return container ? window.getComputedStyle(container).display !== 'none' : false;
  }, wrapperId);
  if (abierto) { await page.keyboard.press('Escape'); await delay(300); }
  
  const confirmacion = await page.evaluate((wid) => {
    const wrapper = document.getElementById(wid);
    return {
      textoVisible: wrapper?.querySelector('.vscomp-value')?.textContent?.trim() || '(vacío)'
    };
  }, wrapperId);
  console.log(`   ✅ "${confirmacion.textoVisible}"`);
  
  return { ok: true, seleccionado: coincidencia.opcion.texto, metodo: coincidencia.metodo, opcionesDisponibles };
}

/* ===============================
   MANEJAR DEPARTAMENTO
================================*/
async function manejarDepartamento(page, deptoOriginal, opcionesTracker) {
  console.log("\n🔍 Verificando campo departamento...");
  
  if (!deptoOriginal || deptoOriginal.toString().trim() === '') {
    console.log("   ℹ️ Sin depto — continuando");
    return { ok: true, saltado: true };
  }
  
  const wrapperIndex = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.vscomp-ele-wrapper');
    for (let i = 0; i < wrappers.length; i++) {
      const valueDiv = wrappers[i].querySelector('.vscomp-value');
      const tooltip = valueDiv?.getAttribute('data-tooltip') || '';
      const text = valueDiv?.textContent?.trim() || '';
      if (tooltip.includes('Ej. 2912') || text.includes('Ej. 2912')) return i;
    }
    return -1;
  });
  
  if (wrapperIndex === -1) {
    console.log("   ℹ️ No se encontró campo depto");
    return { ok: false, falloDepto: true };
  }
  
  console.log(`   🏢 Depto encontrado en wrapper ${wrapperIndex}`);
  
  const wrapperId = await page.evaluate((idx) => {
    const wrappers = document.querySelectorAll('.vscomp-ele-wrapper');
    return wrappers[idx] ? wrappers[idx].id : null;
  }, wrapperIndex);
  
  const wrappers = await page.$$('.vscomp-ele-wrapper');
  
  await clickHumano(page, wrappers[wrapperIndex]);
  await delay(800);

  const partesDepto = extraerPartes(deptoOriginal.toString(), 'depto');
  let deptoBusqueda = partesDepto.nucleo;
  const matchNum = deptoBusqueda.match(/\d+/);
  if (matchNum) {
      deptoBusqueda = matchNum[0];
  }
  if (!deptoBusqueda || deptoBusqueda.trim() === '') {
      deptoBusqueda = deptoOriginal.toString();
  }
  
  const searchInput = await page.evaluateHandle((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    return dropbox ? dropbox.querySelector('.vscomp-search-input') : null;
  }, wrapperId);
  
  if (searchInput) {
    const inputEl = searchInput.asElement();
    await clickHumano(page, inputEl);
    await delay(150);
    const box = await inputEl.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    await delay(100);
    await page.keyboard.press('Backspace');
    await delay(100);
    
    await inputEl.type(deptoBusqueda, { delay: 80 }); 
    await delay(2000);
  }
  
  await page.waitForFunction((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    if (!dropbox) return false;
    return dropbox.querySelectorAll('.vscomp-option').length > 0;
  }, { timeout: 5000 }, wrapperId).catch(() => console.log("   ⚠️ Timeout opciones"));
  
  await delay(500);
  
  const opciones = await page.evaluate((wid) => {
    const suffix = wid.replace('vscomp-ele-wrapper-', '');
    const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
    if (!dropbox) return [];
    return Array.from(dropbox.querySelectorAll('.vscomp-option')).map(op => ({
      value: op.getAttribute('data-value'),
      texto: op.querySelector('.vscomp-option-text')?.textContent?.trim() || ''
    }));
  }, wrapperId);
  
  console.log(`   📋 ${opciones.length} opciones de depto`);

  if (opciones.length > 0 && opcionesTracker) {
      opcionesTracker.depto = opciones.map(op => op.texto);
  }

  if (opciones.length === 0) {
    await page.keyboard.press('Escape');
    return { ok: false, falloDepto: true };
  }
  
  const coincidencia = encontrarMejorOpcion(deptoOriginal.toString(), opciones, 'depto');
  
  if (!coincidencia || !coincidencia.opcion) {
    console.log(`   ❌ No hay coincidencia para "${deptoOriginal}"`);
    await page.keyboard.press('Escape');
    return { ok: false, falloDepto: true };
  }
  
  console.log(`   🎯 Seleccionando: "${coincidencia.opcion.texto}"`);

  const resultado = await page.evaluate((wid, val) => {
    const wrapper = document.getElementById(wid);
    if (wrapper && typeof wrapper.setValue === 'function') {
      wrapper.setValue(val);
      return 'ok';
    }
    return 'error';
  }, wrapperId, coincidencia.opcion.value);
  
  await delay(800);
  
  if (resultado !== 'ok') {
    console.log("   🔄 Intentando click manual...");
    await page.evaluate((wid, val) => {
      const suffix = wid.replace('vscomp-ele-wrapper-', '');
      const dropbox = document.getElementById(`vscomp-dropbox-container-${suffix}`);
      if (!dropbox) return;
      const opcion = dropbox.querySelector(`.vscomp-option[data-value="${val}"]`);
      if (opcion) {
        opcion.scrollIntoView({ block: 'center' });
        opcion.click();
        opcion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        opcion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        opcion.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }
    }, wrapperId, coincidencia.opcion.value);
    await delay(800);
  }
  
  const confirmacion = await page.evaluate((wid) => {
    const wrapper = document.getElementById(wid);
    return wrapper?.querySelector('.vscomp-value')?.textContent?.trim() || '(vacío)';
  }, wrapperId);
  
  console.log(`   ✅ Depto seleccionado: "${confirmacion}"`);

  await page.keyboard.press('Escape');
  await delay(300);
  return { ok: true, seleccionado: coincidencia.opcion.texto, metodo: coincidencia.metodo };
}

/* ===============================
   LEER PANTALLA
================================*/
async function leerPantalla(page, contexto) {
  console.log(`\n🔎 LEYENDO PANTALLA [${contexto}]...`);
  const screenshotPath = `diagnostico_${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const info = await page.evaluate(() => {
    const url = window.location.href;
    const errores = [];
    ['[class*="error"]','[class*="alert"]','[class*="warning"]','.vscomp-no-options','[role="alert"]'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const txt = el.innerText?.trim();
        const visible = el.offsetParent !== null && window.getComputedStyle(el).display !== 'none';
        if (visible && txt && txt.length > 3) errores.push(`[${sel}] ${txt}`);
      });
    });
    const estadoWrappers = Array.from(document.querySelectorAll('.vscomp-ele-wrapper')).map((w, i) => ({
      index: i,
      valorActual: w.querySelector('.vscomp-value')?.textContent?.trim() || '(vacío)',
      dataValue: w.getAttribute('data-value') || '(vacío)',
      disabled: w.classList.contains('disabled') || w.hasAttribute('disabled')
    }));
    return { url, errores, estadoWrappers };
  });
  console.log(`📍 URL: ${info.url}`);
  info.estadoWrappers.forEach(w =>
    console.log(`   [${w.index}] ${w.disabled ? '🔒' : '✅'} "${w.valorActual}"`));
  if (info.errores.length > 0) [...new Set(info.errores)].forEach(e => console.log(`   ⚠️ ${e}`));
  console.log(`📸 ${screenshotPath}`);
  return { ...info, screenshotPath };
}

/* ===============================
   DETECTAR MODALES
================================*/
async function detectarModal(page) {
  console.log("\n🔍 Verificando modales...");
  await delay(2000);
  const modal = await page.evaluate(() => {
    const selectoresModal = [
      '[class*="modal"]','[class*="Modal"]','[class*="popup"]','[class*="dialog"]',
      '[role="dialog"]','[role="alertdialog"]','[class*="toast"]','[class*="aviso"]',
      '[aria-modal="true"]','.swal2-container','[class*="swal"]','[class*="confirm"]'
    ];
    const palabrasServicioActivo = [
      'ya posee','ya tiene','servicio activo','cliente entel','ya es cliente',
      'plan activo','contrato vigente','ya cuenta','fibra activa','internet activo',
      'ya dispone','tiene contratado','servicio existente'
    ];
    const palabrasError = [
      'error','problema','no es posible','no podemos','intente nuevamente',
      'ocurrió un error','fuera de servicio','mantencion','mantención'
    ];
    const palabrasSinCobertura = [
      'sin cobertura','no hay cobertura','no encontramos','no tenemos cobertura',
      'fuera de cobertura','no llegamos','no disponemos'
    ];
    let resultado = null;
    for (const sel of selectoresModal) {
      for (const el of document.querySelectorAll(sel)) {
        const visible = el.offsetParent !== null &&
                        window.getComputedStyle(el).display !== 'none' &&
                        window.getComputedStyle(el).visibility !== 'hidden' &&
                        el.offsetHeight > 0;
        if (!visible) continue;
        const texto = (el.innerText || '').trim().toLowerCase();
        if (texto.length < 5) continue;
        let tipo = 'aviso_generico';
        if (palabrasServicioActivo.some(p => texto.includes(p)))    tipo = 'servicio_activo';
        else if (palabrasError.some(p => texto.includes(p)))        tipo = 'error';
        else if (palabrasSinCobertura.some(p => texto.includes(p))) tipo = 'sin_cobertura';
        const botonesModal = Array.from(el.querySelectorAll('button,[role="button"],a'))
          .map(b => b.innerText?.trim()).filter(Boolean);
        resultado = { tipo, textoCompleto: el.innerText?.trim().substring(0, 500), botones: botonesModal };
        // Ndajatokái sin_cobertura ko'ápe, factibilidad añoite ojapo
        if (tipo === 'servicio_activo' || tipo === 'error') break;
      }
      if (resultado && (resultado.tipo === 'servicio_activo' || resultado.tipo === 'error')) break;
    }
    return resultado;
  });
  if (!modal) { console.log("   ✅ Sin modales"); return null; }
  const modalPath = `modal_${Date.now()}.png`;
  await page.screenshot({ path: modalPath, fullPage: true });
  console.log(`🚨 MODAL: ${modal.tipo.toUpperCase()} — "${modal.textoCompleto}"`);
  let mensajeEnvio = '';
  switch (modal.tipo) {
    case 'servicio_activo': mensajeEnvio = `⚠️ Esta dirección ya posee servicio Entel activo.\n\n📄 "${modal.textoCompleto}"`; break;
    case 'sin_cobertura':   mensajeEnvio = `❌ Sin cobertura.\n\n📄 "${modal.textoCompleto}"\n\nVerifica la dirección e inténtalo nuevamente.`; break;
    case 'error':           mensajeEnvio = `❌ Error del sistema.\n\n📄 "${modal.textoCompleto}"\n\nIntenta nuevamente más tarde.`; break;
    default:                mensajeEnvio = `⚠️ Aviso del sistema.\n\n📄 "${modal.textoCompleto}"`;
  }
  const cerrado = await page.evaluate(() => {
    const botonesOk = ['aceptar','ok','cerrar','close','entendido','continuar','volver'];
    for (const btn of document.querySelectorAll('button,[role="button"]')) {
      const txt = (btn.innerText || '').trim().toLowerCase();
      const visible = btn.offsetParent !== null && window.getComputedStyle(btn).display !== 'none';
      if (visible && botonesOk.some(b => txt.includes(b))) { btn.click(); return txt; }
    }
    return null;
  });
  if (!cerrado) await page.keyboard.press('Escape');
  await delay(1000);
  return { tipo: modal.tipo, texto: modal.textoCompleto, mensajeEnvio, screenshotPath: modalPath };
}

/* ===============================
   CHECK FACTIBILIDAD
================================*/
async function checkFactibilidad(page, direccion) {
  console.log("\n⏳ Verificando factibilidad...");
  try { await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }); }
  catch (e) { await delay(4000); }
  const urlActual = page.url();
  console.log(`   🔗 URL: ${urlActual}`);
  const hayFactibilidad = urlActual.includes("PlanSelection") ||
                          urlActual.includes("plan") ||
                          urlActual.includes("seleccion");
  const screenshotPath = `factibilidad_${Date.now()}.png`;
  await delay(2000);
 console.log("📸 Tomando foto enfocada en los planes (cálculo aproximado)...");
  
  // Damos 1 segundo para que terminen de aparecer los precios y tarjetas
  await delay(1000); 

  // Tomamos el recorte


 await page.screenshot({
    path: screenshotPath, // Nombre de tu variable donde se guarda
    clip: {
      x: 80,         // Lo dejamos en 0 porque el lado izquierdo se ve bien pegadito
      y: 535,       // (Antes 510) Lo subimos 60 píxeles para que salga el borde superior redondeado de la tarjeta
      width: 1230,  // (Antes 1150) Lo ensanchamos para asegurar que el 4to plan quepa entero
      height: 230,   // (Antes 240) Lo hacemos mucho más alto para atrapar el botón azul y los beneficios de abajo
    }
  });

  if (hayFactibilidad) {
    const info = await page.evaluate(() => {
      const textos = [];
      ['h1','h2','h3','[class*="plan"]','[class*="precio"]','[class*="mbps"]','[class*="card"]'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const txt = el.innerText?.trim();
          if (txt && txt.length > 2 && txt.length < 500) textos.push(txt);
        });
      });
      return [...new Set(textos)].slice(0, 20).join('\n');
    });
    return { factible: true, screenshotPath, direccion, info,
      mensaje: `✅ ¡Hay factibilidad para ${direccion}!\nRevisa el screenshot con los planes disponibles.` };
  } else {
    const mensajePagina = await page.evaluate(() => {
      for (const sel of ['[class*="error"]','[class*="alert"]','h1','h2','p']) {
        const txt = document.querySelector(sel)?.innerText?.trim();
        if (txt && txt.length > 5) return txt;
      }
      return null;
    });
    return { factible: false, screenshotPath, direccion, mensajePagina,
      mensaje: `❌ Sin factibilidad para ${direccion}.\nPor favor verifica la dirección e inténtalo nuevamente.` };
  }
}

/* ===============================
   INTENTAR COMBINACIÓN
================================*/
async function intentarCombinacion(page, region, comuna, calle, numero, depto, opcionesTracker) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔄 calle="${calle}" | numero="${numero}" | depto="${depto || '-'}"`);
  await page.goto('https://miperfil.entel.cl/Web_entel_TomaPedido_EU/factibilidad',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.vscomp-ele-wrapper', { timeout: 10000 });
  await delay(1000);

  const resRegion = await seleccionar(page, 0, region, 'general', null);
  if (!resRegion.ok) { await leerPantalla(page, 'FALLO REGIÓN'); return null; }
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
  await delay(600);

  const resComuna = await seleccionar(page, 1, comuna, 'general', null);
  if (!resComuna.ok) { await leerPantalla(page, 'FALLO COMUNA'); return null; }
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
  await delay(600);

  const resCalle = await seleccionar(page, 2, calle, 'calle', opcionesTracker);
  if (!resCalle.ok) { 
    const matchSufijo = calle.match(/(-[A-Za-z0-9]+)/);
    if (matchSufijo) {                                      
      const calleCorregida = calle.replace(matchSufijo[1], '').trim();
      const numeroCorregido = numero + matchSufijo[1];
      console.log(`   🔧 Reintentando con calle="${calleCorregida}" numero="${numeroCorregido}"`);
      return await intentarCombinacion(page, region, comuna, calleCorregida, numeroCorregido, depto, opcionesTracker);
    }
    await leerPantalla(page, `FALLO CALLE: ${calle}`); 
    return { factible: false, falloCalle: true };
  }

  await page.waitForNetworkIdle({ timeout: 8000 }).catch(() => {});
  await delay(600);

  const resNumero = await seleccionar(page, 3, numero, 'numero', opcionesTracker);
  if (!resNumero.ok) { 
    await leerPantalla(page, `FALLO NÚMERO: ${numero}`); 
    return { factible: false, falloNumero: true };
  }
  
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
  await delay(800);

  const resDepto = await manejarDepartamento(page, depto, opcionesTracker);
  if (!resDepto.ok && !resDepto.saltado) {
     return { factible: false, falloDepto: true };
  }
  await delay(500);

  await leerPantalla(page, `PRE-VERIFICAR [${calle} ${numero}]`);

  console.log("\n🔍 Buscando botón Verificar...");
  
  // 1. Clic en una zona muerta de la pantalla para quitar el foco de cualquier input anterior
  await page.mouse.click(10, 10).catch(() => {});
  await delay(300);

  const botones = await page.$$('button');
  for (const btn of botones) {
    const visible = await page.evaluate(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none', btn);
    if (!visible) continue;
    
    const t = await page.evaluate(el => el.textContent.trim(), btn);
    if (t && t.toLowerCase().includes("verificar")) {
      console.log("✅ Click INVISIBLE en Verificar (evita rozar el Depto)");
      
      // 2. Usamos JS puro para hacer el clic sin arrastrar el mouse por la pantalla
      await page.evaluate(el => el.click(), btn);
      break;
    }
  }

  // Espera 8 segundos porque Entel puede ser lento
  await delay(8000);  

  const hasServicioActivo = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('h5.f-inter-bold span'));
    return spans.some(s => s.textContent.includes('Esta dirección ya tiene un servicio contratado'));
  });

  if (hasServicioActivo) {
    const modalDiv = await page.$('div.text-align-center.ThemeGrid_Width10');
    const modalPath = `servicio_activo_${Date.now()}.png`;
    if (modalDiv) {
      const box = await modalDiv.boundingBox();
      if (box) {
        await page.screenshot({
          path: modalPath,
          clip: { x: box.x - 15, y: box.y - 15, width: box.width + 30, height: box.height + 30 }
        });
      } else {
        await page.screenshot({ path: modalPath, fullPage: true });
      }
    } else {
      await page.screenshot({ path: modalPath, fullPage: true });
    }
    
    return { bloqueado: true, modal: { tipo: 'servicio_activo', mensajeEnvio: '⚠️ Esta dirección ya tiene un servicio Entel activo.', screenshotPath: modalPath } };
  }

  const modalDetectado = await detectarModal(page);
  // Bloquear solo para servicio_activo y error, sin_cobertura pasa al factibilidad final
  if (modalDetectado && (modalDetectado.tipo === 'servicio_activo' || modalDetectado.tipo === 'error'))
    return { bloqueado: true, modal: modalDetectado };

  // Evita el problema de "depto depto 1104"
  const sufijoDepto = depto ? (depto.toLowerCase().includes('depto') || depto.toLowerCase().includes('dpto') ? ` ${depto}` : ` depto ${depto}`) : '';
  const resultadoFactibilidad = await checkFactibilidad(page, `${calle} ${numero}${sufijoDepto}, ${comuna}`);
  
  resultadoFactibilidad.decisiones = {
      calle: resCalle.seleccionado,
      numero: resNumero.seleccionado,
      depto: resDepto.seleccionado
  };

  return resultadoFactibilidad;
}

function construirBloqueOpciones(tracker) {
  let textoSugerencias = "";
  
  if (tracker.calle && tracker.calle.length > 0) {
      const unicas = [...new Set(tracker.calle)];
      const primerasVariantes = unicas.slice(0, 6).join('\n• ');
      textoSugerencias += '\n\n🛣️ *Variantes de calle encontradas:*\n• ' + primerasVariantes + '\n\n_Intenta enviar la dirección usando el nombre exacto de la calle._';
  } 
  if (tracker.numero && tracker.numero.length > 0) {
      const unicas = [...new Set(tracker.numero)];
      const variantesNumero = unicas.slice(0, 6).join('\n• ');
      textoSugerencias += '\n\n💡 *Variantes de número encontradas:*\n• ' + variantesNumero + '\n\n_Intenta enviar la dirección usando alguna de estas variantes._';
  }
  if (tracker.depto && tracker.depto.length > 0) {
      const unicas = [...new Set(tracker.depto)];
      const variantesDepto = unicas.slice(0, 6).join('\n• ');
      textoSugerencias += '\n\n🏢 *Variantes de depto encontradas:*\n• ' + variantesDepto;
  }
  
  return textoSugerencias;
}

/* ===============================
   PROCESAR DIRECCIÓN
================================*/
async function procesarDireccion(textoDireccion, enviarMensaje, enviarFoto, userId = null) {
  console.log(`\n📨 Procesando: "${textoDireccion}"`);
  const dir = parsearDireccion(textoDireccion);
  console.log(`\n📍 Parseada:`, dir);

  await enviarMensaje(
    `⏳ Procesando consulta para:\n📍 ${textoDireccion}\n\n` +
    `• Calle: ${dir.calle}\n` +
    `• Número: ${dir.numero}\n` +
    `• Comuna: ${dir.comuna}\n` +
    `• Depto: ${dir.depto || '-'}\n\n` +
    `_Esto puede tomar unos minutos..._`
  );

  if (!dir.calle || !dir.numero) {
    await enviarMensaje(
      `⚠️ No pude identificar la dirección completa.\n\n` +
      `Por favor envía en formato:\n*Nombre Calle 123, Comuna*\n\n` +
      `Ejemplo:\n_Av\\. Providencia 1234, Providencia_`
    );
    return;
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 10,
    args: [
      '--window-size=1920,1080',      
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--ignore-certificate-errors',
      '--disable-dev-shm-usage',
    ],
    //defaultViewport: { width: 1920, height: 1080 }  
      defaultViewport: null  // IMPORTANTE: null usa el tamaño real de la ventana

  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const variacionesNumero = generarVariacionesNumero(dir.numero);
  let resultadoFinal     = null;
  let totalIntentos      = 0;
  
  let opcionesExtraidasGlobales = { calle: [], numero: [], depto: [] };

  try {
    externo:
    for (const numero of variacionesNumero) {
      totalIntentos++;
      console.log(`\n🔁 Intento ${totalIntentos}/${variacionesNumero.length} — número: "${numero}"`);
      const resultado = await intentarCombinacion(
        page, dir.region, dir.comuna, dir.calle, numero, dir.depto, opcionesExtraidasGlobales
      );

      if (resultado) {
        resultadoFinal = resultado;
        // Si hay fallo en la lectura de los desplegables, cortamos y sugerimos las opciones
        if (resultado.falloCalle || resultado.falloNumero || resultado.falloDepto) break externo; 
      }

      if (resultado?.bloqueado) {
        resultadoFinal = resultado.modal;
        break externo;
      }
      if (resultado?.factible === true) {
        resultadoFinal = resultado;
        break externo;
      }
      await delay(1000);
    }

    // ==========================================
    // MENSAJERÍA DE RESPUESTA A TELEGRAM
    // ==========================================

    if (resultadoFinal?.tipo === 'servicio_activo') {
      await enviarMensaje(resultadoFinal.mensajeEnvio);
      if (resultadoFinal.screenshotPath && fs.existsSync(resultadoFinal.screenshotPath))
        await enviarFoto(resultadoFinal.screenshotPath, '📸 Screenshot del aviso');

    } else if (resultadoFinal?.tipo === 'sin_cobertura') {
      let msgFallo = resultadoFinal.mensajeEnvio;
      msgFallo += construirBloqueOpciones(opcionesExtraidasGlobales);
      await enviarMensaje(msgFallo);

      const rutaImagen = path.join(__dirname, 'imagenes', 'sin_cobertura.png');
      if (fs.existsSync(rutaImagen)) await enviarFoto(rutaImagen, '📭 Sin cobertura en tu sector');

      if (resultadoFinal.screenshotPath && fs.existsSync(resultadoFinal.screenshotPath))
        await enviarFoto(resultadoFinal.screenshotPath, '📸 Screenshot del aviso');

    } else if (resultadoFinal?.factible === true) {
      let opcionesInfo = construirBloqueOpciones(opcionesExtraidasGlobales);
      let mensajeFactibilidad = resultadoFinal.mensaje + (opcionesInfo ? "\n\n" + opcionesInfo : "");
      await enviarMensaje(mensajeFactibilidad);

      const rutaImagen = path.join(__dirname, 'imagenes', 'entel.png');
      if (fs.existsSync(rutaImagen)) {
        await enviarFoto(rutaImagen, '🎉 ¡Entel Fibra disponible! 🚀');
      } else {
        await enviarMensaje('⚠️ No se encontró la imagen promocional.');
      }

      if (resultadoFinal.screenshotPath && fs.existsSync(resultadoFinal.screenshotPath))
        await enviarFoto(resultadoFinal.screenshotPath, '📸 Screenshot factibilidad');

    } else {
      // ESTADO GENÉRICO DE SIN FACTIBILIDAD
      let textoSugerencias = construirBloqueOpciones(opcionesExtraidasGlobales);

      const sufijoDepto = dir.depto ? (dir.depto.toLowerCase().includes('depto') || dir.depto.toLowerCase().includes('dpto') ? ` ${dir.depto}` : ` depto ${dir.depto}`) : '';

      await enviarMensaje(
        `❌ Sin factibilidad para ${dir.calle} ${dir.numero}${sufijoDepto}, ${dir.comuna}.\n\n` +
        `Se probaron ${totalIntentos} variación(es).` + textoSugerencias
      );

      const rutaImagen = path.join(__dirname, 'imagenes', 'sin_cobertura.png');
      if (fs.existsSync(rutaImagen)) await enviarFoto(rutaImagen, '📭 Sin cobertura en tu sector');

      if (resultadoFinal?.screenshotPath && fs.existsSync(resultadoFinal.screenshotPath))
        await enviarFoto(resultadoFinal.screenshotPath, '📸 Screenshot');
    }

  } catch (err) {
    if (err.message.includes('has-text')) {
      await enviarMensaje(`⚠️ Esta dirección ya tiene un servicio contratado o no está disponible.`);
      const modalPath = `servicio_activo_${Date.now()}.png`;
      await page.screenshot({ path: modalPath, fullPage: true }).catch(() => {});
      if (fs.existsSync(modalPath)) await enviarFoto(modalPath, '📸 Estado de la dirección');
      return;
    }
    
    console.error('❌ Error:', err.message);
    const errorPath = `error_${Date.now()}.png`;
    await page.screenshot({ path: errorPath, fullPage: true }).catch(() => {});
    
    let msgErr = `❌ Error al verificar ${dir.calle} ${dir.numero}, ${dir.comuna}.\n\nPor favor verifica la dirección e inténtalo nuevamente.\n\n🔧 ${err.message}`;
    msgErr += construirBloqueOpciones(opcionesExtraidasGlobales);
    await enviarMensaje(msgErr);

    const rutaImagen = path.join(__dirname, 'imagenes', 'direccion_no_encontrada.png');
    if (fs.existsSync(rutaImagen)) await enviarFoto(rutaImagen, '📍 Dirección no encontrada');

    if (fs.existsSync(errorPath))
      await enviarFoto(errorPath, '📸 Screenshot del error');
  } finally {
    await browser.close();
  }
}


/* ===============================
   BOT TELEGRAM
================================*/
function iniciarTelegram() {
  console.log("🤖 Iniciando bot Telegram...");

  const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, {
    polling: {
      interval: 1000,
      autoStart: false,
      params: { timeout: 10 }
    }
  });

  bot.deleteWebHook()
    .then(() => {
      console.log("✅ Webhook limpiado");
      return bot.startPolling();
    })
    .then(() => {
      console.log("✅ Bot Telegram activo — esperando mensajes...");
    })
    .catch(err => console.error("❌ Error al iniciar:", err.message));

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `👋 ¡Hola! Soy el bot de factibilidad Entel de FreeWork.\n\n` +
      `📡 Envíame una dirección en texto libre y verificaré si existe cobertura.\n\n` +
      `⚠️ Importante:\n` +
      `La comuna debe ir siempre al final, después de una coma (,)\n\n` +
      `📝 Ejemplos:\n` +
      `• _Av. Providencia 1234, Providencia_\n` +
      `• _Circunvalación 558 depto 302, Santiago_\n` +
      `• _Pasaje Los Aromos 45, Maipú_`,
      { parse_mode: 'MarkdownV2' }
    );

    const rutaImagen = path.join(__dirname, 'imagenes', 'bienvenida.png');
    if (fs.existsSync(rutaImagen)) {
      bot.sendPhoto(msg.chat.id, fs.createReadStream(rutaImagen), { 
        caption: '🤖 ¡Bienvenido al Bot de Factibilidad Entel!' 
      });
    }
  });

  bot.onText(/\/miid/, (msg) => {
    const id = msg.from.id;
    const nombre = msg.from.first_name || 'Usuario';
    
    bot.sendMessage(msg.chat.id,
      `👤 *${nombre}*\n\n` +
      `🆔 *Tu ID es:*\n\`${id}\`\n\n` +
      `📩 Envía este número al administrador para que te habilite.`,
      { parse_mode: 'Markdown' }
    );
  });


  // ─── COMANDO /rut ─────────────────────────────────────────────
const API_SERVER = process.env.API_SERVER || `http://localhost:${process.env.PORT || 3001}`;

bot.onText(/\/rut (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const rut = match[1].trim().replace(/\./g, '').toUpperCase();

  const permiso = await verificarPermiso(msg.from.id, null, 'consultar');
  if (!permiso.permitido) {
    await bot.sendMessage(chatId, `❌ ${permiso.mensaje}`);
    return;
  }

  await bot.sendMessage(chatId, `🔍 Consultando RUT: ${rut}...`);

  try {
    const respuesta = await axios.post(`${API_SERVER}/rut`, {
      rut: rut,
      userId: String(msg.from.id)
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    });

    const datos = respuesta.data;

    if (datos.ok) {
      await bot.sendMessage(chatId,
        `✅ *Resultado RUT: ${datos.rut}*\n\n` +
        `📺 TV: ${datos.tv}\n` +
        `📶 Internet: ${datos.internet}\n` +
        `💰 Cupo: ${datos.cupo}\n` +
        `📦 Packs: ${datos.planes}\n\n` +
        `🎯 *${datos.interpretacion}*`,
        { parse_mode: 'Markdown' }
      );
      if (datos.screenshot) {
        const buf = Buffer.from(datos.screenshot, 'base64');
        await bot.sendPhoto(chatId, buf, { caption: `📸 RUT: ${datos.rut}` });
      }
    } else {
      await bot.sendMessage(chatId, `❌ Error: ${datos.error}`);
    }
  } catch (err) {
    // Manejo específico de errores de axios
    if (err.code === 'ECONNABORTED') {
      await bot.sendMessage(chatId, `❌ Timeout: El servidor no respondió en 2 minutos.`);
    } else if (err.response) {
      await bot.sendMessage(chatId, `❌ Error del servidor: ${err.response.status}`);
    } else if (err.request) {
      await bot.sendMessage(chatId, `❌ No se pudo conectar al servidor API.`);
    } else {
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  }
});


  bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    const chatId = msg.chat.id;
    const texto  = msg.text?.trim();
    if (!texto) return;

    const userId = msg.from.id;
    console.log('ID enviado:', userId); 
    const permiso = await verificarPermiso(userId, null, 'consultar');
    console.log('Respuesta:', JSON.stringify(permiso)); 
    if (!permiso.permitido) {
      await bot.sendMessage(chatId, `❌ ${permiso.mensaje}`);
      return;
    }
    
    const enviarMensaje = async (txt) => {
      try {
        await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
      } catch (e) {
        await bot.sendMessage(chatId, txt).catch(() => {});
      }
    };

    const enviarFoto = async (rutaFoto, caption) => {
      try {
        await bot.sendPhoto(chatId, fs.createReadStream(rutaFoto), { caption });
        
        if (!rutaFoto.includes('imagenes') && fs.existsSync(rutaFoto)) {
          fs.unlink(rutaFoto, () => {});
        }
      } catch (e) {
        console.error('❌ Error enviando foto:', e.message);
      }
    };

    await procesarDireccion(texto, enviarMensaje, enviarFoto);
    
    const permisoActualizado = await verificarPermiso(msg.from.id, null, 'consultar');

if (permisoActualizado?.estadisticas) {
  const s = permisoActualizado.estadisticas;

  const usado = Number(s.dia.usadas) || 0;
  const maximo = Math.max(1, Number(s.dia.maximo) || 0);
  const porcentaje = Math.min(100, Math.max(0, Math.round((usado / maximo) * 100)));

  const restantesHoy = Number(s.dia.restantes) || 0;
  const restantesSemana = Number(s.semana.restantes) || 0;

  let hoyTexto = `${restantesHoy}`;
  let emojiHoy = "📅";
  let lineaTip = "🎯 *Tip:* cada venta *INSTALADA* carga *+cupos*";

  if (restantesHoy === 0) {
    emojiHoy = "⏳";
    hoyTexto = "Sin cupo disponible";
  } else if (restantesHoy <= 7) {
    emojiHoy = "🔴";
    hoyTexto = `*${restantesHoy}*`;
  }

  const msgConsumo = `📌 *Consultas:* ${usado}/${maximo} (${porcentaje}%)\n${emojiHoy} *Hoy:* ${hoyTexto} | *Semana:* ${restantesSemana}\n${lineaTip}`;

   await bot.sendMessage(msg.chat.id, msgConsumo, { parse_mode: 'Markdown' });
}
});
  bot.on('polling_error', (err) => {
    console.error(`❌ Telegram error: ${err.message}`);
    if (err.message.includes('409')) {
      console.log("⚠️ Otra instancia corriendo — cerrando...");
      process.exit(1);
    }
  });
}

/* ===============================
   MAIN
================================*/
// DESPUÉS:
async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🚀 Bot Factibilidad Entel — Canal: ${CONFIG.CANAL}`);
  console.log(`${"═".repeat(60)}\n`);
  
  // Según el canal, inicia la interfaz correspondiente
  switch(CONFIG.CANAL) {
    case 'telegram':
      iniciarTelegram();
      break;
    case 'whatsapp':
      console.log("📱 Modo WhatsApp - Próximamente");
      // iniciarWhatsApp();
      break;
    case 'web':
      console.log("🌐 Modo Web - Próximamente");
      // iniciarWeb();
      break;
    default:
      iniciarTelegram(); // Por defecto usa Telegram
  }
}

// ✅ Correcto
process.on('unhandledRejection', err => console.error('❌ Error no manejado:', err));

// Exportar la función que api-server.js necesita
// DESPUÉS:
module.exports = {
  procesarDireccion,
  verificarPermiso
};

// Solo ejecutar main() si este archivo se ejecuta directamente (no si es importado)
if (require.main === module) {
  main();
}