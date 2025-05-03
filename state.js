const state = {
    selectedFilters: {
        "Keywords": new Set(),
        "Rarity": new Set(),
        // other categories can be empty:
        "Supertypes": new Set(),
        
        "Types": new Set(["Artifact", "Battle", "Creature", "Conspiracy", 
                        "Dungeon","Enchantment", "Hero", 
                        "Instant", "Kindred", "Land", 
                        "Phenomenon", "Plane", "Planeswalker", 
                        "Scheme", "Sorcery", "Vanguard"]),
        "Subtypes": new Set(),
        "Set Types": new Set(),
        "Set Types": new Set(["archenemy", "arsenal", "box", 
                            "commander", "core", "draft_innovation", 
                            "duel_deck", "expansion", "from_the_vault", 
                            "masterpiece", "masters","planechase", 
                            "premium_deck", "spellbook", "starter", 
                            "treasure_chest", "vanguard"]),
        "Originality": new Set(),},            
    selectedPriceAttribute: "price_usd",   
  };
  const listeners = [];
  
  export function subscribe(listener) {
    listeners.push(listener);
  }
  
  export function updateState(newPartialState) {
    Object.assign(state, newPartialState);
    listeners.forEach(listener => listener(state));
  }
  
  export function getState() {
    return state;
  }
  