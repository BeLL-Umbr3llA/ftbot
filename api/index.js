const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fuse = require("fuse.js");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Football-Data API Fetch Helper
async function fetchFD(endpoint) {
    try {
        const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
            headers: { "X-Auth-Token": API_KEY }
        });
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("API Fetch Error:", err.message);
        return null;
    }
}

bot.command("start", (ctx) => ctx.reply("⚽ Football Bot မှ ကြိုဆိုပါတယ်!\n\n- /live : League အလိုက်ကြည့်ရန်\n- အသင်းနာမည်ရိုက်ပြီး ပွဲစဉ်ရှာရန်"));

// --- League ရွေးရန် ---
bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL", "lv_PL").text("🇪🇸 La Liga", "lv_PD").row()
        .text("🇮🇹 Serie A", "lv_SA").text("🇩🇪 Bundesliga", "lv_BL1").row()
        .text("🇪🇺 UCL", "lv_CL").text("🇫🇷 Ligue 1", "lv_FL1");
    await ctx.reply("🏆 League တစ်ခု ရွေးပေးပါ-", { reply_markup: kb });
});

// --- Callback Logic (Live & Noti) ---
bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        // Live ပွဲတွေပဲ ဆွဲထုတ်မယ်
        const res = await fetchFD(`competitions/${code}/matches?status=LIVE`);
        
        if (!res || !res.matches?.length) {
            return ctx.answerCallbackQuery("🏟️ လောလောဆယ် Live ပွဲမရှိပါ။", { show_alert: true });
        }

        let msg = `⚽ *LIVE SCORES (${code})*\n\n`;
        const kb = new InlineKeyboard();
        res.matches.forEach(m => {
            msg += `• ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n`;
            kb.text(`🔔 Noti: ${m.homeTeam.tla}`, `sub_${m.id}`).row();
        });
        await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
    }

    if (data.startsWith("sub_")) {
        const fId = parseInt(data.split("_")[1]);
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { username: ctx.from.username, $addToSet: { subscriptions: fId } },
            { upsert: true }
        );
        await ctx.answerCallbackQuery("✅ ဂိုးသွင်းရင် Noti ပို့ပေးပါမယ်။");
    }
});

// --- အသင်းရှာဖွေခြင်း (Fuse.js) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    // DB မှာ ၁ မိနစ်အတွင်း data ရှိမရှိစစ်
    let matches = await Match.find({ lastUpdated: { $gte: new Date(Date.now() - 60000) } });

    if (matches.length === 0) {
        // endpoint ကို သေချာပြင်ထားပါတယ်
        const res = await fetchFD("matches"); 
        if (res && res.matches) {
            for (const m of res.matches) {
                await Match.findOneAndUpdate(
                    { fixtureId: m.id },
                    {
                        home: m.homeTeam.name, away: m.awayTeam.name,
                        league: m.competition.name, status: m.status,
                        score: `${m.score.fullTime.home ?? 0}-${m.score.fullTime.away ?? 0}`,
                        lastUpdated: new Date()
                    }, { upsert: true }
                );
            }
            matches = await Match.find();
        }
    }

    const fuse = new Fuse(matches, { keys: ["home", "away"], threshold: 0.4 });
    const result = fuse.search(query);

    if (result.length > 0) {
        const m = result[0].item;
        const kb = new InlineKeyboard().text("🔔 Noti ယူမည်", `sub_${m.fixtureId}`);
        await ctx.reply(`🏟️ *MATCH FOUND*\n\n🏆 ${m.league}\n🆚 ${m.home} vs ${m.away}\n🔢 Score: ${m.score}\n🕒 Status: ${m.status}`, { parse_mode: "Markdown", reply_markup: kb });
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။");
    }
});

export default webhookCallback(bot, "http");
