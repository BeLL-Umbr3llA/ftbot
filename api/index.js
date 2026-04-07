const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fuse = require("fuse.js");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// API Fetch Helper (Format မှန်အောင် ပြင်ထားသည်)
async function fetchFD(endpoint) {
    try {
        const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
            headers: { "X-Auth-Token": API_KEY }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        return null;
    }
}

bot.command("start", (ctx) => ctx.reply("Football Bot Ready!\n/live - Check Live Matches\nType team name to search matches."));

// --- League Selection (Unicode Error ကင်းအောင် Emoji ဖယ်ထားသည်) ---
bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("PL (England)", "lv_PL").text("La Liga (Spain)", "lv_PD").row()
        .text("Serie A (Italy)", "lv_SA").text("Bundesliga (Germany)", "lv_BL1").row()
        .text("UCL (Europe)", "lv_CL").text("Ligue 1 (France)", "lv_FL1");
    await ctx.reply("Select League:", { reply_markup: kb });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        // 404 Error မတက်အောင် endpoint ကို ရှင်းရှင်းပဲ ခေါ်ထားသည်
        const res = await fetchFD(`competitions/${code}/matches`);
        
        if (!res || !res.matches) return ctx.answerCallbackQuery("API Error!");

        // Status စစ်ပြီး Live ဖြစ်နေတဲ့ ပွဲတွေကိုပဲ ယူသည်
        const liveNow = res.matches.filter(m => m.status === "IN_PLAY" || m.status === "LIVE" || m.status === "PAUSED");

        if (liveNow.length === 0) {
            return ctx.reply(`No Live matches in ${code} at the moment.`);
        }

        let msg = `LIVE SCORES (${code})\n\n`;
        const kb = new InlineKeyboard();
        liveNow.forEach(m => {
            msg += `- ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n`;
            kb.text(`Noti: ${m.homeTeam.tla}`, `sub_${m.id}`).row();
        });
        await ctx.reply(msg, { reply_markup: kb });
    }

    if (data.startsWith("sub_")) {
        const fId = parseInt(data.split("_")[1]);
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { username: ctx.from.username, $addToSet: { subscriptions: fId } },
            { upsert: true }
        );
        await ctx.answerCallbackQuery("Notification Set!");
    }
});

// --- Team Search Logic ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    // API Limit ကြောင့် DB ထဲက Data ကို အရင်စစ်သည်
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
        const kb = new InlineKeyboard().text("Set Noti", `sub_${m.fixtureId}`);
        await ctx.reply(`Match: ${m.home} vs ${m.away}\nScore: ${m.score}\nStatus: ${m.status}`, { reply_markup: kb });
    } else {
        await ctx.reply("Match not found. Please try again.");
    }
});

export default webhookCallback(bot, "http");
