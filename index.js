const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const port = process.env.PORT || 3000;

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox"],
  },
});

// Store group chat ID and scheduled message data
let targetGroupId = null;
let scheduledMessageData = {
  isScheduled: false,
  targetDate: null,
};

// Generate QR code for WhatsApp Web authentication
client.on("qr", (qr) => {
  console.log("Scan this QR code in WhatsApp to log in:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp client is ready!");
});

// Function to check if it's a holiday
function isHoliday(date) {
  const holidays = [
    "2024-01-01", // New Year
    "2024-01-26", // Republic Day
    "2024-03-25", // Holi
    "2024-04-14", // Bengali New Year
    "2024-08-15", // Independence Day
    "2024-10-02", // Gandhi Jayanti
  ];

  const dateStr = date.toISOString().split("T")[0];
  return holidays.includes(dateStr);
}

// Function to check if it's a working day
function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !isHoliday(date);
}

// Function to send WhatsApp message
async function sendWhatsAppMessage() {
  if (!targetGroupId) {
    console.error("No group ID set. Please set group ID first.");
    return false;
  }

  try {
    await client.sendMessage(targetGroupId, "Today 1st trip & 1st trip return");
    console.log("Message sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
}

async function sendWhatsAppText(req) {
  if (!targetGroupId) {
    console.error("No group ID set. Please set group ID first.");
    return false;
  }

  try {
    await client.sendMessage(targetGroupId, req.body.message);
    console.log("Message sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
}

// Check every minute if it's time to send the scheduled message
cron.schedule(
  "* * * * *",
  async () => {
    if (!scheduledMessageData.isScheduled || !scheduledMessageData.targetDate) {
      return;
    }

    const now = new Date();
    const targetTime = new Date(scheduledMessageData.targetDate);

    // Check if current time matches target time (within the same minute)
    if (
      now.getFullYear() === targetTime.getFullYear() &&
      now.getMonth() === targetTime.getMonth() &&
      now.getDate() === targetTime.getDate() &&
      now.getHours() === targetTime.getHours() &&
      now.getMinutes() === targetTime.getMinutes()
    ) {
      // Add a 3-second delay before sending
      console.log("Time matched, waiting for 1s before sending...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (isWorkingDay(now)) {
        console.log(
          "Sending message after delay at:",
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        );
        await sendWhatsAppMessage();
      }

      // Reset schedule after sending (or attempting to send)
      scheduledMessageData = {
        isScheduled: false,
        targetDate: null,
      };
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);

app.get("/set-chat/:chatName", async (req, res) => {
  try {
    const groupName = req.params.chatName;

    const chats = await client.getChats();

    const groupsList = chats.filter(
      (chat) => chat.id && chat.id.server === "c.us"
    );

    const groupNameList = groupsList.map((groups) => groups.name);

    const groupIndex = groupNameList.indexOf(groupName);

    if (!groupNameList.includes(groupName)) {
      return res.status(404).json({
        groupNameList,
      });
    }

    targetGroupId = groupsList[groupIndex].id._serialized;

    res.json({
      message: `Group set to: ${groupsList[groupIndex].name}`,
      groupId: targetGroupId,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error setting group",
      error: error.message,
    });
  }
});

app.get("/set-chat-id/:id", async (req, res) => {
  try {
    const groupName = req.params.id;

    targetGroupId = "91" + groupName + "@c.us";

    res.json({
      message: `Id set to: ${targetGroupId}`,
      groupId: targetGroupId,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error setting group",
      error: error.message,
    });
  }
});

// Endpoint to set target group
app.get("/set-group/:groupName", async (req, res) => {
  try {
    const groupName = req.params.groupName;
    const chats = await client.getChats();

    const groupsList = chats.filter(
      (chat) => chat.id && chat.id.server === "g.us"
    );

    const groupNameList = groupsList.map((groups) => groups.name);

    const groupIndex = groupNameList.indexOf(groupName);

    if (!groupNameList.includes(groupName)) {
      return res.status(404).json({
        groupNameList,
      });
    }

    targetGroupId = groupsList[groupIndex].id._serialized;
    res.json({
      message: `Group set to: ${groupsList[groupIndex].name}`,
      groupId: targetGroupId,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error setting group",
      error: error.message,
    });
  }
});

app.get("/", async (req, res) => {
  res.json({ message: "welcome to whatsapp scheduler" });
});

// Endpoint to trigger immediate message
app.get("/send-message", async (req, res) => {
  const success = await sendWhatsAppMessage();
  if (success) {
    res.json({ message: "Message sent successfully" });
  } else {
    res.status(500).json({ message: "Failed to send message" });
  }
});

app.post("/send-message", async (req, res) => {
  const success = await sendWhatsAppText(req);
  if (success) {
    res.json({ message: "Message sent successfully" });
  } else {
    res.status(500).json({ message: "Failed to send message" });
  }
});

// New endpoint to schedule message for next day midnight
app.get("/schedule-for-tomorrow", async (req, res) => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // Set to midnight

  // Check if current time is between 00:01 and 23:59
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const isValidSchedulingTime = !(currentHour === 0 && currentMinute === 0); // Any time except exactly midnight

  if (!isValidSchedulingTime) {
    return res.status(400).json({
      message:
        "Cannot schedule at exactly midnight. Please try again in a minute.",
    });
  }

  if (!isWorkingDay(tomorrow)) {
    return res.status(400).json({
      message: "Tomorrow is not a working day. No message will be scheduled.",
    });
  }

  scheduledMessageData = {
    isScheduled: true,
    targetDate: tomorrow,
  };

  res.json({
    message: "Message scheduled for tomorrow at midnight",
    scheduledDate: tomorrow.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
  });
});

// Endpoint to check schedule status
app.get("/schedule-status", (req, res) => {
  if (!scheduledMessageData.isScheduled) {
    res.json({ message: "No message currently scheduled" });
  } else {
    res.json({
      message: "Message scheduled",
      scheduledFor: scheduledMessageData.targetDate.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      }),
    });
  }
});

// Start WhatsApp client and server
client.initialize();

app.listen(3000, () => {
  console.log(`Server running on port ${3000}`);
});
