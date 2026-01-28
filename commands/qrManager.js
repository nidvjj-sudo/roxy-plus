const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

const qrPath = path.join(__dirname, '..', 'data', 'qr.json');

// Memory state for user setup flow
// { userId: { step: 1, startTime: number } }
// Step 1: Waiting for Image
// Step 2: Waiting for ID
const activeSetup = new Map();

function loadData() {
    if (!fs.existsSync(qrPath)) {
        return {}; // { userId: { img: 'url', id: 'text' } }
    }
    try {
        return JSON.parse(fs.readFileSync(qrPath, 'utf8'));
    } catch (e) { return {}; }
}

function saveData(data) {
    fs.writeFileSync(qrPath, JSON.stringify(data, null, 2));
}

module.exports = {
    async handle(message, client, isAllowed) {
        if (!isAllowed) return false;

        const content = message.content.trim();
        const lower = content.toLowerCase();
        const userId = message.author.id;
        const now = Date.now();

        // Cleanup old sessions (5 mins)
        if (activeSetup.has(userId)) {
            const sess = activeSetup.get(userId);
            if (now - sess.startTime > 300000) {
                activeSetup.delete(userId);
                message.reply('Setup timed out.');
                return true; // handled
            }
        }

        // --- COMMANDS ---

        // 1. Trigger Setup / Change
        if (lower === 'qr' || lower === 'change qr') {
            // If just 'qr' and data exists, send data
            const db = loadData();
            if (lower === 'qr' && db[userId] && db[userId].img) {
                // Send Image
                await message.channel.send(db[userId].img);
                // Send ID if exists
                if (db[userId].id) {
                    await message.channel.send(db[userId].id);
                }
                return true;
            }

            // Start Setup
            activeSetup.set(userId, { step: 1, startTime: now });
            await message.channel.send('send your qr link or image');
            return true;
        }

        // --- WIZARD FLOW ---
        const session = activeSetup.get(userId);
        if (session) {
            // STEP 1: Handle Image
            if (session.step === 1) {
                let imgUrl = null;

                // Check attachments
                if (message.attachments.size > 0) {
                    imgUrl = message.attachments.first().url;
                } else if (content.startsWith('http')) {
                    imgUrl = content; // assume link
                }

                if (imgUrl) {
                    session.pendingImg = imgUrl; // Store temporarily
                    session.step = 2;
                    activeSetup.set(userId, session);
                    await message.channel.send("ok"); // Acknowledgement
                    await message.channel.send("send your id if u don't weant to set then say no");
                    return true;
                }

                // If not an image/link, ignore or maybe they are typing "change qr" to restart (handled above if order matters)
                return false;
            }

            // STEP 2: Handle ID
            if (session.step === 2) {
                const db = loadData();
                const input = content;

                db[userId] = {
                    img: session.pendingImg,
                    id: (input.toLowerCase() === 'no') ? null : input
                };

                saveData(db);
                activeSetup.delete(userId);

                if (db[userId].id) await message.channel.send('done');
                else await message.channel.send('ok'); // "set one per response" logic - actually user said: "jese he qr set hua wese he ok bolo" -> Wait.

                // User said: "set one per response "ok" do only no any extra word or ping or reply like jese he qr set hua wese he ok bolo"
                // My logic above: Step 1 -> "send your id...".
                // Wait, re-reading: "jese he qr set hua wese he ok bolo and jese he id set hua done bolo"
                // This contradicts "send your id if you don't..." prompting.
                // Ah, maybe they mean: 
                // 1. User sends image -> Bot: "ok" (and implicit prompts next?) OR Bot: "send your id..."?
                // Request text: "ager wo image link ya image send karta hai to usko save kar lo and fir ek new msg bejo 'send your id if u don't weant to set then say no'"
                // AND THEN "set one per response 'ok' do only... jese he qr set hua wese he ok bolo"
                // These are contradictory. "send your id..." IS the response to QR set.
                // "jese he qr set hua wese he ok bolo" -> maybe means "ok. send your id..."?
                // Let's stick to the prompt text: "send your id if u don't weant to set then say no". That's unambiguous.
                // The "ok" might refer to finalizing. 
                // Re-reading: "and set one per response 'ok' do only... jese he qr set hua wese he ok bolo and jese he id set hua done bolo"

                // Interpretation A:
                // User: [Image]
                // Bot: "ok" 
                // Bot: "send your id..."

                // Interpretation B (Strict Text):
                // User: [Image]
                // Bot: "send your id..." (Since prompt requested this specific phrase)
                // User: [ID]
                // Bot: "done"

                // I will follow Interpretation B for the prompting, but check if "ok" is strictly needed. 
                // "jese he qr set hua wese he ok bolo" -> This sounds like they want acknowledgement.
                // But the specific phrase "send your id..." was also requested.
                // I will send "ok" then "send your id..." in separate lines or just the prompt. 
                // "plain msg me bolo send your qr ... fir ek new msg bejo 'send your id ...' "
                // The "ok" requirement came later in the prompt.
                // "set one per response 'ok' do only... jese he qr set hua wese he ok bolo"
                // Okay, I will send "ok" then the prompt.

                return true;
            }
        }

        return false;
    }
};
