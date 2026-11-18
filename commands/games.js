'use strict';

/**
 * MR SAQIB MD :: Advanced Interactive Games & Gaming Suite
 * ============================================================================
 * Features:
 * 1. Tic-Tac-Toe (XO)     : .ttt [@user] (Play vs AI or vs Friends in group!)
 * 2. Word Guess (Scramble): .wordguess (Guess scrambled letters with clues)
 * 3. Math Speed Challenge : .mathspeed (Rapid mental arithmetic quiz)
 * 4. Casino Slot Machine  : .slot (Spin 3 reels for big jackpots)
 * 5. Bubble Pop Shooter   : .bubblepop (Play the HTML5 web game via WhatsApp)
 * 6. Games Hub            : .games (Interactive games menu)
 * ============================================================================
 */

const settings = require('../settings');
const config = require('../config');

// In-memory active game sessions mapped by chat JID
const activeTTT = new Map();
const activeWordGuess = new Map();
const activeMathQuiz = new Map();

// ═══════════════════════════════════════════════════════════════
// 1. TIC-TAC-TOE (XO GAME)
// ═══════════════════════════════════════════════════════════════
const NUM_EMOJIS = {
    1: '1️⃣', 2: '2️⃣', 3: '3️⃣',
    4: '4️⃣', 5: '5️⃣', 6: '6️⃣',
    7: '7️⃣', 8: '8️⃣', 9: '9️⃣',
    'X': '❌', 'O': '⭕'
};

function renderBoard(b) {
    const get = (i) => b[i] === 'X' ? '❌' : (b[i] === 'O' ? '⭕' : NUM_EMOJIS[i]);
    return `   ${get(1)} ┃ ${get(2)} ┃ ${get(3)}\n  ━━━╋━━━╋━━━\n   ${get(4)} ┃ ${get(5)} ┃ ${get(6)}\n  ━━━╋━━━╋━━━\n   ${get(7)} ┃ ${get(8)} ┃ ${get(9)}`;
}

function checkWinner(b) {
    const wins = [
        [1,2,3], [4,5,6], [7,8,9], // rows
        [1,4,7], [2,5,8], [3,6,9], // cols
        [1,5,9], [3,5,7]           // diags
    ];
    for (const [x, y, z] of wins) {
        if (b[x] && b[x] === b[y] && b[y] === b[z]) return b[x];
    }
    const isFull = Object.keys(b).length === 9 && Object.values(b).every(v => v === 'X' || v === 'O');
    if (isFull) return 'TIE';
    return null;
}

function getBestMoveAI(b) {
    // Win if can
    for (let i = 1; i <= 9; i++) {
        if (!b[i]) {
            b[i] = 'O';
            if (checkWinner(b) === 'O') { delete b[i]; return i; }
            delete b[i];
        }
    }
    // Block player X
    for (let i = 1; i <= 9; i++) {
        if (!b[i]) {
            b[i] = 'X';
            if (checkWinner(b) === 'X') { delete b[i]; return i; }
            delete b[i];
        }
    }
    // Center
    if (!b[5]) return 5;
    // Corners
    const corners = [1, 3, 7, 9].filter(c => !b[c]);
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    // Any remaining
    const empty = [2, 4, 6, 8].filter(e => !b[e]);
    return empty[0] || null;
}

async function handleTTTCommand(sock, from, msg, args, sender) {
    const cleanSender = String(sender || '').split('@')[0].split(':')[0];

    // Reset game
    if (args[0] === 'del' || args[0] === 'reset' || args[0] === 'stop') {
        if (activeTTT.has(from)) {
            activeTTT.delete(from);
            return await sock.sendMessage(from, { text: '🛑 *Tic-Tac-Toe game has been reset!* Type `.ttt` to start a new game.' }, { quoted: msg });
        }
        return await sock.sendMessage(from, { text: 'ℹ️ Is chat mein koi active Tic-Tac-Toe game nahi chal rahi.' }, { quoted: msg });
    }

    // Check if game already active
    let game = activeTTT.get(from);
    if (!game) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const isVsAi = !mentioned || mentioned === sender;
        const opponent = isVsAi ? 'AI' : mentioned;
        const oppName = isVsAi ? 'MR SAQIB AI 🤖' : `@${opponent.split('@')[0].split(':')[0]}`;

        game = {
            board: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null },
            playerX: sender,
            playerO: opponent,
            turn: sender, // X starts first
            isVsAi,
            startedAt: Date.now()
        };
        activeTTT.set(from, game);

        const card =
`╭━━━〔 🎮 *TIC-TAC-TOE (XO)* 〕━━━┈⊷
┃ ❌ *Player X:* @${cleanSender}
┃ ⭕ *Player O:* ${oppName}
┃ 🎲 *Turn:* @${cleanSender} (❌)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${renderBoard(game.board)}

💡 *How to Play:*
👉 Reply with a number (*1-9*) to make your move!
🛑 Type \`.delttt\` to end the game.`;

        return await sock.sendMessage(from, {
            text: card,
            mentions: [sender, ...(isVsAi ? [] : [opponent])]
        }, { quoted: msg });
    }

    // Move provided as argument (e.g. .ttt 5)
    const moveNum = parseInt(args[0], 10);
    if (!isNaN(moveNum) && moveNum >= 1 && moveNum <= 9) {
        return await processTTTMove(sock, from, sender, moveNum, msg);
    }

    // If game active but no args, show current board
    const currentTurn = game.turn === game.playerX ? `@${game.playerX.split('@')[0]}` : (game.isVsAi ? 'MR SAQIB AI' : `@${game.playerO.split('@')[0]}`);
    return await sock.sendMessage(from, {
        text: `🎮 *Current Game in Progress!*\n🎲 Turn: ${currentTurn}\n\n${renderBoard(game.board)}\n\n👉 Type *1-9* to make a move or \`.delttt\` to reset.`
    }, { quoted: msg });
}

async function processTTTMove(sock, from, sender, pos, msg) {
    const game = activeTTT.get(from);
    if (!game) return false;

    // Check player's turn
    if (game.turn !== sender) {
        if (sender === game.playerX || sender === game.playerO) {
            await sock.sendMessage(from, { text: '⏳ *Abhi aapki baari nahi hai!* Dusre player ka intezar karein.' }, { quoted: msg }).catch(() => {});
        }
        return false;
    }

    // Check if cell is empty
    if (game.board[pos]) {
        await sock.sendMessage(from, { text: `⚠️ Position *${pos}* pehle se bhari hui hai! Koi khali number chunein.` }, { quoted: msg }).catch(() => {});
        return true;
    }

    // Place Player X move
    const symbol = game.turn === game.playerX ? 'X' : 'O';
    game.board[pos] = symbol;

    // Check winner
    let winner = checkWinner(game.board);
    if (winner) {
        activeTTT.delete(from);
        const winText = winner === 'TIE'
            ? `🤝 *GAME DRAW / TIE!*\n\n${renderBoard(game.board)}\n\nDono players ne zabardast muqabla kiya! 🎉`
            : `🏆 *WINNER WINNER CHICKEN DINNER!* 🏆\n\n${renderBoard(game.board)}\n\n🎉 Mubarak ho @${sender.split('@')[0]} (${winner}) jeet gaye! ✨`;

        await sock.sendMessage(from, { text: winText, mentions: [sender] }, { quoted: msg });
        return true;
    }

    // Switch turn
    if (game.isVsAi) {
        // AI Turn
        const aiPos = getBestMoveAI(game.board);
        if (aiPos) {
            game.board[aiPos] = 'O';
            winner = checkWinner(game.board);
            if (winner) {
                activeTTT.delete(from);
                const winText = winner === 'TIE'
                    ? `🤝 *GAME DRAW / TIE!*\n\n${renderBoard(game.board)}\n\nZabardast koshish!`
                    : `🤖 *MR SAQIB AI WON!* 🏆\n\n${renderBoard(game.board)}\n\nKoshish achi thi! Dobara khelne ke liye \`.ttt\` likhein.`;
                await sock.sendMessage(from, { text: winText }, { quoted: msg });
                return true;
            }
        }
        // AI finished move, back to player X
        game.turn = game.playerX;
        const card =
`╭━━━〔 🎮 *TIC-TAC-TOE* 〕━━━┈⊷
┃ ❌ *Player:* @${game.playerX.split('@')[0]}
┃ ⭕ *AI:* MR SAQIB AI 🤖
┃ 🎲 *Turn:* @${game.playerX.split('@')[0]} (❌)
╰━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${renderBoard(game.board)}

👉 Type *1-9* to make your next move!`;

        await sock.sendMessage(from, { text: card, mentions: [game.playerX] }, { quoted: msg });
        return true;
    } else {
        // Switch to other human player
        game.turn = game.turn === game.playerX ? game.playerO : game.playerX;
        const nextUser = game.turn.split('@')[0];
        const nextSymbol = game.turn === game.playerX ? '❌' : '⭕';
        const card =
`╭━━━〔 🎮 *TIC-TAC-TOE* 〕━━━┈⊷
┃ 🎲 *Next Turn:* @${nextUser} (${nextSymbol})
╰━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${renderBoard(game.board)}

👉 Type *1-9* to place your move!`;

        await sock.sendMessage(from, { text: card, mentions: [game.turn] }, { quoted: msg });
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════
// 2. WORD GUESS / WORDLE CHALLENGE
// ═══════════════════════════════════════════════════════════════
const WORDS_DATABASE = [
    { word: 'WHATSAPP', hint: 'The most popular green messaging app 📱' },
    { word: 'PYTHON', hint: 'A famous snake and powerful programming language 🐍' },
    { word: 'PAKISTAN', hint: 'A country with rich history & green crescent flag 🇵🇰' },
    { word: 'MANGO', hint: 'The delicious king of fruits in summer 🥭' },
    { word: 'CRICKET', hint: 'The most loved bat-and-ball sport in South Asia 🏏' },
    { word: 'FIREFOX', hint: 'A popular open-source web browser with a fox 🦊' },
    { word: 'BITCOIN', hint: 'The world\'s first and biggest cryptocurrency 🪙' },
    { word: 'FOOTBALL', hint: 'The world\'s most watched sport with 11 players per team ⚽' },
    { word: 'ANDROID', hint: 'Google\'s open-source mobile operating system 🤖' },
    { word: 'GALAXY', hint: 'A massive system of stars, gas, and dust in space 🌌' },
    { word: 'BURGER', hint: 'A popular fast food with patty inside buns 🍔' },
    { word: 'CAMERA', hint: 'An optical instrument used to capture photos & videos 📷' },
    { word: 'LAPTOP', hint: 'A portable personal computer you can fold 💻' },
    { word: 'DIAMOND', hint: 'The hardest natural substance and precious gemstone 💎' },
    { word: 'AIRPLANE', hint: 'A winged aircraft that flies passengers across continents ✈️' }
];

function scrambleWord(word) {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const scrambled = arr.join(' - ');
    return scrambled === word.split('').join(' - ') ? scrambleWord(word) : scrambled;
}

async function startWordGuess(sock, from, msg) {
    if (activeWordGuess.has(from)) {
        const curr = activeWordGuess.get(from);
        return await sock.sendMessage(from, {
            text: `⚠️ *Pehle se Word Guess chal raha hai!*\n🔤 Scrambled: [ *${curr.scrambled}* ]\n💡 Hint: ${curr.hint}\n👉 Correct word type karein!`
        }, { quoted: msg });
    }

    const item = WORDS_DATABASE[Math.floor(Math.random() * WORDS_DATABASE.length)];
    const scrambled = scrambleWord(item.word);

    const session = {
        word: item.word,
        scrambled,
        hint: item.hint,
        timeout: setTimeout(async () => {
            if (activeWordGuess.has(from)) {
                activeWordGuess.delete(from);
                await sock.sendMessage(from, {
                    text: `⏰ *Waqt Khatam! (Time Out)*\nSahi lafz tha: *${item.word}*\nKoi player waqt par jawab nahi de saka. Agla khel shuru karne ke liye \`.wordguess\` likhein!`
                }).catch(() => {});
            }
        }, 60000)
    };
    activeWordGuess.set(from, session);

    const text =
`╭━━━〔 🧩 *GUESS THE WORD* 〕━━━┈⊷
┃ 🔤 *Scrambled:* [ *${scrambled}* ]
┃ 💡 *Hint:* ${item.hint}
┃ ⏳ *Time:* 60 Seconds
┃ 💰 *Reward:* +50 XP Coins
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

👉 *Direct jawab type karein* (kisi prefix ki zaroorat nahi)!`;

    return await sock.sendMessage(from, { text }, { quoted: msg });
}

// ═══════════════════════════════════════════════════════════════
// 3. MATH SPEED QUIZ
// ═══════════════════════════════════════════════════════════════
async function startMathQuiz(sock, from, msg) {
    if (activeMathQuiz.has(from)) {
        const curr = activeMathQuiz.get(from);
        return await sock.sendMessage(from, {
            text: `⚠️ *Active Math Quiz chal raha hai!*\n❓ Question: *${curr.question}*\n👉 Number jawab type karein!`
        }, { quoted: msg });
    }

    // Generate random equation
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, ans;

    if (op === '+') {
        a = Math.floor(Math.random() * 80) + 15;
        b = Math.floor(Math.random() * 80) + 15;
        ans = a + b;
    } else if (op === '-') {
        a = Math.floor(Math.random() * 90) + 30;
        b = Math.floor(Math.random() * a) + 5;
        ans = a - b;
    } else {
        a = Math.floor(Math.random() * 15) + 3;
        b = Math.floor(Math.random() * 12) + 2;
        ans = a * b;
    }

    const question = `${a} ${op === '*' ? '×' : op} ${b} = ?`;

    const session = {
        question,
        ans,
        timeout: setTimeout(async () => {
            if (activeMathQuiz.has(from)) {
                activeMathQuiz.delete(from);
                await sock.sendMessage(from, {
                    text: `⏰ *Math Quiz Time Out!*\nSahi jawab tha: *${ans}*\nAgla round shuru karne ke liye \`.mathspeed\` likhein!`
                }).catch(() => {});
            }
        }, 35000)
    };
    activeMathQuiz.set(from, session);

    const text =
`╭━━━〔 🧮 *MATH SPEED CHALLENGE* 〕━━━┈⊷
┃ ❓ *Sawal:* *${question}*
┃ ⏳ *Time:* 35 Seconds
┃ ⚡ *Sab se pehle sahi jawab dene wala jeetega!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

👉 *Fauran jawab number type karein!*`;

    return await sock.sendMessage(from, { text }, { quoted: msg });
}

// ═══════════════════════════════════════════════════════════════
// 4. CASINO SLOT MACHINE
// ═══════════════════════════════════════════════════════════════
const SLOT_ITEMS = ['🍒', '🍋', '🍇', '🍉', '⭐', '💎', '7️⃣'];

async function handleSlotMachine(sock, from, msg, sender) {
    const r1 = SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)];
    const r2 = SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)];
    const r3 = SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)];

    let winText = '';
    let coins = 0;

    if (r1 === r2 && r2 === r3) {
        coins = 500;
        winText = `🎰 *JACKPOT TRIPLE MATCH!* 🏆\n💰 *+${coins} Coins* jeet liye aapne! Zabardast! 🎉`;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        coins = 150;
        winText = `✨ *DOUBLE MATCH!* 🌟\n💰 *+${coins} Coins* jeet liye! Bohat khoob!`;
    } else {
        winText = `❌ *Koyi match nahi mila!*\nKoyi baat nahi, dobara koshish karein: \`.slot\``;
    }

    const cleanSender = String(sender || '').split('@')[0];
    const card =
`╭━━━〔 🎰 *SAQIB CASINO SLOTS* 🎰 〕━━━┈⊷
┃ 👤 *Player:* @${cleanSender}
┃
┃        [ ${r1} ┃ ${r2} ┃ ${r3} ]
┃
┃ ${winText}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    await sock.sendMessage(from, { text: card, mentions: [sender] }, { quoted: msg });
}

// ═══════════════════════════════════════════════════════════════
// 5. BUBBLE POP SHOOTER (WEB MINI-GAME CARD)
// ═══════════════════════════════════════════════════════════════
async function sendBubblePopCard(sock, from, msg) {
    const webUrl = settings.websiteUrl ? `${settings.websiteUrl}/games/bubblepop/` : 'https://mrsaqib.me';
    const channelUrl = settings.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M';

    const caption =
`╭━━━〔 🫧 *BUBBLE POP SHOOTER* 〕━━━┈⊷
┃ 🎮 *Game:* Bubble Pop Shooter (Arcade)
┃ 🎯 *Aim:* 3 ya zyada same color bubbles pop karein!
┃ 📱 *Platform:* Mobile & Webview (No download!)
┃ 🏆 *High Score Record:* 1,480 pts
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

👉 Niche diye gaye button par tap karke seedha WhatsApp ke andar game khelein!`;

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        const buttons = [
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🎯 Play Bubble Pop',
                    url: webUrl,
                    merchant_url: webUrl
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '❌ Tic-Tac-Toe',
                    id: '.ttt'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🧩 Word Guess',
                    id: '.wordguess'
                })
            }
        ];

        const interactive = IM.create({
            header: IM.Header.create({
                title: 'Bubble Pop Shooter 🫧',
                hasMediaAttachment: false
            }),
            body: IM.Body.create({ text: caption }),
            footer: IM.Footer.create({ text: '🔥 Powered by MR SAQIB MD Games' }),
            nativeFlowMessage: IM.NativeFlowMessage.create({
                buttons,
                messageVersion: 1
            })
        });

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactive
                }
            }
        }, {
            userJid: sock.user?.id,
            quoted: msg
        });

        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes: [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                        }
                    ]
                }
            ]
        });
        return true;
    } catch (e) {
        return await sock.sendMessage(from, { text: `${caption}\n\n👉 Play: ${webUrl}` }, { quoted: msg });
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. GAMES HUB MENU (.games)
// ═══════════════════════════════════════════════════════════════
async function sendGamesHubMenu(sock, from, msg) {
    const webUrl = settings.websiteUrl ? `${settings.websiteUrl}/games/bubblepop/` : 'https://mrsaqib.me';
    const hubText =
`╭━━━〔 🎮 *MR SAQIB MD GAMES HUB* 〕━━━┈⊷
┃ 🕹️ *Available WhatsApp Games:*
┃
┃ 1️⃣ *Bubble Pop Shooter* 🫧 (.bubblepop)
┃ 2️⃣ *Tic-Tac-Toe XO* ❌⭕ (.ttt)
┃ 3️⃣ *Word Guess Challenge* 🧩 (.wordguess)
┃ 4️⃣ *Math Speed Quiz* 🧮 (.mathspeed)
┃ 5️⃣ *Casino Slots Machine* 🎰 (.slot)
┃ 6️⃣ *2048 Number Puzzle* 🔢 (.2048)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Kisi bhi button par tap karke foran game shuru karein!*`;

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        const buttons = [
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🫧 Play Bubble Pop',
                    url: webUrl,
                    merchant_url: webUrl
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '❌ Start Tic-Tac-Toe',
                    id: '.ttt'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🧩 Start Word Guess',
                    id: '.wordguess'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🧮 Start Math Quiz',
                    id: '.mathspeed'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🎰 Spin Casino Slots',
                    id: '.slot'
                })
            }
        ];

        const interactive = IM.create({
            header: IM.Header.create({
                title: 'MR SAQIB MD Games Hub 🎮',
                hasMediaAttachment: false
            }),
            body: IM.Body.create({ text: hubText }),
            footer: IM.Footer.create({ text: 'Powered by MR SAQIB MD' }),
            nativeFlowMessage: IM.NativeFlowMessage.create({
                buttons,
                messageVersion: 1
            })
        });

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactive
                }
            }
        }, {
            userJid: sock.user?.id,
            quoted: msg
        });

        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes: [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                        }
                    ]
                }
            ]
        });
        return true;
    } catch (e) {
        return await sock.sendMessage(from, { text: hubText }, { quoted: msg });
    }
}

// ═══════════════════════════════════════════════════════════════
// 7. INCOMING MESSAGE INTERCEPTOR (NATURAL PLAYING)
// ═══════════════════════════════════════════════════════════════
async function handleActiveGameMessage(sock, from, sender, text, msg) {
    if (!text) return false;
    const clean = text.trim();

    // 1. Check Tic-Tac-Toe move (1-9)
    if (/^[1-9]$/.test(clean) && activeTTT.has(from)) {
        const movePos = parseInt(clean, 10);
        return await processTTTMove(sock, from, sender, movePos, msg);
    }

    // 2. Check Word Guess answer
    if (activeWordGuess.has(from)) {
        const session = activeWordGuess.get(from);
        if (clean.toUpperCase() === session.word.toUpperCase()) {
            clearTimeout(session.timeout);
            activeWordGuess.delete(from);

            const winText =
`🎉 *MUBARAK HO! SAHI JAWAB!* 🏆\n\n` +
`👤 *Winner:* @${sender.split('@')[0]}\n` +
`🔤 *Word:* *${session.word}*\n` +
`💰 *Points:* +50 XP Coins!\n\n` +
`✨ Agla round khelne ke liye \`.wordguess\` likhein!`;

            await sock.sendMessage(from, { text: winText, mentions: [sender] }, { quoted: msg });
            return true;
        }
    }

    // 3. Check Math Quiz answer
    if (activeMathQuiz.has(from)) {
        const session = activeMathQuiz.get(from);
        const parsedNum = parseInt(clean, 10);
        if (!isNaN(parsedNum) && parsedNum === session.ans) {
            clearTimeout(session.timeout);
            activeMathQuiz.delete(from);

            const winText =
`⚡ *SHABASH! SAHI JAWAB!* 🏆\n\n` +
`👤 *Fastest Math Genius:* @${sender.split('@')[0]}\n` +
`❓ *Question:* ${session.question}\n` +
`💡 *Answer:* *${session.ans}*\n` +
`💰 *Reward:* +30 Speed Points!\n\n` +
`✨ Agla sawal hal karne ke liye \`.mathspeed\` likhein!`;

            await sock.sendMessage(from, { text: winText, mentions: [sender] }, { quoted: msg });
            return true;
        }
    }

    return false;
}

module.exports = {
    handleTTTCommand,
    startWordGuess,
    startMathQuiz,
    handleSlotMachine,
    sendBubblePopCard,
    sendGamesHubMenu,
    handleActiveGameMessage
};
