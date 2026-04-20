// ══════════════════════════════════════════════════════════════════
// Códigos oficiales DGII / ONE (Oficina Nacional de Estadística)
// República Dominicana — para uso en e-CF
//
// Provincias: código de 2 dígitos
// Municipios: código de 6 dígitos (primeros 2 = provincia)
// ══════════════════════════════════════════════════════════════════

export const PROVINCIAS = [
  { code: "01", name: "Distrito Nacional" },
  { code: "02", name: "Azua" },
  { code: "03", name: "Baoruco" },
  { code: "04", name: "Barahona" },
  { code: "05", name: "Dajabón" },
  { code: "06", name: "Duarte" },
  { code: "07", name: "Elías Piña" },
  { code: "08", name: "El Seibo" },
  { code: "09", name: "Espaillat" },
  { code: "10", name: "Independencia" },
  { code: "11", name: "La Altagracia" },
  { code: "12", name: "La Romana" },
  { code: "13", name: "La Vega" },
  { code: "14", name: "María Trinidad Sánchez" },
  { code: "15", name: "Monte Cristi" },
  { code: "16", name: "Pedernales" },
  { code: "17", name: "Peravia" },
  { code: "18", name: "Puerto Plata" },
  { code: "19", name: "Hermanas Mirabal" },
  { code: "20", name: "Samaná" },
  { code: "21", name: "San Cristóbal" },
  { code: "22", name: "San Juan" },
  { code: "23", name: "San Pedro de Macorís" },
  { code: "24", name: "Sánchez Ramírez" },
  { code: "25", name: "Santiago" },
  { code: "26", name: "Santiago Rodríguez" },
  { code: "27", name: "Valverde" },
  { code: "28", name: "Monseñor Nouel" },
  { code: "29", name: "Monte Plata" },
  { code: "30", name: "Hato Mayor" },
  { code: "31", name: "San José de Ocoa" },
  { code: "32", name: "Santo Domingo" },
];

// Municipios agrupados por código de provincia (2 dígitos)
export const MUNICIPIOS_BY_PROVINCIA = {
  "01": [{ code: "010101", name: "Santo Domingo de Guzmán" }],
  "02": [
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
  "03": [
    { code: "030101", name: "Neiba" },
    { code: "030201", name: "Galván" },
    { code: "030301", name: "Los Ríos" },
    { code: "030401", name: "Tamayo" },
    { code: "030501", name: "Villa Jaragua" },
  ],
  "04": [
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
  "05": [
    { code: "050101", name: "Dajabón" },
    { code: "050201", name: "Loma de Cabrera" },
    { code: "050301", name: "Partido" },
    { code: "050401", name: "Restauración" },
    { code: "050501", name: "El Pino" },
  ],
  "06": [
    { code: "060101", name: "San Francisco de Macorís" },
    { code: "060201", name: "Arenoso" },
    { code: "060301", name: "Castillo" },
    { code: "060401", name: "Pimentel" },
    { code: "060501", name: "Villa Riva" },
    { code: "060601", name: "Las Guáranas" },
    { code: "060701", name: "Eugenio María de Hostos" },
  ],
  "07": [
    { code: "070101", name: "Comendador" },
    { code: "070201", name: "Bánica" },
    { code: "070301", name: "El Llano" },
    { code: "070401", name: "Hondo Valle" },
    { code: "070501", name: "Pedro Santana" },
    { code: "070601", name: "Juan Santiago" },
  ],
  "08": [
    { code: "080101", name: "El Seibo" },
    { code: "080201", name: "Miches" },
  ],
  "09": [
    { code: "090101", name: "Moca" },
    { code: "090201", name: "Cayetano Germosén" },
    { code: "090301", name: "Gaspar Hernández" },
    { code: "090401", name: "Jamao al Norte" },
    { code: "090501", name: "San Víctor" },
  ],
  "10": [
    { code: "100101", name: "Jimaní" },
    { code: "100201", name: "Duvergé" },
    { code: "100301", name: "La Descubierta" },
    { code: "100401", name: "Postrer Río" },
    { code: "100501", name: "Cristóbal" },
    { code: "100601", name: "Mella" },
  ],
  "11": [
    { code: "110101", name: "Higüey" },
    { code: "110201", name: "San Rafael del Yuma" },
  ],
  "12": [
    { code: "120101", name: "La Romana" },
    { code: "120201", name: "Guaymate" },
    { code: "120301", name: "Villa Hermosa" },
  ],
  "13": [
    { code: "130101", name: "Concepción de La Vega" },
    { code: "130201", name: "Constanza" },
    { code: "130301", name: "Jarabacoa" },
    { code: "130401", name: "Jima Abajo" },
  ],
  "14": [
    { code: "140101", name: "Nagua" },
    { code: "140201", name: "Cabrera" },
    { code: "140301", name: "El Factor" },
    { code: "140401", name: "Río San Juan" },
  ],
  "15": [
    { code: "150101", name: "San Fernando de Monte Cristi" },
    { code: "150201", name: "Castañuelas" },
    { code: "150301", name: "Guayubín" },
    { code: "150401", name: "Las Matas de Santa Cruz" },
    { code: "150501", name: "Pepillo Salcedo" },
    { code: "150601", name: "Villa Vásquez" },
  ],
  "16": [
    { code: "160101", name: "Pedernales" },
    { code: "160201", name: "Oviedo" },
  ],
  "17": [
    { code: "170101", name: "Baní" },
    { code: "170201", name: "Matanzas" },
    { code: "170301", name: "Nizao" },
  ],
  "18": [
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
  "19": [
    { code: "190101", name: "Salcedo" },
    { code: "190201", name: "Tenares" },
    { code: "190301", name: "Villa Tapia" },
  ],
  "20": [
    { code: "200101", name: "Santa Bárbara de Samaná" },
    { code: "200201", name: "Sánchez" },
    { code: "200301", name: "Las Terrenas" },
  ],
  "21": [
    { code: "210101", name: "San Cristóbal" },
    { code: "210201", name: "Sabana Grande de Palenque" },
    { code: "210301", name: "Bajos de Haina" },
    { code: "210401", name: "Cambita Garabitos" },
    { code: "210501", name: "Villa Altagracia" },
    { code: "210601", name: "Yaguate" },
    { code: "210701", name: "San Gregorio de Nigua" },
    { code: "210801", name: "Los Cacaos" },
  ],
  "22": [
    { code: "220101", name: "San Juan de la Maguana" },
    { code: "220201", name: "Bohechío" },
    { code: "220301", name: "El Cercado" },
    { code: "220401", name: "Juan de Herrera" },
    { code: "220501", name: "Las Matas de Farfán" },
    { code: "220601", name: "Vallejuelo" },
  ],
  "23": [
    { code: "230101", name: "San Pedro de Macorís" },
    { code: "230201", name: "Consuelo" },
    { code: "230301", name: "Quisqueya" },
    { code: "230401", name: "Ramón Santana" },
    { code: "230501", name: "Los Llanos" },
    { code: "230601", name: "Guayacanes" },
  ],
  "24": [
    { code: "240101", name: "Cotuí" },
    { code: "240201", name: "Cevicos" },
    { code: "240301", name: "Fantino" },
    { code: "240401", name: "La Mata" },
  ],
  "25": [
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
  "26": [
    { code: "260101", name: "San Ignacio de Sabaneta" },
    { code: "260201", name: "Los Almácigos" },
    { code: "260301", name: "Monción" },
  ],
  "27": [
    { code: "270101", name: "Mao" },
    { code: "270201", name: "Esperanza" },
    { code: "270301", name: "Laguna Salada" },
  ],
  "28": [
    { code: "280101", name: "Bonao" },
    { code: "280201", name: "Maimón" },
    { code: "280301", name: "Piedra Blanca" },
  ],
  "29": [
    { code: "290101", name: "Monte Plata" },
    { code: "290201", name: "Bayaguana" },
    { code: "290301", name: "Sabana Grande de Boyá" },
    { code: "290401", name: "Yamasá" },
    { code: "290501", name: "Peralvillo" },
  ],
  "30": [
    { code: "300101", name: "Hato Mayor del Rey" },
    { code: "300201", name: "El Valle" },
    { code: "300301", name: "Sabana de la Mar" },
  ],
  "31": [
    { code: "310101", name: "San José de Ocoa" },
    { code: "310201", name: "Rancho Arriba" },
    { code: "310301", name: "Sabana Larga" },
  ],
  "32": [
    { code: "320101", name: "Santo Domingo Este" },
    { code: "320201", name: "Boca Chica" },
    { code: "320301", name: "San Antonio de Guerra" },
    { code: "320401", name: "Santo Domingo Norte" },
    { code: "320501", name: "Los Alcarrizos" },
    { code: "320601", name: "Santo Domingo Oeste" },
    { code: "320701", name: "Pedro Brand" },
  ],
};

// Helper: nombre completo desde código
export function getProvinciaName(code) {
  const p = PROVINCIAS.find((x) => x.code === code);
  return p ? p.name : code || "";
}

export function getMunicipioName(code) {
  if (!code || String(code).length < 2) return code || "";
  const provCode = String(code).substring(0, 2);
  const list = MUNICIPIOS_BY_PROVINCIA[provCode] || [];
  const m = list.find((x) => x.code === code);
  return m ? m.name : code;
}
