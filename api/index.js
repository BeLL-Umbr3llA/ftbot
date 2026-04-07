const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fuse = require("fuse.js");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fetchFD(endpoint) {
    const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
        headers: { "X-Auth-Token": API_KEY }
    });
    if (!res.ok) return null;
    return await res.json();
}

bot.command("start", (ctx) => ctx.reply("⚽ Football Bot Ready!\n/live - Live ပွဲစဉ်များ\nအသင်းနာမည်ရိုက်ပြီး ရှာနိုင်ပါသည်။"));

// --- Live Button နှိပ်ရင် ပြမည့်အပိုင်း ---
bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL", "lv_PL").text("🇪🇸 La Liga", "lv_PD").row()
        .text("🇮🇹 Serie A", "lv_SA").text("🇩🇪 Bundesliga", "lv_BL1").row()
        .text("🇪🇺 UCL", "lv_CL").text("🇫🇷 Ligue 1", "lv_FL1");
    await ctx.reply("🏆 League ရွေးပါ-", { reply_markup: kb });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        // API Tier အရ matches?status=LIVE က Error တက်တတ်လို့ အကုန်ဆွဲပြီး filter လုပ်မယ်
        const res = await fetchFD(`competitions/${code}/matches`);
        
        if (!res || !res.matches) return ctx.answerCallbackQuery("⚠️ API Error!");

        const liveNow = res.matches.filter(m => m.status === "IN_PLAY" || m.status === "LIVE");

        if (liveNow.length === 0) {
            return ctx.reply(`🏟️ ${code} မှာ လောလောဆယ် Live ပွဲမရှိပါ။`);
        }

        let msg = `⚽ *LIVE SCORES*\n\n`;
        const kb = new InlineKeyboard();
        liveNow.forEach(m => {
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

// --- အသင်းရှာဖွေခြင်း ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    // ၁၅ မိနစ်အတွင်း data ကိုပဲယူမယ် (API Limit ကြောင့်)
    let matches = await Match.find({ lastUpdated: { $gte: new Date(Date.now() - 900000) } });

    if (matches.length === 0) {
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
        await ctx.reply(`🏟️ *Found Match*\n\n🆚 ${m.home} vs ${m.away}\n🔢 Score: ${m.score}\n🕒 Status: ${m.status}`, { reply_markup: kb });
    } else {
        await ctx.reply("🔍 ရှာမတွေ့ပါ။ အင်္ဂလိပ်လို အသင်းနာမည် အပြည့်အစုံ ရိုက်ကြည့်ပါ။");
    }
});

export default webhookCallback(bot, "http");
