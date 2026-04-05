const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fuse = require("fuse.js");
const Fotmob = require("fotmob").default;
const fotmob = new Fotmob();
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

bot.on("message:text", async (ctx) => {
    await connectDB();
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

    // --- (A) /live Command: Top Leagues များထဲမှ Live ဖြစ်နေသော ပွဲစဉ်များပြရန် ---
    if (text === "/live") {
        const liveMatches = await Match.find({ status: "Live" });
        
        if (liveMatches.length === 0) {
            return ctx.reply("🏟️ လောလောဆယ် Live ပွဲစဉ်မရှိသေးပါဘူးဗျ။ ပွဲရှိတဲ့အချိန်မှ ပြန်စမ်းကြည့်ပေးပါ။");
        }

        let msg = "🏆 *TOP LEAGUES LIVE SCORES*\n\n";
        const keyboard = new InlineKeyboard();

        // ပွဲစဉ် ၁၀ ခုအထိပြမည်
        liveMatches.slice(0, 10).forEach(m => {
            msg += `⚽ ${m.home} ${m.score} ${m.away}\n`;
            keyboard.text(`🔔 Noti - ${m.home.substring(0, 6)}`, `sub_${m.fixtureId}`).row();
        });

        return ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    }

    // --- (B) Search Logic: Fuse.js ဖြင့် DB ထဲတွင် ရှာဖွေခြင်း ---
    const allMatches = await Match.find({});
    const fuse = new Fuse(allMatches, { 
        keys: ["home", "away"], 
        threshold: 0.3 // ပိုပြီး တိကျစေရန် threshold ကို လျှော့ထားသည်
    });
    
    const results = fuse.search(text);

    if (results.length > 0) {
        let m = results[0].item;
        
        // Data Freshness Check: ၅ မိနစ်ထက် ကျော်နေရင် API ကနေ Update ယူမယ်
        const isOld = (new Date() - new Date(m.lastUpdated)) > 5 * 60 * 1000;
        
        if (isOld) {
            try {
                // FotMob မှ နောက်ဆုံးရလဒ်ကို တိုက်ရိုက်ဆွဲယူပြီး DB update လုပ်ခြင်း
                const details = await fotmob.getMatchDetails(m.fixtureId);
                if (details) {
                    const freshScore = `${details.header.teams[0].score}-${details.header.teams[1].score}`;
                    m = await Match.findOneAndUpdate(
                        { fixtureId: m.fixtureId },
                        { score: freshScore, status: details.header.status.reasonShort, lastUpdated: new Date() },
                        { new: true }
                    );
                }
            } catch (err) {
                console.error("Fresh data fetch failed:", err);
            }
        }

        const keyboard = new InlineKeyboard().text("🔔 Noti ယူမည်", `sub_${m.fixtureId}`);
        
        await ctx.reply(
            `🏟️ *MATCH FOUND*\n\n🏆 ${m.league}\n🆚 ${m.home} vs ${m.away}\n🔢 Score: ${m.score}\n🕒 Status: ${m.status}\n\n_Last Updated: ${m.lastUpdated.toLocaleTimeString('en-GB')}_`,
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ အသင်းနာမည် (ဥပမာ- Chelsea) ကို မှန်ကန်အောင် ရိုက်ပေးပါခင်ဗျာ။");
    }
});

// Callback Query: Noti Subscribe လုပ်ခြင်း
bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;

    if (data.startsWith("sub_")) {
        const fId = parseInt(data.split("_")[1]);
        
        // User data ကို Atlas ထဲတွင် သိမ်းဆည်းခြင်း
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { 
                username: ctx.from.username || ctx.from.first_name, 
                $addToSet: { subscriptions: fId } 
            },
            { upsert: true }
        );
        
        await ctx.answerCallbackQuery("✅ Noti မှတ်သားပြီးပါပြီ။ ဂိုးဝင်ရင် အကြောင်းကြားပေးပါ့မယ်။");
        await ctx.editMessageCaption ? await ctx.editMessageCaption({ caption: "🔔 ဤပွဲအတွက် Noti ဖွင့်ထားပြီးပါပြီ။" }) : null;
    }
});

module.exports = webhookCallback(bot, "http");
