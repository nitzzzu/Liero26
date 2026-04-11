# Liero26 — Character Sprite Prompts

## Sprite Format Reference

All character sprites follow the same format as the existing `Pink_Monster`, `Dude_Monster`, and `Owlet_Monster` assets:

| Property | Value |
|---|---|
| Frame size | 32 × 32 pixels |
| Layout | Horizontal strip (frames left-to-right) |
| Encoding | PNG, 8-bit indexed colormap (palette) |
| Color depth | ~16–32 distinct colors per character, transparent background |

### Required animation files per character

Replace `<Name>` with the character's folder/file prefix (e.g. `Cartman`).

| Filename | Frames | Total width |
|---|---|---|
| `<Name>_Idle_4.png` | 4 | 128 px |
| `<Name>_Walk_6.png` | 6 | 192 px |
| `<Name>_Run_6.png` | 6 | 192 px |
| `<Name>_Jump_8.png` | 8 | 256 px |
| `<Name>_Attack1_4.png` | 4 | 128 px |
| `<Name>_Attack2_6.png` | 6 | 192 px |
| `<Name>_Hurt_4.png` | 4 | 128 px |
| `<Name>_Death_8.png` | 8 | 256 px |
| `<Name>_Climb_4.png` | 4 | 128 px |
| `<Name>_Throw_4.png` | 4 | 128 px |
| `<Name>_Push_6.png` | 6 | 192 px |
| `<Name>_Walk+Attack_6.png` | 6 | 192 px |

All images are **32 px tall**, width = `frames × 32`.

---

## Nano Banana Prompts

Each prompt below targets the **Nano Banana** AI sprite generator. Copy the prompt as-is; the `[ANIM]` placeholder should be replaced with the animation name and frame count from the table above when requesting individual sheets.

---

### 1. Cartman (South Park)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Eric Cartman from South Park. Chubby boy wearing a red jacket, blue pants, orange pom-pom hat, black shoes. Big round head, small piggy eyes, smug expression. South Park cut-paper animation style translated to chunky pixel art. Bright flat colours. No anti-aliasing.
```

---

### 2. Stan (South Park)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Stan Marsh from South Park. Boy wearing a blue/red pom-pom hat, brown jacket, blue jeans. Medium build, round head, simple dot eyes. Faithful to the show's flat cut-out look but rendered in chunky pixel art. Bold outlines, limited palette (~16 colours). No anti-aliasing.
```

---

### 3. Kyle (South Park)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Kyle Broflovski from South Park. Boy in a green Ushanka hat with ear-flaps, orange jacket, dark green trousers. Lanky build, freckles, side-part hair peeking under the hat. Flat retro pixel art, ~16 colour palette, transparent BG. No anti-aliasing.
```

---

### 4. Kenny (South Park)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Kenny McCormick from South Park. Small boy completely wrapped in an orange parka, drawstring pulled tight so only his eyes are visible. Muffled mouth bump visible through fabric. Tiny figure, mostly orange with a hint of blond hair at the top. Chunky pixel art, limited palette. No anti-aliasing.
```

---

### 5. Homer Simpson (The Simpsons)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Homer Simpson. Bald with a ring of brown stubble, five-o'clock shadow, big round eyes, overbite. Wearing a white short-sleeve shirt and grey slacks. Yellow skin. Simpsons cartoon style rendered as chunky pixel art, ~20 colour palette. Bold black outlines. No anti-aliasing.
```

---

### 6. Bart Simpson (The Simpsons)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Bart Simpson. Spiky blond hair (five points), big round eyes, mischievous grin. Red shirt, blue shorts, blue sneakers. Yellow skin. Energetic poses for each animation. Simpsons style as chunky pixel art, ~18 colour palette. Bold black outlines. No anti-aliasing.
```

---

### 7. Maggie Simpson (The Simpsons)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Maggie Simpson as a tiny toddler combatant. Large bow on head, blue onesie/sleeper, permanently sucking a red pacifier. Yellow skin, big dark eyes. Despite tiny size, performs full combat animations comically (crawl for walk, roll for run, waving rattle for attack). Chunky pixel art, ~16 colour palette. No anti-aliasing.
```

---

### 8. Mario (Nintendo)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Mario. Red cap with M logo, bushy black moustache, blue overalls over red long-sleeve shirt, white gloves, brown shoes. Plump cheerful Italian plumber. Classic Nintendo NES/SNES look scaled to 32x32 with faithful retro palette (NES-inspired ~16 colours). Bold black outlines. No anti-aliasing.
```

---

### 9. Link (Nintendo — The Legend of Zelda)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Link from The Legend of Zelda (A Link to the Past / classic SNES era). Green pointed tunic and hat, pointed elven ears, blond hair, shield on left arm, sword in right hand. Determined expression. SNES-era retro pixel art, ~20 colour palette. Bold outlines. No anti-aliasing.
```

---

### 10. Samus Aran (Nintendo — Metroid)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Samus Aran in Varia Suit. Orange-red powered armour with large round shoulder pads, yellow visor, arm cannon. Compact 32x32 silhouette. NES/SNES retro palette (~18 colours), glowing green-blue visor accent. Chunky pixel art. Bold black outlines. No anti-aliasing.
```

---

### 11. Donkey Kong (Nintendo)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Donkey Kong. Large powerful gorilla, brown fur, cream face/belly, red tie with DK logo. Wide barrel chest, small round ears. SNES DKC style rendered chunky in 32x32, ~20 colour palette. Bold black outlines. No anti-aliasing.
```

---

### 12. Doom Guy / Doomslayer (DOOM)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Doom Guy (Doom 1993 sprite aesthetic). Green military armour and helmet, big boots, gritted teeth visible through visor gap. Holding a shotgun or fists at rest. Classic DOOM sprite colour palette (olive green, grey, brown, red blood splatter). Chunky pixel art 32x32. No anti-aliasing.
```

---

### 13. Cacodemon (DOOM)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Cacodemon from DOOM — classic red floating demonic sphere with one large eye, tiny horns, gaping toothed mouth. Fits the 32x32 frame as a round blob that floats in place for Idle, pulses/rocks for Walk/Run, opens jaws wide for Attack, recoils for Hurt, explodes in gore for Death. Classic DOOM palette (~16 colours, reds/oranges/brown). No anti-aliasing.
```

---

### 14. Pinky Demon (DOOM)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Pinky Demon (Spectre/Demon) from DOOM. Bulky pink-brown quadruped with massive jaws, tiny forelegs, hunched back. Charging run animation, biting attack, growling idle. DOOM original colour scheme (brown-pink skin, dark mouth, blood-red eyes). Chunky pixel art 32x32. No anti-aliasing.
```

---

### 15. Boba Fett (Star Wars)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Boba Fett. Mandalorian armour in battle-worn green and grey, T-visor helmet, jetpack on back, wrist-mounted blaster, tattered cape. Menacing bounty hunter stance. Retro sci-fi pixel art, ~20 colour palette, limited shading. Bold black outlines. No anti-aliasing.
```

---

### 16. Master Chief (Halo)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Master Chief in Mjolnir MKVI armour. Military green powered suit, gold visor, compact silhouette in 32x32. Holding an assault rifle for Attack animation; punches for Attack2. Retro pixel art, ~18 colour palette (greens, greys, gold visor glow). Bold outlines. No anti-aliasing.
```

---

### 17. Pikachu (Pokémon / Nintendo)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Pikachu. Small yellow mouse-like creature, lightning-bolt tail, red cheek circles, big black eyes, pointy ears with black tips. Cute but combat-ready. Electric spark particles visible during Attack animations. Game Boy/GBA retro palette (~16 colours, yellows/browns/black). Chunky pixel art. No anti-aliasing.
```

---

### 18. Kirby (Nintendo)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Kirby. Round pink puffball, rosy cheeks, stubby arms and feet, simple dot eyes with star pupils. Copy ability inhale for Attack1; star spit for Attack2; running puff for Run; inflated float for Jump. Bright cheerful SNES palette (~14 colours, pinks/reds/white). Bold black outlines. No anti-aliasing.
```

---

### 19. Solid Snake (Metal Gear)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Solid Snake. Tactical stealth suit (dark navy blue/grey), bandana, grizzled face with stubble, cigarette optional. Crouching sneaky Walk, CQC punch for Attack1, SOCOM pistol for Attack2, dramatic Death roll. Retro MSX/NES pixel art aesthetic, ~18 colour palette. Bold black outlines. No anti-aliasing.
```

---

### 20. Scorpion (Mortal Kombat)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Scorpion from Mortal Kombat. Yellow ninja outfit with black armour detail, skull mask, kunai-on-rope in hand. GET OVER HERE spear-throw for Attack1; flaming uppercut for Attack2; burning skeleton revealed for Death animation. Retro arcade palette (~16 colours, yellows/oranges/black). Bold black outlines. No anti-aliasing.
```

---

### 21. Sub-Zero (Mortal Kombat)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Sub-Zero from Mortal Kombat. Icy blue ninja outfit, black armour/mask, ice-blue eyes. Ice-ball throw for Attack1; ground freeze stomp for Attack2; shatters into icy chunks for Death. Retro arcade palette (~16 colours, blues/whites/black). Bold black outlines. No anti-aliasing.
```

---

### 22. Imp (DOOM)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Imp from DOOM. Slender brown humanoid demon, horns, glowing orange eyes, sharp claws, spiny back. Clawing slash for Attack1; fireball throw for Attack2; screeching Death collapse. Classic DOOM brown/orange palette (~16 colours). Chunky pixel art 32x32. No anti-aliasing.
```

---

### 23. Lara Croft (Tomb Raider)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Lara Croft classic (PS1 era). Teal tank top, brown shorts, boots, twin pistols in holsters. Athletic build, signature braid/ponytail. Dual-pistol shoot for Attack1; kick for Attack2. PS1-era chunky pixel art, ~18 colour palette. Bold black outlines. No anti-aliasing.
```

---

### 24. Ryu (Street Fighter)

```
pixel art sprite sheet, 32x32 per frame, horizontal strip of [ANIM] frames, transparent background, 8-bit retro style.
Character: Ryu from Street Fighter. White karate gi, red headband, black belt, bare feet, short dark hair, stern expression. Hadouken fireball for Attack1; Shoryuken uppercut for Attack2; Run is aggressive sprint. SFII arcade sprite palette (~18 colours). Chunky pixel art 32x32. No anti-aliasing.
```

---

## Adding a Character to Liero26

1. Generate all 12 animation sheets using the prompt above (swap `[ANIM]` with e.g. `4` for Idle, `6` for Walk, etc.).
2. Place them in `public/sprites/<Name>/`.
3. Add `'<Name>'` to the `availableCharacters` array in `src/client/game.js`:
   ```js
   this.availableCharacters = ['Pink_Monster', 'Dude_Monster', 'Owlet_Monster', '<Name>'];
   ```
4. The character will automatically appear in the in-game character selection screen.
