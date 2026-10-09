import { writeFile } from 'node:fs/promises';

// Original vector art: columns are land tiers, rows are building levels.
function city(tier, level) {
  const roof = ['#777464', '#57766e', '#a16b58'][tier];
  const house = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-13 0h26v23h-26z" fill="#ead4a7"/><path d="M-19 2L0-12 19 2l-4 4h-30z" fill="${roof}"/><path d="M-4 23V12h8v11" fill="#66533e"/><path d="M-10 10h4v5h-4M6 10h4v5H6" fill="#85a9a4"/></g>`;
  const wall = tier > 0 ? `<path d="M-43 65h86v21h-86z" fill="#cfb785"/><path d="M-43 65v-7h9v7h9v-7h9v7h9v-7h9v7h9v-7h9v7h9v-7h9v7h9" fill="#e4cf9f"/><path d="M-9 86V74q9-13 18 0v12" fill="#66533e"/>` : '';
  const extensions = level > 1 ? house(-30, 56, .75) + house(30, 56, .75) : '';
  const upper = level > 2 ? `<path d="M-20 24h40v15h-40z" fill="#ead4a7"/><path d="M-27 25L0 7l27 18-5 5h-44z" fill="${roof}"/>` : '';
  return `<ellipse cx="0" cy="89" rx="46" ry="7" fill="#6d6e5330" stroke="none"/>${extensions}${house(0, tier === 0 ? 54 : 42, tier === 2 ? 1.5 : tier === 1 ? 1.25 : 1.2)}${upper}${wall}${tier === 2 ? '<path d="M-46 69V49h17v20M29 69V49h17v20" fill="#d6bd8c"/><path d="M-50 49l12-13 13 13M25 49l13-13 12 13" fill="#a16b58"/>' : ''}`;
}
const buildings = Array.from({ length: 9 }, (_, i) => `<g transform="translate(${(i % 3) * 100 + 50} ${Math.floor(i / 3) * 100})">${city(i % 3, Math.floor(i / 3) + 1)}</g>`).join('');
await writeFile('assets/landmarks.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="原创县城郡治名城及建筑三级增建"><g stroke="#64523f" stroke-width="2" stroke-linejoin="round">${buildings}</g></svg>`);

const facilities = [
  '<path d="M21 80V25h8v55" stroke="#6c5741" stroke-width="5"/><path d="M29 27h42l-9 14 9 13H29z" fill="#bd8654"/><path d="M15 82h66" stroke="#7b7764" stroke-width="5"/>',
  '<rect x="25" y="30" width="50" height="44" rx="6" fill="#f0dfb6"/><path d="M25 35h50M25 66h50" stroke="#af7e4c" stroke-width="5"/><path d="M20 30h60M20 75h60M50 18v12M50 75v10" stroke="#6d6450" stroke-width="5"/><path d="M38 41h24v16H38z" fill="#d3a058"/>',
  '<path d="M18 66q30 22 64 0l-8 16H28z" fill="#8c6847"/><path d="M47 21v47M47 22l27 34H47z" fill="#f1e5ca"/><path d="M10 88q10-6 20 0t20 0t20 0t20 0" fill="none" stroke="#619598" stroke-width="4"/>',
  '<path d="M22 46h56v36H22z" fill="#ddcda7"/><path d="M17 46l13-24h40l13 24z" fill="#917e62"/><path d="M31 24v22M49 24v22M67 24v22" stroke="#c6b692" stroke-width="8"/><path d="M30 63h40M35 82V63M65 82V63" stroke="#7d674d" stroke-width="5"/>',
  '<path d="M29 23h48v54H29z" fill="#f1e1bd"/><path d="M29 23q-13-8-13 4t13 4M77 70q13-8 13 4t-13 4" fill="#c4a575"/><path d="M39 36h27M39 47h27M39 58h17" stroke="#867154" stroke-width="4"/>',
  '<path d="M25 51h50v29H25z" fill="#dad9bf"/><path d="M17 52l33-28 33 28-8 5H25z" fill="#6f897b"/><path d="M35 80V53M65 80V53M18 85h64" stroke="#7b7359" stroke-width="5"/><circle cx="50" cy="17" r="7" fill="#d6b96c"/>',
  '<path d="M19 64l20-26 18 17 19-24 13 33" fill="#9d9c86"/><path d="M8 79q10-6 20 0t20 0t20 0t20 0M8 89q10-6 20 0t20 0t20 0t20 0" fill="none" stroke="#6c9d9c" stroke-width="4"/><path d="M49 58V30l19 11-19 8" fill="#b87658"/>',
];
await writeFile('assets/facilities.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 100" role="img" aria-label="原创行营驿站渡口集市事件隆中赤壁图标"><g stroke="#655d4d" stroke-width="2" stroke-linejoin="round">${facilities.map((art, i) => `<g transform="translate(${i * 100} 0)">${art}</g>`).join('')}</g></svg>`);

await writeFile('assets/map-scene.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="原创中原田野荆襄丘陵江东水乡巴蜀山地">
<defs><linearGradient id="land" x2="0" y2="1"><stop stop-color="#d4d8ad"/><stop offset="1" stop-color="#b4c4a1"/></linearGradient><linearGradient id="river" x2="1" y2="1"><stop stop-color="#80afb4"/><stop offset="1" stop-color="#bed9d0"/></linearGradient><pattern id="fields" width="75" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><rect width="75" height="48" fill="#d4c994"/><path d="M0 12h75M0 24h75M0 36h75M37 0v48" stroke="#b4b07b" stroke-width="2" opacity=".6"/></pattern></defs>
<rect width="1000" height="700" fill="url(#land)"/><path d="M140 0h580l-45 204-302 88-222-77z" fill="url(#fields)" opacity=".75"/>
<g fill="#8ca494" stroke="#b5bea2" stroke-width="4"><path d="M-50 420L80 182l158 260z"/><path d="M20 575l160-272 155 289z"/><path d="M-20 660l170-232 153 251z"/><path d="M138 700l174-286 182 286z"/></g><g fill="#c5cdb6"><path d="M80 182l-34 64 33-14 21 23 16-6z"/><path d="M180 303l-37 63 36-15 26 18 14-2z"/><path d="M312 414l-42 68 40-17 23 18 21-5z"/></g>
<path d="M1000 82q-188 8-212 158t-170 150q-157-9-114 128t309 182h187z" fill="url(#river)"/><path d="M992 132q-125 5-139 115t-188 193q-109 12-70 82t263 152" fill="none" stroke="#e2ebd4" stroke-width="7" opacity=".5"/>
<g fill="#73967c" opacity=".8"><ellipse cx="700" cy="150" rx="63" ry="34"/><ellipse cx="730" cy="213" rx="90" ry="38"/><ellipse cx="651" cy="280" rx="82" ry="39"/><ellipse cx="470" cy="350" rx="87" ry="49"/></g>
<g stroke="#677e5d" fill="#739067" stroke-width="3">${[[280,150],[580,125],[443,232],[708,340],[382,505],[872,544],[752,605]].map(([x,y])=>`<path d="M${x} ${y}v31" stroke="#877357" stroke-width="7"/><circle cx="${x}" cy="${y}" r="22"/><circle cx="${x-17}" cy="${y+7}" r="16"/><circle cx="${x+17}" cy="${y+7}" r="16"/>`).join('')}</g>
<path d="M704 437q45-40 93-10" fill="none" stroke="#977e57" stroke-width="24"/><path d="M703 428q47-33 94-9" fill="none" stroke="#dfcfa0" stroke-width="14"/>
<g fill="#e4d7b4" stroke="#6f7157" stroke-width="2"><path d="M834 426h31v26h-31zM871 464h25v20h-25zM737 540h27v21h-27z"/><path d="M828 426l21-17 23 17M866 464l18-14 17 14M732 540l19-15 19 15" fill="#738e89"/></g><path d="M0 688h1000" stroke="#c6c9a0" stroke-width="20"/></svg>`);
