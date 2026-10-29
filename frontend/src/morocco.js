// Morocco, built in: the main cities, train stations, airports and landmarks.
//
// Two jobs:
//  1. fixHearing(): speech-to-text often mangles Moroccan names ("rabbit ville", "fez",
//     "kenny tra"). We repair them before the text goes anywhere.
//  2. findInMorocco(): "Fès" or "Rabat Ville" is found instantly, with no web search
//     and no chance of landing in another country.
//
// Coordinates are city centres / station entrances (good enough to route to).

export const PLACES = [
  // train stations and airports first: "rabat ville" must win over plain "rabat"
  { name: "Gare Rabat Ville", at: [34.01599, -6.83686], aliases: ["rabat ville", "rabat-ville", "rabbit ville", "rabat city station", "rabat station"] },
  { name: "Gare Rabat Agdal", at: [33.99883, -6.85406], aliases: ["rabat agdal station", "agdal station", "gare agdal"] },
  { name: "Gare Casa Voyageurs", at: [33.58967, -7.59146], aliases: ["casa voyageurs", "casa voyageur", "casa voyager", "casablanca voyageurs", "casablanca station"] },
  { name: "Gare Casa Port", at: [33.60037, -7.61484], aliases: ["casa port", "casa-port", "casablanca port station"] },
  { name: "Gare de Fès", at: [34.04685, -4.99911], aliases: ["fes station", "fez station", "gare de fes", "fes train station", "fez train station"] },
  { name: "Gare de Marrakech", at: [31.63065, -8.01593], aliases: ["marrakech station", "marrakesh station", "gare de marrakech"] },
  { name: "Gare Tanger Ville", at: [35.76973, -5.78911], aliases: ["tanger ville", "tangier station", "tanger station"] },
  { name: "Gare Kénitra", at: [34.25780, -6.58908], aliases: ["kenitra station", "gare kenitra"] },
  { name: "Aéroport Mohammed V", at: [33.36746, -7.58997], aliases: ["mohammed v airport", "mohammed 5 airport", "casablanca airport", "casa airport"] },
  { name: "Aéroport Rabat-Salé", at: [34.05150, -6.75150], aliases: ["rabat airport", "rabat sale airport", "sale airport"] },
  { name: "Aéroport Marrakech Menara", at: [31.60694, -8.03630], aliases: ["marrakech airport", "menara airport", "marrakesh airport"] },
  { name: "Tour Hassan", at: [34.02403, -6.82283], aliases: ["hassan tower", "tour hassan"] },
  { name: "Mosquée Hassan II", at: [33.60838, -7.63250], aliases: ["hassan ii mosque", "hassan 2 mosque", "hassan two mosque"] },
  { name: "Jemaa el-Fna", at: [31.62584, -7.98914], aliases: ["jemaa el fna", "jemaa el-fna", "jamaa el fna", "jama el fna"] },
  { name: "Bab Boujloud", at: [34.06167, -4.98361], aliases: ["bab boujloud", "fes medina", "fez medina", "medina of fes"] },
  { name: "Kasbah des Oudayas", at: [34.03250, -6.83560], aliases: ["oudayas", "oudaya", "kasbah of the udayas"] },
  // cities
  { name: "Rabat", at: [34.02088, -6.84165], aliases: ["rabat", "rabbit city"] },
  { name: "Salé", at: [34.03313, -6.79846], aliases: ["sale", "salé", "sla"] },
  { name: "Témara", at: [33.92866, -6.90656], aliases: ["temara"] },
  { name: "Casablanca", at: [33.57311, -7.58984], aliases: ["casablanca", "casa blanca", "casa"] },
  { name: "Mohammedia", at: [33.68607, -7.38298], aliases: ["mohammedia", "mohamedia"] },
  { name: "Fès", at: [34.03313, -5.00028], aliases: ["fes", "fès", "fez", "fess"] },
  { name: "Meknès", at: [33.89352, -5.54727], aliases: ["meknes", "meknès", "mecnes", "make ness"] },
  { name: "Marrakech", at: [31.62947, -7.98108], aliases: ["marrakech", "marrakesh", "marakech", "marrakch"] },
  { name: "Tanger", at: [35.75947, -5.83395], aliases: ["tanger", "tangier", "tangiers", "tanja"] },
  { name: "Tétouan", at: [35.57845, -5.36837], aliases: ["tetouan", "tétouan", "tetuan"] },
  { name: "Chefchaouen", at: [35.17105, -5.26970], aliases: ["chefchaouen", "chaouen", "chefchauen", "chef chaouen"] },
  { name: "Kénitra", at: [34.26101, -6.58020], aliases: ["kenitra", "kénitra", "kenny tra", "canitra"] },
  { name: "Agadir", at: [30.42775, -9.59811], aliases: ["agadir"] },
  { name: "Essaouira", at: [31.50849, -9.75950], aliases: ["essaouira", "essaouirah", "essawira"] },
  { name: "El Jadida", at: [33.25492, -8.50602], aliases: ["el jadida", "eljadida", "jadida"] },
  { name: "Safi", at: [32.29939, -9.23718], aliases: ["safi"] },
  { name: "Oujda", at: [34.68139, -1.90858], aliases: ["oujda", "ujda"] },
  { name: "Nador", at: [35.16813, -2.93352], aliases: ["nador"] },
  { name: "Al Hoceïma", at: [35.24935, -3.93712], aliases: ["al hoceima", "alhoceima", "hoceima"] },
  { name: "Ifrane", at: [33.52666, -5.11019], aliases: ["ifrane", "ifran"] },
  { name: "Béni Mellal", at: [32.33725, -6.34984], aliases: ["beni mellal", "béni mellal"] },
  { name: "Khouribga", at: [32.88108, -6.90630], aliases: ["khouribga"] },
  { name: "Benguerir", at: [32.23594, -7.95395], aliases: ["benguerir", "ben guerir"] },
  { name: "Ouarzazate", at: [30.91894, -6.89340], aliases: ["ouarzazate", "warzazat"] },
  { name: "Merzouga", at: [31.09921, -4.01245], aliases: ["merzouga"] },
  { name: "Larache", at: [35.19321, -6.15572], aliases: ["larache"] },
  { name: "Asilah", at: [35.46519, -6.03433], aliases: ["asilah", "assilah"] },
  { name: "Laâyoune", at: [27.12536, -13.16250], aliases: ["laayoune", "laâyoune", "layoune"] },
  { name: "Dakhla", at: [23.68477, -15.95798], aliases: ["dakhla"] },
];

// Morocco's bounding box, to keep web searches inside the country.
export const MOROCCO_BBOX = "-17.2,21.3,-0.9,36.0";

const plain = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // é -> e
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Every alias, longest first, so "rabat ville" is tried before "rabat".
const INDEX = PLACES.flatMap((p) => p.aliases.map((a) => ({ alias: plain(a), place: p }))).sort(
  (a, b) => b.alias.length - a.alias.length
);

// Find a known Moroccan place mentioned in the text (whole words only).
export function findInMorocco(text) {
  const t = ` ${plain(text)} `;
  const hit = INDEX.find(({ alias }) => t.includes(` ${alias} `));
  return hit ? hit.place : null;
}

// Mishearings that are never real English words, safe to repair anywhere in a sentence.
const REPAIRS = [
  [/\brabbit (ville|city)\b/gi, "Rabat Ville"],
  [/\b(fez|fess)\b/gi, "Fès"],
  [/\bmake ness\b/gi, "Meknès"],
  [/\bkenny tra\b|\bcanitra\b/gi, "Kénitra"],
  [/\bmarrakesh\b|\bmarakech\b/gi, "Marrakech"],
  [/\bcasa voyager(s)?\b/gi, "Casa Voyageurs"],
  [/\bwarzazat\b/gi, "Ouarzazate"],
  [/\bessawira\b/gi, "Essaouira"],
];

export function fixHearing(text) {
  return REPAIRS.reduce((s, [bad, good]) => s.replace(bad, good), text);
}
