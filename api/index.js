const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const Fotmob = require("fotmob").default;
const fotmob = new Fotmob();
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

// --- (၁) Commands အပိုင်းကို အပေါ်ဆုံးမှာ ထားရပါမယ် ---
bot.command("live", async (ctx) => {
    try {
        await connectDB();
        // DB ထဲမှာ Live ဖြစ်နေတာတွေကို အရင်ရှာမယ်
        const liveMatches = await Match.find({ status: "Live" });
        
        if (liveMatches.length === 0) {
            return ctx.reply("🏟️ လောလောဆယ် Live ပွဲစဉ်မရှိသေးပါဘူးဗျ။ တခြားအသင်းနာမည်တွေ ရိုက်ရှာကြည့်ပါဦး။");
        }
        
        let msg = "⚽ *LIVE SCORES*\n\n";
        const keyboard = new InlineKeyboard();
        liveMatches.slice(0, 8).forEach(m => {
            msg += `• ${m.home} ${m.score} ${m.away}\n`;
            keyboard.text(`🔔 ${m.home.substring(0,5)}`, `sub_${m.fixtureId}`).row();
        });
        
        ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (err) {
        console.error(err);
        ctx.reply("❌ Error: Live ပွဲစဉ်တွေ ဆွဲယူရာမှာ အဆင်မပြေဖြစ်သွားပါတယ်။");
    }
});

bot.command("start", (ctx) => ctx.reply("မင်္ဂလာပါ! အသင်းနာမည်ရိုက်ပြီး ပွဲစဉ်ရှာနိုင်သလို /live command နဲ့လည်း လက်ရှိပွဲတွေကို ကြည့်နိုင်ပါတယ်ဗျ။"));

// --- (၂) Search Logic (Message Text) ---
bot.on("message:text", async (ctx) => {
    await connectDB();
    const text = ctx.message.text.trim();

    // Command ဖြစ်နေရင် ဒီ logic ကို ကျော်သွားဖို့ (အပေါ်က command မှာ မမိခဲ့ရင်)
    if (text.startsWith("/")) return;

    // MongoDB ထဲမှာ အရင်ရှာမယ်
    let match = await Match.findOne({
        $or: [
            { home: { $regex: text, $options: "i" } },
            { away: { $regex: text, $options: "i" } }
        ]
    });

    const now = new Date();
    // DB မှာမရှိရင် သို့မဟုတ် ၁ မိနစ်ထက် ကြာနေရင် API ကနေအသစ်တောင်းမယ်
    if (!match || (now - new Date(match.lastUpdated)) > 60000) {
        try {
            const today = now.toLocaleDateString('en-CA').replace(/-/g, '');
            const data = await fotmob.getMatchesByDate(today);
            
            let foundInApi = null;
            for (const league of data.leagues) {
                const m = league.matches.find(x => 
                    x.home.name.toLowerCase().includes(text.toLowerCase()) || 
                    x.away.name.toLowerCase().includes(text.toLowerCase())
                );
                if (m) {
                    foundInApi = { m, leagueName: league.name };
                    break;
                }
            }

            if (foundInApi) {
                const { m, leagueName } = foundInApi;
                const score = `${m.home.score}-${m.away.score}`;
                match = await Match.findOneAndUpdate(
                    { fixtureId: m.id },
                    { 
                        home: m.home.name, away: m.away.name,
                        league: leagueName, score: score,
                        status: m.status.live ? "Live" : m.status.reasonShort,
                        lastUpdated: new Date()
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (err) { 
            console.error("API Search Error:", err); 
        }
    }

    if (match) {
        const keyboard = new InlineKeyboard().text("🔔 Noti ယူမည်", `sub_${match.fixtureId}`);
        await ctx.reply(
            `🏟️ *MATCH FOUND*\n\n🏆 ${match.league}\n🆚 ${match.home} vs ${match.away}\n🔢 Score: ${match.score}\n🕒 Status: ${match.status}\n\n_Last Updated: ${match.lastUpdated.toLocaleTimeString('en-GB')}_`,
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply("🔍 ပွဲစဉ်ရှာမတွေ့ပါ။ အသင်းနာမည်ကို အင်္ဂလိပ်လို (ဥပမာ- Chelsea) ဟု ရိုက်ပေးပါဗျ။");
    }
});

// --- (၃) Callback Query Logic ---
bot.on("callback_query:data", async (ctx) => {
    await connectDB();
    const data = ctx.callbackQuery.data;
    if (data.startsWith("sub_")) {
        const fId = parseInt(data.split("_")[1]);
        await User.findOneAndUpdate(
            { userId: ctx.from.id },
            { 
                name: ctx.from.first_name,
                $addToSet: { subscriptions: fId } 
            },
            { upsert: true }
        );
        await ctx.answerCallbackQuery("✅ Noti မှတ်သားပြီးပါပြီ။");
        await ctx.reply(`🔔 သင်သည် ပွဲစဉ် (ID: ${fId}) အတွက် Noti ယူထားလိုက်ပါပြီ။ ဂိုးဝင်ရင် အသိပေးပါ့မယ်။`);
    }
});

// Vercel အတွက် export default လုပ်ပေးရပါမယ်
export default webhookCallback(bot, "http");
