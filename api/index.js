const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");
const Fuse = require("fuse.js");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// API Fetch Helper Function
async function fetchFD(endpoint) {
    console.log("Fetching API endpoint:", endpoint);
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

// --- Bot Commands ---
bot.command("start", (ctx) => ctx.reply("Football Bot Ready!\n/live - Check Live Matches\nType team name to search matches."));

bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("PL (England)", "lv_PL").text("PD (Spain)", "lv_PD").row()
        .text("SA (Italy)", "lv_SA").text("BL1 (Germany)", "lv_BL1").row()
        .text("FL1 (France)", "lv_FL1").text("PPL (Portugal)", "lv_PPL");
    await ctx.reply("Select League (Free Tier Only):", { reply_markup: kb });
});

// --- Callback Query Handling (Live Scores) ---
bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        await ctx.answerCallbackQuery("Fetching data...");
        
        const res = await fetchFD(`competitions/${code}/matches?status=LIVE`);
        
        if (res.error) {
            return ctx.reply(`⚠️ API Error: ${res.error}`);
        }

        if (!res.matches || res.matches.length === 0) {
            return ctx.reply(`🏟️ No live matches in ${code} right now.`);
        }

        let msg = `⚽ LIVE SCORES (${code})\n\n`;
        res.matches.forEach(m => {
            msg += `- ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n`;
        });
        await ctx.reply(msg);
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

    let matches = await Match.find({ 
        lastUpdated: { $gte: new Date(Date.now() - 3600000) } 
    });

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
            matches = await Match.find();
        }
    }

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

// Vercel အတွက် အဓိက Export အပိုင်း (CommonJS Style)
module.exports = webhookCallback(bot, "http");
