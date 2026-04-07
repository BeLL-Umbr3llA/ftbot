const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const { connectDB, Match, User } = require("../db");
const Fuse = require("fuse.js");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// API Fetch Helper
async function fetchFD(endpoint) {
    try {
        const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
            headers: { "X-Auth-Token": API_KEY }
        });
        const data = await res.json();
        if (!res.ok) return { error: data.message || "Unknown API Error" };
        return data;
    } catch (err) {
        return { error: "Network/Server Error" };
    }
}

// မြန်မာစံတော်ချိန် (UTC+6:30) သို့ ပြောင်းလဲပေးသည့် Helper
function toMMT(utcString) {
    const date = new Date(utcString);
    if (isNaN(date)) return "အချိန်မသိရ";
    // ၆ နာရီ မိနစ် ၃၀ ပေါင်းထည့်သည်
    date.setMinutes(date.getMinutes() + 390);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
}

bot.command("start", (ctx) => ctx.reply("⚽ Football Bot Ready!\n/live - ပွဲစဉ်များကြည့်ရန်\nအသင်းနာမည်ရိုက်ပြီး ပွဲစဉ်ရှာနိုင်ပါသည်။"));

// --- League ခလုတ်များ (၁၂ ခုလုံး) ---
bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("PL (England)", "lv_PL").text("PD (Spain)", "lv_PD").row()
        .text("SA (Italy)", "lv_SA").text("BL1 (Germany)", "lv_BL1").row()
        .text("FL1 (France)", "lv_FL1").text("PPL (Portugal)", "lv_PPL").row()
        .text("DED (Netherland)", "lv_DED").text("BSA (Brazil)", "lv_BSA").row()
        .text("ELC (Championship)", "lv_ELC").text("CL (Champions)", "lv_CL").row()
        .text("WC (World Cup)", "lv_WC").text("EC (Euro)", "lv_EC");
    
    await ctx.reply("🏆 ကြည့်လိုသော လိဂ်ကို ရွေးချယ်ပါ:", { reply_markup: kb });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        await ctx.answerCallbackQuery("အချက်အလက်များ ဆွဲယူနေသည်...");
        
        // ပွဲစဉ်အားလုံးကို အရင်ယူပြီးမှ Logic နဲ့ ခွဲမည်
        const res = await fetchFD(`competitions/${code}/matches`);
        
        if (res.error) return ctx.reply(`⚠️ API Error: ${res.error}`);

        // ပွဲစနေတဲ့ပွဲ (LIVE) နဲ့ စတော့မယ့်ပွဲ (TIMED) တွေကို Filter လုပ်သည်
        const relevantMatches = res.matches.filter(m => 
            ["IN_PLAY", "LIVE", "PAUSED", "TIMED"].includes(m.status)
        );

        if (relevantMatches.length === 0) {
            return ctx.reply(`🏟️ လောလောဆယ် ${code} မှာ ပွဲစဉ်များမရှိသေးပါ။`);
        }

        let msg = `⚽ *${code} ပွဲစဉ်များ*\n\n`;
        relevantMatches.forEach(m => {
            if (m.status === "TIMED") {
                // ပွဲမစသေးလျှင် စမည့်အချိန်ကို ပြသည်
                msg += `⏰ ${toMMT(m.utcDate)} | ${m.homeTeam.shortName} vs ${m.awayTeam.shortName}\n`;
            } else {
                // ပွဲစနေလျှင် LIVE လို့ပြပြီး ရလဒ်ပြသည်
                msg += `🔴 LIVE | ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n`;
            }
        });

        await ctx.reply(msg, { parse_mode: "Markdown" });
    }
});

// --- Search Logic (မြန်မာမှုထည့်ထားသည်) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    let matches = await Match.find({ lastUpdated: { $gte: new Date(Date.now() - 3600000) } });

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
                    }, { upsert: true, new: true }
                );
            }
            matches = await Match.find();
        }
    }

    const fuse = new Fuse(matches, { keys: ["home", "away"], threshold: 0.3 });
    const result = fuse.search(query);

    if (result.length > 0) {
        const m = result[0].item;
        const kb = new InlineKeyboard().text("🔔 Noti ရယူမည်", `sub_${m.fixtureId}`);
        await ctx.reply(
            `🏟️ *ပွဲစဉ်ရှာတွေ့သည်*\n\n` +
            `🏆 ${m.league}\n` +
            `🆚 ${m.home} vs ${m.away}\n` +
            `🔢 ရလဒ်: ${m.score}\n` +
            `🕒 အခြေအနေ: ${m.status === 'TIMED' ? 'ပွဲမစသေးပါ' : m.status}`, 
            { parse_mode: "Markdown", reply_markup: kb }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ အသင်းနာမည် အင်္ဂလိပ်လို မှန်အောင် ရိုက်ပေးပါ (ဥပမာ- Arsenal)။");
    }
});

module.exports = webhookCallback(bot, "http");
