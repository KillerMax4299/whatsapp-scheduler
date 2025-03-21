const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const electron = require("wwebjs-electron");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const dotenv = require("dotenv");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const os = require('os');

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address;
            }
        }
    }
    return 'No network connection';
}

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const port = process.env.PORT || 3000;

// Swagger setup
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "WhatsApp Scheduler API",
      version: "1.0.0",
      description: "API for scheduling WhatsApp messages",
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
      {
        url: `http://${getLocalIp()}:${port}`,
      },
    ],
  },
  apis: ["./index.js"], // Path to the API docs
};

const specs = swaggerJsdoc(options);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: electron,
  // No need to specify webVersion
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
    await client.sendMessage(targetGroupId, "1st trip");
    console.log("Message sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
}

// async function sendWhatsAppText(req) {
//   if (!targetGroupId) {
//     console.error("No group ID set. Please set group ID first.");
//     return false;
//   }

//   try {
//     await client.sendMessage(targetGroupId, req.body.message);
//     console.log("Message sent successfully");
//     return true;
//   } catch (error) {
//     console.error("Error sending message:", error);
//     return false;
//   }
// }

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



/**
 * @swagger
 * /set-group/{groupName}:
 *   get:
 *     summary: Set the target group by name
 *     parameters:
 *       - in: path
 *         name: groupName
 *         required: true
 *         schema:
 *           type: string
 *           example: "Office Car"
 *         description: The name of the group to set as target
 *     responses:
 *       200:
 *         description: Group set successfully
 *       404:
 *         description: Group not found
 *       500:
 *         description: Error setting group
 */
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

/**
 * @swagger
 * /:
 *   get:
 *     summary: Welcome message
 *     responses:
 *       200:
 *         description: Welcome message
 */
app.get("/", async (req, res) => {
  res.json({
    message: "welcome to whatsapp scheduler",
    local: `http://localhost:${port}/api-docs/`,
    ipv4: `http://${getLocalIp()}:${port}/api-docs/`,
  });
});



/**
 * @swagger
 * /schedule-for-tomorrow:
 *   get:
 *     summary: Schedule a message for tomorrow at midnight
 *     responses:
 *       200:
 *         description: Message scheduled successfully
 *       400:
 *         description: Cannot schedule at midnight or tomorrow is not a working day
 */
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

/**
 * @swagger
 * /schedule-status:
 *   get:
 *     summary: Check the status of the scheduled message
 *     responses:
 *       200:
 *         description: Schedule status retrieved successfully
 */
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

// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${port}`);
  // console.log(`Access from other devices using your computer's IP address`);
});
