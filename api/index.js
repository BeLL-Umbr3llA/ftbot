const { Bot, webhookCallback, InlineKeyboard } = require("grammy");
const mongoose = require("mongoose");
const Fuse = require("fuse.js");

const bot = new Bot(process.env.BOT_TOKEN);

// --- MongoDB Schemas ---
const matchSchema = new mongoose.Schema({
    fixtureId: { type: Number, unique: true },
    home: String,
    away: String,
    score: { type: String, default: "0-0" },
    status: String, // 'Live', 'NS', 'FT'
    eventTime: Date,
    league: String
});

const userSchema = new mongoose.Schema({
    userId: Number,
    subscriptions: [Number]
});

const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    await mongoose.connect(process.env.MONGO_URI);
};

bot.command("start", (ctx) => ctx.reply("⚽ မင်္ဂလာပါဗျ! အသင်းနာမည်ရိုက်ပြီး Live Score နဲ့ Upcoming ပွဲတွေ ရှာနိုင်ပါတယ် (ဥပမာ- Chelsea)။"));

bot.on("message:text", async (ctx) => {
    await connectDB();
    const query = ctx.message.text.trim();

    const allMatches = await Match.find({});
    const fuse = new Fuse(allMatches, { keys: ["home", "away"], threshold: 0.35 });
    const results = fuse.search(query);

    if (results.length === 0) return ctx.reply("🔍 ရှာမတွေ့ပါဘူးဗျ။ အသင်းနာမည် အပြည့်အစုံ ပြန်ရိုက်ကြည့်ပါဦး။");

    let liveMsg = "🔴 *LIVE MATCHES*\n";
    let upcomingMsg = "📅 *UPCOMING*\n";
    const keyboard = new InlineKeyboard();

    results.slice(0, 5).forEach(({ item }) => {
        const isLive = item.status && (item.status.includes("'") || item.status === "HT" || item.status === "Live");
        const timeStr = new Date(item.eventTime).toLocaleString('en-GB', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' });

        if (isLive) {
            liveMsg += `🔥 ${item.home} ${item.score} ${item.away} (${item.status})\n`;
        } else {
            upcomingMsg += `⏳ ${item.home} vs ${item.away} [${timeStr}]\n`;
        }
        keyboard.text(`🔔 Noti ရယူမည်: ${item.home.substring(0,12)}`, `sub_${item.fixtureId}`).row();
    });

    await ctx.reply(`${liveMsg}\n${upcomingMsg}`, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.callbackQuery(/^sub_(\d+)$/, async (ctx) => {
    await connectDB();
    const fId = parseInt(ctx.match[1]);
    await User.findOneAndUpdate({ userId: ctx.from.id }, { $addToSet: { subscriptions: fId } }, { upsert: true });
    await ctx.answerCallbackQuery("✅ Noti မှတ်သားပြီးပါပြီ!");
});

module.exports = webhookCallback(bot, "http");
