const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fetchFD(endpoint) {
    try {
        const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
            headers: { "X-Auth-Token": API_KEY }
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            return { error: data.message || "Unknown API Error" };
        }
        return data;
    } catch (err) {
        return { error: "Network/Server Error" };
    }
}

bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("PL (England)", "lv_PL").text("PD (Spain)", "lv_PD").row()
        .text("SA (Italy)", "lv_SA").text("BL1 (Germany)", "lv_BL1").row()
        .text("FL1 (France)", "lv_FL1").text("PPL (Portugal)", "lv_PPL");
    await ctx.reply("Select League (Free Tier Only):", { reply_markup: kb });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        await ctx.answerCallbackQuery("Fetching data...");
        
        // ဒီနေရာမှာ status=LIVE ကို တိုက်ရိုက်ထည့်ပြီး ခေါ်လိုက်ပါပြီ
        const res = await fetchFD(`competitions/${code}/matches?status=LIVE`);
        
        if (res.error) {
            return ctx.reply(`⚠️ API Error: ${res.error}`);
        }

        // res.matches က အလွတ်ပြန်လာရင် ပွဲမရှိဘူးလို့ ပြောမယ်
        if (!res.matches || res.matches.length === 0) {
            return ctx.reply(`🏟️ No live matches in ${code} right now.`);
        }

        let msg = `⚽ LIVE SCORES (${code})\n\n`;
        res.matches.forEach(m => {
            msg += `- ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n`;
        });
        await ctx.reply(msg);
    }
});
// --- အသင်းရှာဖွေခြင်း (Improved Search) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    // ၁။ DB ထဲမှာ အရင်ရှာကြည့်မယ် (Data လတ်ဆတ်အောင် ၁ နာရီအတွင်းဟာကိုပဲ ယူမယ်)
    let matches = await Match.find({ 
        lastUpdated: { $gte: new Date(Date.now() - 3600000) } 
    });

    // ၂။ DB ထဲမှာ data မရှိရင် (သို့မဟုတ်) ဟောင်းနေရင် API ကနေ အကုန်ဆွဲယူမယ်
    if (matches.length === 0) {
        const res = await fetchFD("matches"); 
        if (res && res.matches) {
            for (const m of res.matches) {
                await Match.findOneAndUpdate(
                    { fixtureId: m.id },
                    {
                        home: m.homeTeam.name, 
                        away: m.awayTeam.name,
                        league: m.competition.name, 
                        status: m.status,
                        score: `${m.score.fullTime.home ?? 0}-${m.score.fullTime.away ?? 0}`,
                        lastUpdated: new Date()
                    }, 
                    { upsert: true, new: true }
                );
            }
            // Update ပြီးမှ DB ကနေ ပြန်ဆွဲမယ်
            matches = await Match.find();
        }
    }

    // ၃။ Fuse.js နဲ့ ရှာမယ် (စာလုံးပေါင်း အနည်းငယ်လွဲရင်တောင် ရှာတွေ့အောင် threshold ထည့်ထားသည်)
    const fuse = new Fuse(matches, { 
        keys: ["home", "away"], 
        threshold: 0.3 
    });
    const result = fuse.search(query);

    if (result.length > 0) {
        const m = result[0].item;
        const kb = new InlineKeyboard().text("🔔 Get Noti", `sub_${m.fixtureId}`);
        
        await ctx.reply(
            `🏟️ *MATCH FOUND*\n\n` +
            `🏆 ${m.league}\n` +
            `🆚 ${m.home} vs ${m.away}\n` +
            `🔢 Score: ${m.score}\n` +
            `🕒 Status: ${m.status}`, 
            { parse_mode: "Markdown", reply_markup: kb }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ အသင်းနာမည်ကို အင်္ဂလိပ်လို အပြည့်အစုံ ရိုက်ကြည့်ပေးပါ (ဥပမာ- Arsenal, Real Madrid)။");
    }
});
export default webhookCallback(bot, "http");
