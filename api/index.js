const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fotmob = require("fotmob").default;
const fotmob = new Fotmob();
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

// --- Helper Function: Date formatting (YYYYMMDD) ---
const getFotmobDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

// --- (၁) /live Command ---
bot.command("live", async (ctx) => {
    try {
        await connectDB();
        const liveMatches = await Match.find({ status: "Live" });
        if (liveMatches.length === 0) return ctx.reply("🏟️ လောလောဆယ် Live ပွဲစဉ်မရှိသေးပါဘူး။");
        
        let msg = "⚽ *LIVE SCORES*\n\n";
        const keyboard = new InlineKeyboard();
        liveMatches.slice(0, 8).forEach(m => {
            msg += `• ${m.home} ${m.score} ${m.away}\n`;
            keyboard.text(`🔔 ${m.home.substring(0,5)}`, `sub_${m.fixtureId}`).row();
        });
        ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (err) { ctx.reply("❌ DB Connection Error!"); }
});

// --- (၂) Search Logic ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    // ၁။ DB မှာ အရင်ရှာ
    let match = await Match.findOne({
        $or: [
            { home: { $regex: query, $options: "i" } },
            { away: { $regex: query, $options: "i" } }
        ]
    });

    const now = new Date();
    // ၂။ DB မှာမရှိရင် သို့မဟုတ် ၁ မိနစ်ကျော်ရင် API ဆွဲမယ်
    if (!match || (now - new Date(match.lastUpdated)) > 60000) {
        try {
            const todayStr = getFotmobDate(now);
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = getFotmobDate(tomorrow);

            console.log(`Fetching Fotmob for: ${todayStr} & ${tomorrowStr}`);

            const [todayData, tomorrowData] = await Promise.all([
                fotmob.getMatchesByDate(todayStr).catch(() => null),
                fotmob.getMatchesByDate(tomorrowStr).catch(() => null)
            ]);

            if (!todayData && !tomorrowData) {
                console.error("Fotmob API is not returning data!");
            }

            const allLeagues = [
                ...(todayData?.leagues || []),
                ...(tomorrowData?.leagues || [])
            ];
            
            let foundInApi = null;
            const searchTxt = query.toLowerCase().replace(/\s+/g, '');

            for (const league of allLeagues) {
                const m = league.matches.find(x => 
                    x.home.name.toLowerCase().replace(/\s+/g, '').includes(searchTxt) || 
                    x.away.name.toLowerCase().replace(/\s+/g, '').includes(searchTxt)
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
            console.error("Fotmob API Fetch Error:", err); 
        }
    }

    if (match) {
        const keyboard = new InlineKeyboard().text("🔔 Noti ယူမည်", `sub_${match.fixtureId}`);
        await ctx.reply(
            `🏟️ *MATCH FOUND*\n\n🏆 ${match.league}\n🆚 ${match.home} vs ${match.away}\n🔢 Score: ${match.score}\n🕒 Status: ${match.status}\n\n_Last Updated: ${match.lastUpdated.toLocaleTimeString('en-GB')}_`,
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply(`🔍 "${query}" အတွက် ပွဲစဉ်ရှာမတွေ့ပါ။ \n(ဒီနေ့နဲ့ မနက်ဖြန် ပွဲစဉ်တွေကိုပဲ ရှာပေးနိုင်ပါတယ်ဗျ)`);
    }
});

// --- (၃) Noti Callback ---
bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;
    if (data.startsWith("sub_")) {
        const fId = parseInt(data.split("_")[1]);
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { name: ctx.from.first_name, $addToSet: { subscriptions: fId } },
            { upsert: true }
        );
        await ctx.answerCallbackQuery("✅ Noti မှတ်သားပြီးပါပြီ။");
        await ctx.reply(`🔔 ပွဲစဉ် (ID: ${fId}) အတွက် Noti ဖွင့်လိုက်ပါပြီ။`);
    }
});

export default webhookCallback(bot, "http");
