const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

// --- Helper: ရက်စွဲတွက်ချက်ရန် ---
const getMMDate = (offsetDays = 0) => {
    const now = new Date();
    const mmTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000)); 
    mmTime.setDate(mmTime.getDate() + offsetDays);
    const y = mmTime.getFullYear();
    const m = String(mmTime.getMonth() + 1).padStart(2, '0');
    const d = String(mmTime.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

// --- (၁) Search Logic (Direct Fetch နည်းလမ်း) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim().toLowerCase();
    if (query.startsWith("/")) return;

    // DB မှာ အရင်စစ်
    let match = await Match.findOne({
        $or: [
            { home: { $regex: query, $options: "i" } },
            { away: { $regex: query, $options: "i" } }
        ]
    });

    const now = new Date();
    if (!match || (now - new Date(match.lastUpdated)) > 60000) {
        try {
            const todayStr = getMMDate(0);
            // Fotmob ရဲ့ Direct API URL ကို သုံးကြည့်မယ်
            const url = `https://www.fotmob.com/api/matches?date=${todayStr}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (!data.leagues || data.leagues.length === 0) {
                console.log("No leagues found in API response");
            }

            let foundInApi = null;
            const cleanQuery = query.replace(/\s+/g, '');

            for (const league of data.leagues) {
                const m = league.matches.find(x => 
                    x.home.name.toLowerCase().replace(/\s+/g, '').includes(cleanQuery) || 
                    x.away.name.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)
                );
                if (m) {
                    foundInApi = { m, leagueName: league.name };
                    break;
                }
            }

            if (foundInApi) {
                const { m, leagueName } = foundInApi;
                // Score logic
                let scoreStr = "0-0";
                if (m.home.score !== undefined && m.away.score !== undefined) {
                    scoreStr = `${m.home.score}-${m.away.score}`;
                }

                match = await Match.findOneAndUpdate(
                    { fixtureId: m.id },
                    { 
                        home: m.home.name, away: m.away.name,
                        league: leagueName, score: scoreStr,
                        status: m.status.live ? "Live" : (m.status.reasonShort || "NS"),
                        lastUpdated: new Date()
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (err) {
            console.error("Fetch Error:", err.message);
        }
    }

    if (match) {
        const keyboard = new InlineKeyboard().text("🔔 Noti ယူမည်", `sub_${match.fixtureId}`);
        await ctx.reply(
            `🏟️ *MATCH FOUND*\n\n🏆 ${match.league}\n🆚 ${match.home} vs ${match.away}\n🔢 Score: ${match.score}\n🕒 Status: ${match.status}\n\n_Last Updated: ${match.lastUpdated.toLocaleTimeString('en-GB')}_`,
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply(`🔍 "${ctx.message.text}" အတွက် ပွဲစဉ်ရှာမတွေ့ပါ။ \n(ယနေ့ပွဲများကိုသာ ရှာပေးနိုင်ပါတယ်ဗျ)`);
    }
});

// အောက်က command တွေနဲ့ export တွေက အရှေ့ကအတိုင်းပဲထားပါ
export default webhookCallback(bot, "http");
