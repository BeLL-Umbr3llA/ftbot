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

// မြန်မာစံတော်ချိန် ပြောင်းလဲခြင်းနှင့် နေ့စွဲစစ်ဆေးခြင်း
function formatMMT(utcString) {
    const date = new Date(utcString);
    date.setMinutes(date.getMinutes() + 390); // UTC to MMT
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { full: `${day} | ${time}`, time };
}

// Search အတွက် Random စာသားများ
const getRandomWaitText = () => {
    const texts = ["ရင်ခုန်နေပြီလား? 💓", "ပွဲစဖို့ စောင့်နေပါတယ်... ⏳", "အကြိတ်အနယ် ရှိမှာနော်... 🔥", "ဘယ်သူနိုင်မလဲ ခန့်မှန်းကြည့်ပါဦး... 🤔"];
    return texts[Math.floor(Math.random() * texts.length)];
};

bot.command("start", (ctx) => ctx.reply("⚽ *B2 Football Noti Bot*\n\n/live - ဒီနေ့နဲ့မနက်ဖြန် ပွဲစဉ်များ\nအသင်းနာမည်ရိုက်ပြီး ရှာဖွေနိုင်ပါသည်။", { parse_mode: "Markdown" }));

// --- Live/Upcoming Matches (Today & Tomorrow) ---
bot.command("live", async (ctx) => {
    const kb = new InlineKeyboard()
        .text("PL", "lv_PL").text("PD", "lv_PD").text("SA", "lv_SA").text("BL1", "lv_BL1").row()
        .text("FL1", "lv_FL1").text("CL", "lv_CL").text("PPL", "lv_PPL").text("DED", "lv_DED").row()
        .text("BSA", "lv_BSA").text("ELC", "lv_ELC").text("WC", "lv_WC").text("EC", "lv_EC");
    await ctx.reply("🏆 ကြည့်လိုသော လိဂ်ကို ရွေးချယ်ပါ:", { reply_markup: kb });
});

bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lv_")) {
        const code = data.split("_")[1];
        await ctx.answerCallbackQuery("ပွဲစဉ်များ ရှာဖွေနေသည်...");
        
        const res = await fetchFD(`competitions/${code}/matches`);
        if (res.error) return ctx.reply(`⚠️ Error: ${res.error}`);

        const now = new Date();
        const tomorrowEnd = new Date();
        tomorrowEnd.setDate(now.getDate() + 1);
        tomorrowEnd.setHours(23, 59, 59, 999);

        // ဒီနေ့နဲ့ မနက်ဖြန် ပွဲစဉ်များသာ Filter လုပ်ခြင်း
        const filtered = res.matches.filter(m => {
            const mDate = new Date(m.utcDate);
            return mDate >= now && mDate <= tomorrowEnd;
        });

        if (filtered.length === 0) return ctx.reply(`🏟️ လောလောဆယ် ${code} မှာ ဒီနေ့/မနက်ဖြန် ပွဲစဉ်မရှိပါ။`);

        let msg = `📅 *${code} ပွဲစဉ်များ (Today/Tomorrow)*\n\n`;
        filtered.forEach(m => {
            const { full } = formatMMT(m.utcDate);
            if (m.status === "TIMED") {
                msg += `⏰ ${full}\n🤝 ${m.homeTeam.shortName} vs ${m.awayTeam.shortName}\n\n`;
            } else {
                msg += `🔴 LIVE | ${m.homeTeam.shortName} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.shortName}\n\n`;
            }
        });
        await ctx.reply(msg, { parse_mode: "Markdown" });
    }

    if (data.startsWith("sub_")) {
        const fixtureId = data.split("_")[1];
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { $addToSet: { subscriptions: fixtureId } },
            { upsert: true }
        );
        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ *ဒီပွဲစဉ်အတွက် Noti ယူပြီးပါပြီ။ ပွဲစရင် လှမ်းအကြောင်းကြားပေးပါ့မယ်။*", { parse_mode: "Markdown" });
        await ctx.answerCallbackQuery("Notification Set!");
    }
});

// --- Search Logic (with Random Texts & Date/Time) ---
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
                        utcDate: m.utcDate, lastUpdated: new Date()
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
        const { full } = formatMMT(m.utcDate);
        const scoreDisplay = m.status === "TIMED" ? getRandomWaitText() : `ရလဒ်: ${m.score}`;
        
        const kb = new InlineKeyboard().text("🔔 Noti ရယူမည်", `sub_${m.fixtureId}`);
        await ctx.reply(
            `🏟️ *ပွဲစဉ်အသေးစိတ်*\n\n` +
            `🏆 ${m.league}\n` +
            `🆚 ${m.home} vs ${m.away}\n` +
            `📅 ${full}\n` +
            `🔢 ${scoreDisplay}\n` +
            `🕒 အခြေအနေ: ${m.status === 'TIMED' ? 'ပွဲမစသေးပါ' : 'ကစားနေသည်'}`, 
            { parse_mode: "Markdown", reply_markup: kb }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ အသင်းနာမည်ကို အင်္ဂလိပ်လို ရိုက်ကြည့်ပါ (ဥပမာ- Arsenal)။");
    }
});

module.exports = webhookCallback(bot, "http"); //live ဆိုရင် လှလှပပ ဖတ်ကောင်းအောင် နားလည်အောင် league ပြ ဒီနေ့နဲ့ မနက်ဖန်ပွဲပြတာကို သေချာစစ် ပေး သဘက်ခါထိပါနေလားလို့  upcoming ခလုတ်ထည့်ပြီး user ကနှိပ်ရင် ၅ရက်စာပွဲတွေပြ leauge အလိုက် ဒီနေ့နဲ့ မနက်ဖန် ပွဲစဥ◌် အရေအတွက်ဘယ်လောက်ရှိလဲဆိုတာ leauge မနှိပ်ကတည်းကကြည့်ရအောင်လုပ် သေချာလုပ်ပေး
