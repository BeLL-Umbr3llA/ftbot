const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

// --- Helper: မြန်မာစံတော်ချိန် (UTC+6:30) ဖြင့် ရက်စွဲတွက်ရန် ---
const getMMDate = (offsetDays = 0) => {
    const now = new Date();
    // Vercel Server အချိန်ကို မြန်မာစံတော်ချိန်သို့ ပြောင်းခြင်း
    const mmTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000)); 
    mmTime.setDate(mmTime.getDate() + offsetDays);
    const y = mmTime.getFullYear();
    const m = String(mmTime.getMonth() + 1).padStart(2, '0');
    const d = String(mmTime.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

// --- (၁) Search Logic (Direct Fetch - Today & Tomorrow) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim().toLowerCase();
    if (query.startsWith("/")) return;

    // ၁။ MongoDB ထဲမှာ အရင်ရှာမယ်
    let match = await Match.findOne({
        $or: [
            { home: { $regex: query, $options: "i" } },
            { away: { $regex: query, $options: "i" } }
        ]
    });

    const now = new Date();
    // ၂။ DB မှာမရှိရင် သို့မဟုတ် ၁ မိနစ်ထက် ကြာနေရင် API ကနေ Update တောင်းမယ်
    if (!match || (now - new Date(match.lastUpdated)) > 60000) {
        try {
            const todayStr = getMMDate(0);
            const tomorrowStr = getMMDate(1);
            
            // API နှစ်ခုကို ပြိုင်တူခေါ်မယ်
            const [resToday, resTomorrow] = await Promise.all([
                fetch(`https://www.fotmob.com/api/matches?date=${todayStr}`),
                fetch(`https://www.fotmob.com/api/matches?date=${tomorrowStr}`)
            ]);

            const dataToday = await resToday.json();
            const dataTomorrow = await resTomorrow.json();

            // အချက်အလက်အားလုံးကို ပေါင်းလိုက်မယ်
            const allLeagues = [
                ...(dataToday.leagues || []),
                ...(dataTomorrow.leagues || [])
            ];

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
                
                // Score သတ်မှတ်ခြင်း (မကန်ရသေးရင် 0-0 ပြမယ်)
                const homeScore = m.home.score ?? 0;
                const awayScore = m.away.score ?? 0;
                const scoreStr = `${homeScore}-${awayScore}`;

                match = await Match.findOneAndUpdate(
                    { fixtureId: m.id },
                    { 
                        home: m.home.name, 
                        away: m.away.name,
                        league: leagueName, 
                        score: scoreStr,
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

    // ၃။ ရလဒ်ပြန်ပို့ပေးခြင်း
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

// Vercel အတွက် export default
export default webhookCallback(bot, "http");
