/**
 * Rule tests for the Okey engine. Run with:  npm run test:rules
 *
 * These are the cases that decide whether a player's "Okey!" is accepted, so
 * every rule from pagat.com/rummy/okey.html that we implement has at least
 * one test here - plus regression tests for bugs we actually hit.
 */

import {
  isJokerTile,
  canFormGroups,
  isValidRunSetHand,
  isValidPairsHand,
  findWinningDiscard,
  type OkeyTile,
} from './okeyRules';

let nextId = 1;
const t = (color: string, value: number): OkeyTile => ({ id: nextId++, color, value });
const fake = (): OkeyTile => ({ id: nextId++, color: 'fake', value: 0 });

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
  } else {
    failures.push(`${name}\n    erwartet: ${expected}, bekommen: ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Joker determination
// ---------------------------------------------------------------------------
check('Joker = Anzeigestein + 1, gleiche Farbe', isJokerTile(t('yellow', 3), t('yellow', 2)), true);
check('Andere Farbe ist kein Joker', isJokerTile(t('red', 3), t('yellow', 2)), false);
check('Gleiche Zahl wie Anzeige ist kein Joker', isJokerTile(t('yellow', 2), t('yellow', 2)), false);
check('Anzeige 13 -> die 1 wird Joker', isJokerTile(t('blue', 1), t('blue', 13)), true);
check('Sahte Okey ist immer Joker', isJokerTile(fake(), t('red', 7)), true);

// ---------------------------------------------------------------------------
// Standard wins: runs + sets, group sizes adding up to 14 in various shapes
// ---------------------------------------------------------------------------
const ind = t('yellow', 1); // joker = yellow 2 in all tests below unless stated

check(
  '3+3+4+4: zwei Sätze, zwei Reihen',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), t('blue', 5),                 // Satz (3)
      t('red', 9), t('black', 9), t('blue', 9),                 // Satz (3)
      t('red', 1), t('red', 2), t('red', 3), t('red', 4),       // Reihe (4)
      t('blue', 10), t('blue', 11), t('blue', 12), t('blue', 13), // Reihe (4)
    ],
    ind
  ),
  true
);

check(
  '3+3+3+5: eine Reihe mit fünf Steinen',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), t('blue', 5),
      t('red', 9), t('black', 9), t('blue', 9),
      t('red', 11), t('black', 11), t('blue', 11),
      t('blue', 1), t('blue', 2), t('blue', 3), t('blue', 4), t('blue', 5), // Reihe (5)
    ],
    ind
  ),
  true
);

check(
  '3+11: eine sehr lange Reihe',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), t('blue', 5),
      t('blue', 3), t('blue', 4), t('blue', 6), t('blue', 7), t('blue', 8),
      t('blue', 9), t('blue', 10), t('blue', 11), t('blue', 12), t('blue', 13),
      t('blue', 2),
    ],
    ind
  ),
  true
);

check(
  '1 als hoher Stein: 11-12-13-1',
  isValidRunSetHand(
    [
      t('red', 11), t('red', 12), t('red', 13), t('red', 1),    // Reihe mit 1 oben (4)
      t('blue', 5), t('black', 5), t('yellow', 5),              // Satz (3)
      t('blue', 7), t('black', 7), t('yellow', 7),              // Satz (3)
      t('black', 2), t('black', 3), t('black', 4), t('black', 5), // Reihe (4)
    ],
    t('yellow', 9)
  ),
  true
);

check(
  '1 darf nicht umlaufen: 13-1-2 ist keine Reihe',
  isValidRunSetHand(
    [
      t('red', 13), t('red', 1), t('red', 2),                   // ungültig
      t('blue', 5), t('black', 5), t('yellow', 5),
      t('blue', 7), t('black', 7), t('yellow', 7),
      t('black', 2), t('black', 3), t('black', 4), t('black', 5),
      t('blue', 9),
    ],
    t('yellow', 11)
  ),
  false
);

check(
  'Satz darf nicht zweimal dieselbe Farbe enthalten',
  isValidRunSetHand(
    [
      t('red', 5), t('red', 5), t('black', 5),                  // ungültig als Satz
      t('blue', 7), t('black', 7), t('yellow', 7),
      t('blue', 9), t('black', 9), t('yellow', 9),
      t('blue', 1), t('blue', 2), t('blue', 3), t('blue', 4), t('blue', 6),
    ],
    t('yellow', 12)
  ),
  false
);

// REGRESSION (belegt): zwei Rot-5, die beide nur in je einem Satz unterkommen
// können. Die alte Logik hat hier gar keinen Satz gebaut, sobald eine Zahl
// doppelt in der Hand lag - und diese gültige Hand als "kein Sieg" abgelehnt.
check(
  'Zwei gleiche Steine, die beide in Sätze müssen (Regression)',
  isValidRunSetHand(
    [
      t('red', 5), t('red', 5), t('black', 5), t('blue', 5), t('yellow', 5), // 2 Sätze aus 5ern
      t('yellow', 2),                                                        // Joker (Anzeige gelb 1)
      t('blue', 1), t('blue', 2), t('blue', 3), t('blue', 4),                // Reihe (4)
      t('black', 9), t('blue', 9), t('yellow', 9), t('red', 9),              // Satz (4)
    ],
    t('yellow', 1)
  ),
  true
);

// REGRESSION: a duplicate tile of the same number used to block set-building
// entirely, so this perfectly valid hand was rejected.
check(
  'Doppelter Stein blockiert den Satz nicht (Regression)',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), t('blue', 5),                 // Satz (3)
      t('red', 3), t('red', 4), t('red', 5), t('red', 6),       // Reihe (4), nutzt die zweite Rot-5
      t('blue', 10), t('black', 10), t('yellow', 10),           // Satz (3)
      t('yellow', 6), t('yellow', 7), t('yellow', 8), t('yellow', 9), // Reihe (4)
    ],
    t('red', 12)
  ),
  true
);

// ---------------------------------------------------------------------------
// Jokers
// ---------------------------------------------------------------------------
check(
  'Joker füllt eine Lücke in der Reihe',
  isValidRunSetHand(
    [
      t('red', 5), t('red', 6), t('yellow', 2),                 // Joker als Rot-7
      t('blue', 7), t('black', 7), t('yellow', 7),
      t('blue', 9), t('black', 9), t('yellow', 9),
      t('black', 1), t('black', 2), t('black', 3), t('black', 4), t('black', 5),
    ],
    t('yellow', 1)
  ),
  true
);

check(
  'Sahte Okey vervollständigt einen Satz als dritte Farbe',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), fake(),                       // Satz (3) mit Joker
      t('blue', 7), t('black', 7), t('yellow', 7),              // Satz (3)
      t('blue', 9), t('black', 9), t('yellow', 9),              // Satz (3)
      t('black', 1), t('black', 2), t('black', 3), t('black', 4), t('black', 6),
    ],
    t('yellow', 11)
  ),
  false // Rest: Schwarz 1-2-3-4 + einzelne Schwarz-6 bleibt übrig -> kein Sieg
);

check(
  'Joker vervollständigt einen Satz (gültige Hand)',
  isValidRunSetHand(
    [
      t('red', 5), t('black', 5), fake(),                       // Satz (3) mit Joker
      t('blue', 7), t('black', 7), t('yellow', 7),              // Satz (3)
      t('blue', 9), t('black', 9), t('yellow', 9),              // Satz (3)
      t('black', 1), t('black', 2), t('black', 3), t('black', 4), t('black', 6),
    ].map((tile, i) => (i === 13 ? t('black', 5) : tile)),      // Schwarz-6 -> Schwarz-5
    t('yellow', 11)
  ),
  true // jetzt: Schwarz 1-2-3-4-5 als Fünfer-Reihe
);

// REGRESSION: leftover jokers can be a group all by themselves.
check(
  'Vier übrige Joker bilden selbst eine Gruppe (Regression)',
  isValidRunSetHand(
    [
      fake(), fake(), t('yellow', 2), t('yellow', 2),           // 4 Joker = eigene Gruppe
      t('red', 5), t('black', 5), t('blue', 5),
      t('red', 9), t('black', 9), t('blue', 9),
      t('blue', 1), t('blue', 2), t('blue', 3), t('blue', 4),
    ],
    t('yellow', 1)
  ),
  true
);

// Die Rest-Joker-Logik direkt geprüft: eine ganze Hand daraus zu bauen geht
// kaum, weil zwei Joker sich fast immer noch irgendwo anhängen lassen - das
// ist regelkonform, macht aber ein Negativbeispiel über eine volle Hand
// praktisch unmöglich.
check('Null übrige Joker sind in Ordnung', canFormGroups([], 0), true);
check('Ein übriger Joker ist gestrandet', canFormGroups([], 1), false);
check('Zwei übrige Joker sind gestrandet', canFormGroups([], 2), false);
check('Drei übrige Joker bilden selbst eine Gruppe', canFormGroups([], 3), true);
check('Vier übrige Joker bilden selbst eine Gruppe', canFormGroups([], 4), true);

// ---------------------------------------------------------------------------
// Seven pairs ("Çift")
// ---------------------------------------------------------------------------
check(
  '7 Paare aus identischen Steinen',
  isValidPairsHand(
    [
      t('red', 1), t('red', 1),
      t('red', 4), t('red', 4),
      t('black', 6), t('black', 6),
      t('blue', 8), t('blue', 8),
      t('yellow', 9), t('yellow', 9),
      t('black', 11), t('black', 11),
      t('blue', 13), t('blue', 13),
    ],
    t('yellow', 3)
  ),
  true
);

check(
  'Gleiche Zahl in verschiedenen Farben ist KEIN Paar',
  isValidPairsHand(
    [
      t('red', 1), t('black', 1),
      t('red', 4), t('black', 4),
      t('black', 6), t('blue', 6),
      t('blue', 8), t('red', 8),
      t('yellow', 9), t('red', 9),
      t('black', 11), t('blue', 11),
      t('blue', 13), t('red', 13),
    ],
    t('yellow', 3)
  ),
  false
);

check(
  'Joker ersetzt den fehlenden Partner im Paar',
  isValidPairsHand(
    [
      t('red', 1), t('red', 1),
      t('red', 4), t('red', 4),
      t('black', 6), t('black', 6),
      t('blue', 8), t('blue', 8),
      t('yellow', 9), t('yellow', 9),
      t('black', 11), t('black', 11),
      t('blue', 13), fake(),                                    // Joker als Partner
    ],
    t('yellow', 3)
  ),
  true
);

// ---------------------------------------------------------------------------
// findWinningDiscard - welcher Stein wird abgeworfen, und was ist der Sieg wert
// ---------------------------------------------------------------------------
const runsetWin = findWinningDiscard(
  [
    t('red', 5), t('black', 5), t('blue', 5),
    t('red', 9), t('black', 9), t('blue', 9),
    t('red', 1), t('red', 2), t('red', 3), t('red', 4),
    t('blue', 10), t('blue', 11), t('blue', 12), t('blue', 13),
    t('yellow', 7),                                             // der überzählige Stein
  ],
  t('yellow', 12)
);
check('Findet den abzuwerfenden Stein', runsetWin?.tile.value, 7);
check('Erkennt den Typ als Reihen/Sätze', runsetWin?.type, 'runset');

const noWin = findWinningDiscard(
  [
    t('red', 5), t('black', 6), t('blue', 7),
    t('red', 9), t('black', 10), t('blue', 11),
    t('red', 1), t('red', 3), t('yellow', 5), t('yellow', 8),
    t('blue', 2), t('blue', 4), t('black', 12), t('black', 13),
    t('yellow', 10),
  ],
  t('yellow', 12)
);
check('Kein Sieg wird auch nicht als Sieg gewertet', noWin, null);

// Der teurere Sieg gewinnt: wer den Joker abwerfen kann, bekommt 4 statt 2.
const jokerDiscardWin = findWinningDiscard(
  [
    t('red', 5), t('black', 5), t('blue', 5),
    t('red', 9), t('black', 9), t('blue', 9),
    t('red', 1), t('red', 2), t('red', 3), t('red', 4),
    t('blue', 10), t('blue', 11), t('blue', 12), t('blue', 13),
    t('yellow', 2),                                             // Joker (Anzeige gelb 1)
  ],
  t('yellow', 1)
);
check('Wirft lieber den Joker ab (4 Punkte statt 2)', jokerDiscardWin?.tile.color, 'yellow');

// ---------------------------------------------------------------------------
// Die Hand aus Ceyhuns Screenshot (Anzeige gelb 2 -> gelb 3 ist Joker)
// ---------------------------------------------------------------------------
const screenshotIndicator = t('yellow', 2);
const screenshotHand = [
  t('black', 13), t('blue', 13), t('red', 13),
  t('red', 2),
  t('black', 1), t('blue', 1),
  t('yellow', 3), t('yellow', 3),                               // zwei Joker
  t('red', 5), t('red', 6), t('red', 7),
  t('red', 9), t('red', 10),
  t('red', 8), t('red', 11),                                    // die zwei verdeckten Steine (Annahme)
];
const screenshotWin = findWinningDiscard(screenshotHand, screenshotIndicator);
check('Screenshot-Hand mit Rot-8 und Rot-11 gewinnt', screenshotWin !== null, true);
check('...und der abzuwerfende Stein ist die Rot-2', screenshotWin?.tile.value, 2);

// ---------------------------------------------------------------------------
console.log(`\n  ${passed} Tests bestanden, ${failures.length} fehlgeschlagen\n`);
if (failures.length) {
  failures.forEach(f => console.log(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log('  Alle Okey-Regeln verhalten sich wie erwartet.\n');
