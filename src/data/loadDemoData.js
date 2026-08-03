import catalogRaw from "../../data/catalog.json";
import personaAkash from "../../data/persona_akash.json";
import personaJanvi from "../../data/persona_janvi.json";
import personaBardhan from "../../data/persona_bardhan.json";
import personaYash from "../../data/persona_yash.json";
import candidatesAkash from "../../data/candidates_akash.json";
import candidatesJanvi from "../../data/candidates_janvi.json";
import candidatesBardhan from "../../data/candidates_bardhan.json";
import candidatesYash from "../../data/candidates_yash.json";
import { withLocalPhoto } from "../lib/productImage.js";

function withPhotos(list) {
  return (list || []).map(withLocalPhoto);
}

export const catalog = withPhotos(catalogRaw);

export const PERSONAS = {
  yash: {
    persona: personaYash,
    candidates: withPhotos(candidatesYash),
  },
  akash: {
    persona: personaAkash,
    candidates: withPhotos(candidatesAkash),
  },
  janvi: {
    persona: personaJanvi,
    candidates: withPhotos(candidatesJanvi),
  },
  bardhan: {
    persona: personaBardhan,
    candidates: withPhotos(candidatesBardhan),
  },
};

export const DEFAULT_PERSONA_ID = "yash";

export function getPersonaBundle(id = DEFAULT_PERSONA_ID) {
  return PERSONAS[id] || PERSONAS[DEFAULT_PERSONA_ID];
}
