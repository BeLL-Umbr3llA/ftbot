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
        return res.ok ? data : { error: data.message };
    } catch (err) { return { error: "Network Error" }; }
}

function formatMMT(utcString) {
    const date = new Date(utcString);
    date.setMinutes(date.getMinutes() + 390);
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { full: `${day} | ${time}`, dateOnly: day };
}

bot.command("start", (ctx) => ctx.reply("⚽ *B2 Football Noti Bot*\n\n/live - ပွဲစဉ်များကြည့်ရန်\nအသင်းနာမည်ရိုက်ပြီး ပွဲရှာနိုင်ပါသည်။", { parse_mode: "Markdown" }));

// --- League ခလုတ်များ (ပွဲအရေအတွက် ကြိုပြမည့် Logic) ---
bot.command("live", async (ctx) => {
    await ctx.reply("⏳ League အချက်အလက်များ စစ်ဆေးနေသည်...");
    
    // API ကနေ ဒီနေ့နဲ့ မနက်ဖြန် ပွဲစဉ်အားလုံးကို တစ်ခါတည်းယူလိုက်မယ်
    const res = await fetchFD("matches");
    if (res.error) return ctx.reply("❌ API အလုပ်မလုပ်ပါ။ ခဏနေမှ ပြန်ကြိုးစားပါ။");

    const now = new Date();
    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(now.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59);

    const counts = {};
    const leagues = [
        { n: "PL", c: "PL" }, { n: "PD", c: "PD" }, { n: "SA", c: "SA" }, { n: "BL1", c: "BL1" },
        { n: "FL1", c: "FL1" }, { n: "CL", c: "CL" }, { n: "PPL", c: "PPL" }, { n: "DED", c: "DED" }
    ];

    // ပွဲအရေအတွက် တွက်ချက်ခြင်း
    res.matches.forEach(m => {
        const mDate = new Date(m.utcDate);
        if (mDate >= now && mDate <= tomorrowEnd) {
            counts[m.competition.code] = (counts[m.competition.code] || 0) + 1;
        }
    });

    const kb = new InlineKeyboard();
    leagues.forEach((l, i) => {
        const count = counts[l.c] || 0;
        kb.text(`${l.n} (${count})`, `lv_${l.c}`);
        if (i % 2 !== 0) kb.row();
    });
    kb.row().text("📅 အားလုံးကြည့်မည် (Upcoming 5 Days)", "upcoming_5");

    await ctx.reply("🏆 *ကြည့်လိုသော လိဂ်ကို ရွေးချယ်ပါ*\n(ကွင်းစပ်ထဲက နံပါတ်မှာ ယနေ့နှင့်မနက်ဖြန်ရှိမည့် ပွဲအရေအတွက်ဖြစ်သည်)", { 
        parse_mode: "Markdown", 
        reply_markup: kb 
    });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    // --- League အလိုက် ပွဲစဉ်ပြခြင်း ---
    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        await ctx.answerCallbackQuery("ရှာဖွေနေသည်...");
        const res = await fetchFD(`competitions/${code}/matches`);

        const now = new Date();
        const tomorrowEnd = new Date();
        tomorrowEnd.setDate(now.getDate() + 1);
        tomorrowEnd.setHours(23, 59, 59);

        const filtered = res.matches.filter(m => {
            const d = new Date(m.utcDate);
            return d >= now && d <= tomorrowEnd;
        });

        if (filtered.length === 0) return ctx.reply(`🏟️ ${code} တွင် ယနေ့/မနက်ဖြန် ပွဲစဉ်မရှိပါ။`);

        let msg = `📅 *${code} ပွဲစဉ်များ (Today/Tomorrow)*\n\n`;
        filtered.forEach(m => {
            const { full } = formatMMT(m.utcDate);
            if (m.status === "TIMED") {
                msg += `⏰ ${full}\n🤝 *${m.homeTeam.shortName}* vs *${m.awayTeam.shortName}*\n\n`;
            } else {
                msg += `🔴 *LIVE* | ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n\n`;
            }
        });
        await ctx.reply(msg, { parse_mode: "Markdown" });
    }

    // --- Upcoming 5 Days ---
    if (data === "upcoming_5") {
        await ctx.answerCallbackQuery("၅ ရက်စာ ပွဲစဉ်များ ယူနေသည်...");
        const res = await fetchFD("matches");
        
        const now = new Date();
        const fiveDaysLater = new Date();
        fiveDaysLater.setDate(now.getDate() + 5);

        const filtered = res.matches.filter(m => {
            const d = new Date(m.utcDate);
            return d >= now && d <= fiveDaysLater;
        }).slice(0, 15); // စာသားမရှည်အောင် ၁၅ ပွဲပဲ ပြမယ်

        let msg = `🗓️ *နောင် ၅ ရက်အတွင်း အရေးကြီးပွဲစဉ်များ*\n\n`;
        filtered.forEach(m => {
            const { full } = formatMMT(m.utcDate);
            msg += `▫️ ${full}\n⚽ ${m.homeTeam.shortName} vs ${m.awayTeam.shortName}\n\n`;
        });
        await ctx.reply(msg, { parse_mode: "Markdown" });
    }
});

// --- Search Logic (with Random Texts) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();
    if (query.startsWith("/")) return;

    let matches = await Match.find({ lastUpdated: { $gte: new Date(Date.now() - 3600000) } });
    const fuse = new Fuse(matches, { keys: ["home", "away"], threshold: 0.3 });
    const result = fuse.search(query);

    if (result.length > 0) {
        const m = result[0].item;
        const { full } = formatMMT(m.utcDate);
        const kb = new InlineKeyboard().text("🔔 Noti ရယူမည်", `sub_${m.fixtureId}`);
        await ctx.reply(
            `🏟️ *ပွဲစဉ်ရှာတွေ့သည်*\n\n` +
            `🏆 ${m.league}\n` +
            `🆚 ${m.home} vs ${m.away}\n` +
            `📅 ${full}\n` +
            `🔢 ${m.status === 'TIMED' ? getRandomWaitText() : m.score}\n` +
            `🕒 အခြေအနေ: ${m.status === 'TIMED' ? 'ပွဲမစသေးပါ' : 'ကစားနေသည်'}`,
            { parse_mode: "Markdown", reply_markup: kb }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ (ဥပမာ- Arsenal)");
    }
});

module.exports = webhookCallback(bot, "http");
