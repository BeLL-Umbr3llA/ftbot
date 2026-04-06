const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

const getMMDate = (offsetDays = 0) => {
    const now = new Date();
    const mmTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000)); 
    mmTime.setDate(mmTime.getDate() + offsetDays);
    const y = mmTime.getFullYear();
    const m = String(mmTime.getMonth() + 1).padStart(2, '0');
    const d = String(mmTime.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim().toLowerCase();
    if (query.startsWith("/")) return;

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
            const tomorrowStr = getMMDate(1);
            
            // Header တွေထည့်ပြီး Browser အတုလုပ်ခေါ်မယ်
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            };

            const [resToday, resTomorrow] = await Promise.all([
                fetch(`https://www.fotmob.com/api/matches?date=${todayStr}`, { headers }),
                fetch(`https://www.fotmob.com/api/matches?date=${tomorrowStr}`, { headers })
            ]);

            const dataToday = await resToday.json();
            const dataTomorrow = await resTomorrow.json();

            const allLeagues = [...(dataToday.leagues || []), ...(dataTomorrow.leagues || [])];
            let foundInApi = null;
            const cleanQuery = query.replace(/\s+/g, '');

            for (const league of allLeagues) {
                if (!league.matches) continue;
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
                const scoreStr = (m.home.score !== undefined) ? `${m.home.score}-${m.away.score}` : "0-0";

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
        await ctx.reply(`🔍 "${ctx.message.text}" အတွက် ပွဲစဉ်ရှာမတွေ့ပါ။ \n(ဒီနေ့နဲ့ မနက်ဖြန် ပွဲစဉ်တွေကိုပဲ ရှာပေးနိုင်ပါတယ်ဗျ)`);
    }
});

export default webhookCallback(bot, "http");
