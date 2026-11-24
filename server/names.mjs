/**
 * Stable, friendly identities for sessions. A session keeps the same name and
 * look for as long as it exists because everything is derived from its id.
 */

const NAMES = [
  "Mika", "Tala", "Kiko", "Bea", "Nico", "Lia", "Rafa", "Maya",
  "Paulo", "Ina", "Gil", "Risa", "Bino", "Carla", "Dino", "Ella",
  "Franco", "Gia", "Hana", "Ivo", "Juno", "Kira", "Leo", "Mina",
  "Nio", "Ona", "Pia", "Rei", "Sam", "Tia", "Umi", "Vito",
  "Ysa", "Zia", "Nena", "Bogs", "Lani", "Migs", "Trina", "Odie",
];

const TRAITS = [
  "night owl", "fast typist", "coffee first", "test believer",
  "quiet genius", "pixel pedant", "ship it", "tab hoarder",
  "documentation nerd", "refactor enjoyer", "merge gremlin", "semver cynic",
  "rubber duck", "zero warnings", "commit poet", "lunch thinker",
];

const HAIRSTYLES = ["short", "bun", "curls", "cap", "long", "buzz", "ponytail", "beanie"];
const ACCESSORIES = ["none", "glasses", "headphones", "glasses", "none", "earring", "glasses", "none"];
const SKINS = ["#f3c8a4", "#e0a97e", "#c9875c", "#a96a45", "#7d4c31", "#f8d7b8"];
const HAIRS = ["#2b2230", "#4a2f27", "#6b3b2a", "#1d1a24", "#8a5a38", "#c8a06a", "#5a4a6e"];
const SHIRTS = ["#4fbfa5", "#e8a33d", "#e06f61", "#8d7bd8", "#5aa8e0", "#c9d45a", "#e08bb5", "#7fc0a0"];
const PANTS = ["#2b3350", "#3a3040", "#243b3a", "#42322c"];

export function hashString(value) {
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function identityFor(id, offset = 0) {
  const h = hashString(id);
  const h2 = hashString(`${id}:alt`);
  return {
    name: NAMES[(h + offset) % NAMES.length],
    trait: TRAITS[h2 % TRAITS.length],
    look: {
      skin: SKINS[(h >>> 3) % SKINS.length],
      hair: HAIRS[(h >>> 7) % HAIRS.length],
      shirt: SHIRTS[(h >>> 11) % SHIRTS.length],
      pants: PANTS[(h >>> 15) % PANTS.length],
      style: HAIRSTYLES[(h >>> 19) % HAIRSTYLES.length],
      accessory: ACCESSORIES[(h >>> 23) % ACCESSORIES.length],
    },
  };
}

/** Deterministic identity with collision avoidance inside one office. */
export function assignIdentities(ids) {
  const used = new Set();
  const out = new Map();
  for (const id of [...ids].sort()) {
    let identity = identityFor(id);
    let offset = 1;
    while (used.has(identity.name) && offset < NAMES.length) {
      identity = identityFor(id, offset);
      offset++;
    }
    used.add(identity.name);
    out.set(id, identity);
  }
  return out;
}

export const SMALL_TALK = [
  "Ship it?",
  "One more test.",
  "Coffee?",
  "That diff is tiny.",
  "It works on my machine.",
  "Who touched the CSS?",
  "Lunch soon?",
  "Rebuild again.",
  "No warnings, nice.",
  "Merge conflict again.",
  "I blame the cache.",
  "Just one more refactor.",
  "The tests are green.",
  "Did you pull?",
  "Semver is a lie.",
  "Pixel perfect.",
];
