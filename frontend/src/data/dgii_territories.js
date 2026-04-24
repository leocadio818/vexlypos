// ══════════════════════════════════════════════════════════════════
// Códigos oficiales DGII / ONE (Oficina Nacional de Estadística)
// República Dominicana — para uso en e-CF
//
// Provincias: código de 6 dígitos (XX0000)
// Municipios: código de 6 dígitos (primeros 2 = provincia)
//
// Formato exigido por el XSD ProvinciaMunicipioType:
// - Distrito Nacional → "010000"
// - Azua → "020000"
// - Santo Domingo de Guzmán (municipio) → "010101"
// ══════════════════════════════════════════════════════════════════

export const PROVINCIAS = [
  { code: "010000", name: "Distrito Nacional" },
  { code: "020000", name: "Azua" },
  { code: "030000", name: "Baoruco" },
  { code: "040000", name: "Barahona" },
  { code: "050000", name: "Dajabón" },
  { code: "060000", name: "Duarte" },
  { code: "070000", name: "Elías Piña" },
  { code: "080000", name: "El Seibo" },
  { code: "090000", name: "Espaillat" },
  { code: "100000", name: "Independencia" },
  { code: "110000", name: "La Altagracia" },
  { code: "120000", name: "La Romana" },
  { code: "130000", name: "La Vega" },
  { code: "140000", name: "María Trinidad Sánchez" },
  { code: "150000", name: "Monte Cristi" },
  { code: "160000", name: "Pedernales" },
  { code: "170000", name: "Peravia" },
  { code: "180000", name: "Puerto Plata" },
  { code: "190000", name: "Hermanas Mirabal" },
  { code: "200000", name: "Samaná" },
  { code: "210000", name: "San Cristóbal" },
  { code: "220000", name: "San Juan" },
  { code: "230000", name: "San Pedro de Macorís" },
  { code: "240000", name: "Sánchez Ramírez" },
  { code: "250000", name: "Santiago" },
  { code: "260000", name: "Santiago Rodríguez" },
  { code: "270000", name: "Valverde" },
  { code: "280000", name: "Monseñor Nouel" },
  { code: "290000", name: "Monte Plata" },
  { code: "300000", name: "Hato Mayor" },
  { code: "310000", name: "San José de Ocoa" },
  { code: "320000", name: "Santo Domingo" },
];

// Municipios agrupados por código de provincia (6 dígitos)
export const MUNICIPIOS_BY_PROVINCIA = {
  "010000": [{ code: "010101", name: "Santo Domingo de Guzmán" }],
  "020000": [
    { code: "020101", name: "Azua de Compostela" },
    { code: "020201", name: "Las Charcas" },
    { code: "020301", name: "Las Yayas de Viajama" },
    { code: "020401", name: "Padre Las Casas" },
    { code: "020501", name: "Peralta" },
    { code: "020601", name: "Sabana Yegua" },
    { code: "020701", name: "Pueblo Viejo" },
    { code: "020801", name: "Tábara Arriba" },
    { code: "020901", name: "Guayabal" },
    { code: "021001", name: "Estebania" },
  ],
  "030000": [
    { code: "030101", name: "Neiba" },
    { code: "030201", name: "Galván" },
    { code: "030301", name: "Los Ríos" },
    { code: "030401", name: "Tamayo" },
    { code: "030501", name: "Villa Jaragua" },
  ],
  "040000": [
    { code: "040101", name: "Barahona" },
    { code: "040201", name: "Cabral" },
    { code: "040301", name: "Enriquillo" },
    { code: "040401", name: "Paraíso" },
    { code: "040501", name: "Vicente Noble" },
    { code: "040601", name: "El Peñón" },
    { code: "040701", name: "La Ciénaga" },
    { code: "040801", name: "Fundación" },
    { code: "040901", name: "Las Salinas" },
    { code: "041001", name: "Polo" },
    { code: "041101", name: "Jaquimeyes" },
  ],
  "050000": [
    { code: "050101", name: "Dajabón" },
    { code: "050201", name: "Loma de Cabrera" },
    { code: "050301", name: "Partido" },
    { code: "050401", name: "Restauración" },
    { code: "050501", name: "El Pino" },
  ],
  "060000": [
    { code: "060101", name: "San Francisco de Macorís" },
    { code: "060201", name: "Arenoso" },
    { code: "060301", name: "Castillo" },
    { code: "060401", name: "Pimentel" },
    { code: "060501", name: "Villa Riva" },
    { code: "060601", name: "Las Guáranas" },
    { code: "060701", name: "Eugenio María de Hostos" },
  ],
  "070000": [
    { code: "070101", name: "Comendador" },
    { code: "070201", name: "Bánica" },
    { code: "070301", name: "El Llano" },
    { code: "070401", name: "Hondo Valle" },
    { code: "070501", name: "Pedro Santana" },
    { code: "070601", name: "Juan Santiago" },
  ],
  "080000": [
    { code: "080101", name: "El Seibo" },
    { code: "080201", name: "Miches" },
  ],
  "090000": [
    { code: "090101", name: "Moca" },
    { code: "090201", name: "Cayetano Germosén" },
    { code: "090301", name: "Gaspar Hernández" },
    { code: "090401", name: "Jamao al Norte" },
    { code: "090501", name: "San Víctor" },
  ],
  "100000": [
    { code: "100101", name: "Jimaní" },
    { code: "100201", name: "Duvergé" },
    { code: "100301", name: "La Descubierta" },
    { code: "100401", name: "Postrer Río" },
    { code: "100501", name: "Cristóbal" },
    { code: "100601", name: "Mella" },
  ],
  "110000": [
    { code: "110101", name: "Higüey" },
    { code: "110201", name: "San Rafael del Yuma" },
  ],
  "120000": [
    { code: "120101", name: "La Romana" },
    { code: "120201", name: "Guaymate" },
    { code: "120301", name: "Villa Hermosa" },
  ],
  "130000": [
    { code: "130101", name: "Concepción de La Vega" },
    { code: "130201", name: "Constanza" },
    { code: "130301", name: "Jarabacoa" },
    { code: "130401", name: "Jima Abajo" },
  ],
  "140000": [
    { code: "140101", name: "Nagua" },
    { code: "140201", name: "Cabrera" },
    { code: "140301", name: "El Factor" },
    { code: "140401", name: "Río San Juan" },
  ],
  "150000": [
    { code: "150101", name: "San Fernando de Monte Cristi" },
    { code: "150201", name: "Castañuelas" },
    { code: "150301", name: "Guayubín" },
    { code: "150401", name: "Las Matas de Santa Cruz" },
    { code: "150501", name: "Pepillo Salcedo" },
    { code: "150601", name: "Villa Vásquez" },
  ],
  "160000": [
    { code: "160101", name: "Pedernales" },
    { code: "160201", name: "Oviedo" },
  ],
  "170000": [
    { code: "170101", name: "Baní" },
    { code: "170201", name: "Matanzas" },
    { code: "170301", name: "Nizao" },
  ],
  "180000": [
    { code: "180101", name: "San Felipe de Puerto Plata" },
    { code: "180201", name: "Altamira" },
    { code: "180301", name: "Guananico" },
    { code: "180401", name: "Imbert" },
    { code: "180501", name: "Los Hidalgos" },
    { code: "180601", name: "Luperón" },
    { code: "180701", name: "Sosúa" },
    { code: "180801", name: "Villa Isabela" },
    { code: "180901", name: "Villa Montellano" },
  ],
  "190000": [
    { code: "190101", name: "Salcedo" },
    { code: "190201", name: "Tenares" },
    { code: "190301", name: "Villa Tapia" },
  ],
  "200000": [
    { code: "200101", name: "Santa Bárbara de Samaná" },
    { code: "200201", name: "Sánchez" },
    { code: "200301", name: "Las Terrenas" },
  ],
  "210000": [
    { code: "210101", name: "San Cristóbal" },
    { code: "210201", name: "Sabana Grande de Palenque" },
    { code: "210301", name: "Bajos de Haina" },
    { code: "210401", name: "Cambita Garabitos" },
    { code: "210501", name: "Villa Altagracia" },
    { code: "210601", name: "Yaguate" },
    { code: "210701", name: "San Gregorio de Nigua" },
    { code: "210801", name: "Los Cacaos" },
  ],
  "220000": [
    { code: "220101", name: "San Juan de la Maguana" },
    { code: "220201", name: "Bohechío" },
    { code: "220301", name: "El Cercado" },
    { code: "220401", name: "Juan de Herrera" },
    { code: "220501", name: "Las Matas de Farfán" },
    { code: "220601", name: "Vallejuelo" },
  ],
  "230000": [
    { code: "230101", name: "San Pedro de Macorís" },
    { code: "230201", name: "Consuelo" },
    { code: "230301", name: "Quisqueya" },
    { code: "230401", name: "Ramón Santana" },
    { code: "230501", name: "Los Llanos" },
    { code: "230601", name: "Guayacanes" },
  ],
  "240000": [
    { code: "240101", name: "Cotuí" },
    { code: "240201", name: "Cevicos" },
    { code: "240301", name: "Fantino" },
    { code: "240401", name: "La Mata" },
  ],
  "250000": [
    { code: "250101", name: "Santiago de los Caballeros" },
    { code: "250201", name: "Bisonó (Navarrete)" },
    { code: "250301", name: "Jánico" },
    { code: "250401", name: "Licey al Medio" },
    { code: "250501", name: "San José de las Matas" },
    { code: "250601", name: "Tamboril" },
    { code: "250701", name: "Villa Bisonó" },
    { code: "250801", name: "Villa González" },
    { code: "250901", name: "Sabana Iglesia" },
    { code: "251001", name: "Puñal" },
  ],
  "260000": [
    { code: "260101", name: "San Ignacio de Sabaneta" },
    { code: "260201", name: "Los Almácigos" },
    { code: "260301", name: "Monción" },
  ],
  "270000": [
    { code: "270101", name: "Mao" },
    { code: "270201", name: "Esperanza" },
    { code: "270301", name: "Laguna Salada" },
  ],
  "280000": [
    { code: "280101", name: "Bonao" },
    { code: "280201", name: "Maimón" },
    { code: "280301", name: "Piedra Blanca" },
  ],
  "290000": [
    { code: "290101", name: "Monte Plata" },
    { code: "290201", name: "Bayaguana" },
    { code: "290301", name: "Sabana Grande de Boyá" },
    { code: "290401", name: "Yamasá" },
    { code: "290501", name: "Peralvillo" },
  ],
  "300000": [
    { code: "300101", name: "Hato Mayor del Rey" },
    { code: "300201", name: "El Valle" },
    { code: "300301", name: "Sabana de la Mar" },
  ],
  "310000": [
    { code: "310101", name: "San José de Ocoa" },
    { code: "310201", name: "Rancho Arriba" },
    { code: "310301", name: "Sabana Larga" },
  ],
  "320000": [
    { code: "320101", name: "Santo Domingo Este" },
    { code: "320201", name: "Boca Chica" },
    { code: "320301", name: "San Antonio de Guerra" },
    { code: "320401", name: "Santo Domingo Norte" },
    { code: "320501", name: "Los Alcarrizos" },
    { code: "320601", name: "Santo Domingo Oeste" },
    { code: "320701", name: "Pedro Brand" },
  ],
};

// Helper: nombre completo desde código (acepta 2 o 6 dígitos por compatibilidad)
export function getProvinciaName(code) {
  if (!code) return "";
  // Aceptar legacy de 2 dígitos: convertir a 6 antes de buscar
  const norm = String(code).length === 2 ? String(code) + "0000" : String(code);
  const p = PROVINCIAS.find((x) => x.code === norm);
  return p ? p.name : code || "";
}

export function getMunicipioName(code) {
  if (!code || String(code).length < 2) return code || "";
  // Los municipios siguen en 6 dígitos. Derivar provincia desde los primeros 2 dígitos + "0000".
  const provCode = String(code).substring(0, 2) + "0000";
  const list = MUNICIPIOS_BY_PROVINCIA[provCode] || [];
  const m = list.find((x) => x.code === code);
  return m ? m.name : code;
}
