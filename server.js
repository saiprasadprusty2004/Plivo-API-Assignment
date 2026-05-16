require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const plivo = require("plivo");

const app = express();
const PORT = process.env.PORT || 3000;
const flows = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function cleanBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function isE164(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || "").trim());
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function getDigits(req) {
  return String(req.body.Digits || req.query.Digits || "").trim();
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xml(res, body) {
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`);
}

function absoluteUrl(path, params = {}) {
  const base = cleanBaseUrl();
  const url = new URL(path, `${base}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function getFlow(flowId) {
  if (!flowId || !flows.has(flowId)) {
    return {
      associateNumber: process.env.DEFAULT_ASSOCIATE_NUMBER || "",
      language: "en"
    };
  }

  return flows.get(flowId);
}

function cleanupFlows() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [flowId, flow] of flows.entries()) {
    if (flow.createdAt < oneHourAgo) {
      flows.delete(flowId);
    }
  }
}

function otpPrompt(flowId, message) {
  const action = absoluteUrl("/voice/otp", { flowId });
  const spokenMessage = message || "Welcome to InspireWorks. Please enter your four digit OTP.";

  return `<Response>
  <GetDigits action="${escapeXml(action)}" method="POST" numDigits="4" timeout="10" digitTimeout="3" finishOnKey="">
    <Speak>${escapeXml(spokenMessage)}</Speak>
  </GetDigits>
  <Speak>We did not receive your OTP.</Speak>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/answer", { flowId }))}</Redirect>
</Response>`;
}

function languagePrompt(flowId) {
  const action = absoluteUrl("/voice/language", { flowId });

  return `<Response>
  <GetDigits action="${escapeXml(action)}" method="POST" numDigits="1" timeout="10" finishOnKey="">
    <Speak>Authentication successful. For English, press 1. Para espanol, presione 2.</Speak>
  </GetDigits>
  <Speak>We did not receive a language selection.</Speak>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/language-menu", { flowId }))}</Redirect>
</Response>`;
}

function actionPrompt(flowId, language) {
  const action = absoluteUrl("/voice/action", { flowId });
  const prompt =
    language === "es"
      ? "Presione 1 para escuchar un mensaje corto. Presione 2 para conectarse con un asociado."
      : "Press 1 to hear a short audio message. Press 2 to connect to a live associate.";

  return `<Response>
  <GetDigits action="${escapeXml(action)}" method="POST" numDigits="1" timeout="10" finishOnKey="">
    <Speak>${escapeXml(prompt)}</Speak>
  </GetDigits>
  <Speak>We did not receive a selection.</Speak>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/menu", { flowId }))}</Redirect>
</Response>`;
}

app.post("/api/call", async (req, res) => {
  cleanupFlows();

  const missing = [];
  if (!process.env.PLIVO_AUTH_ID) missing.push("PLIVO_AUTH_ID");
  if (!process.env.PLIVO_AUTH_TOKEN) missing.push("PLIVO_AUTH_TOKEN");
  if (!process.env.PLIVO_FROM_NUMBER) missing.push("PLIVO_FROM_NUMBER");
  if (!process.env.PUBLIC_BASE_URL) missing.push("PUBLIC_BASE_URL");
  if (!process.env.CALL_OTP) missing.push("CALL_OTP");

  if (missing.length) {
    return res.status(500).json({
      error: `Missing required environment values: ${missing.join(", ")}`
    });
  }

  if (!/^\d{4}$/.test(process.env.CALL_OTP)) {
    return res.status(500).json({ error: "CALL_OTP must be exactly 4 digits." });
  }

  const destinationNumber = normalizePhone(req.body.destinationNumber);
  const associateNumber = normalizePhone(req.body.associateNumber) || process.env.DEFAULT_ASSOCIATE_NUMBER || "";

  if (!isE164(destinationNumber)) {
    return res.status(400).json({
      error: "Destination number must be in E.164 format, for example +919876543210."
    });
  }

  if (associateNumber && !isE164(associateNumber)) {
    return res.status(400).json({
      error: "Associate number must be in E.164 format, for example +919876543210."
    });
  }

  const flowId = crypto.randomBytes(8).toString("hex");
  flows.set(flowId, {
    destinationNumber,
    associateNumber,
    createdAt: Date.now(),
    language: "en"
  });

  try {
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    const response = await client.calls.create(
      normalizePhone(process.env.PLIVO_FROM_NUMBER),
      destinationNumber,
      absoluteUrl("/voice/answer", { flowId }),
      { answerMethod: "POST" }
    );

    res.json({
      message: "Call started.",
      flowId,
      plivoResponse: response
    });
  } catch (error) {
    flows.delete(flowId);
    res.status(500).json({
      error: error.message || "Plivo call failed."
    });
  }
});

app.get("/api/config-check", (req, res) => {
  const baseUrl = cleanBaseUrl();
  const hasCredentials = Boolean(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN);

  res.json({
    hasCredentials,
    fromNumber: process.env.PLIVO_FROM_NUMBER || "",
    publicBaseUrl: baseUrl,
    answerUrl: baseUrl ? absoluteUrl("/voice/answer", { flowId: "test" }) : "",
    otpConfigured: /^\d{4}$/.test(process.env.CALL_OTP || ""),
    associateNumber: process.env.DEFAULT_ASSOCIATE_NUMBER || ""
  });
});

app.all("/voice/answer", (req, res) => {
  xml(res, otpPrompt(req.query.flowId || req.body.flowId));
});

app.all("/voice/otp", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  const digits = getDigits(req);

  if (digits === process.env.CALL_OTP) {
    return xml(res, languagePrompt(flowId));
  }

  xml(res, otpPrompt(flowId, "That OTP is incorrect. Please enter your four digit OTP again."));
});

app.all("/voice/language", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  const digits = getDigits(req);
  const flow = getFlow(flowId);

  if (digits === "1") {
    flow.language = "en";
    if (flows.has(flowId)) flows.set(flowId, flow);
    return xml(res, actionPrompt(flowId, "en"));
  }

  if (digits === "2") {
    flow.language = "es";
    if (flows.has(flowId)) flows.set(flowId, flow);
    return xml(res, actionPrompt(flowId, "es"));
  }

  xml(res, `<Response>
  <Speak>Invalid language selection.</Speak>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/language-menu", { flowId }))}</Redirect>
</Response>`);
});

app.all("/voice/language-menu", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  xml(res, languagePrompt(flowId));
});

app.all("/voice/menu", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  const flow = getFlow(flowId);
  xml(res, actionPrompt(flowId, flow.language || "en"));
});

app.all("/voice/action", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  const digits = getDigits(req);

  if (digits === "1") {
    return xml(res, `<Response>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/play", { flowId }))}</Redirect>
</Response>`);
  }

  if (digits === "2") {
    return xml(res, `<Response>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/dial", { flowId }))}</Redirect>
</Response>`);
  }

  xml(res, `<Response>
  <Speak>Invalid selection.</Speak>
  <Redirect method="POST">${escapeXml(absoluteUrl("/voice/menu", { flowId }))}</Redirect>
</Response>`);
});

app.all("/voice/play", (req, res) => {
  const audioUrl = process.env.AUDIO_URL;

  if (!audioUrl) {
    return xml(res, `<Response>
  <Speak>This is the short InspireWorks demo message. The audio branch is working.</Speak>
  <Speak>Goodbye.</Speak>
  <Hangup/>
</Response>`);
  }

  xml(res, `<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Speak>Thank you for calling InspireWorks. Goodbye.</Speak>
  <Hangup/>
</Response>`);
});

app.all("/voice/dial", (req, res) => {
  const flowId = req.query.flowId || req.body.flowId;
  const flow = getFlow(flowId);
  const associateNumber = normalizePhone(flow.associateNumber || process.env.DEFAULT_ASSOCIATE_NUMBER);

  if (!isE164(associateNumber)) {
    return xml(res, `<Response>
  <Speak>No valid associate number is configured. Goodbye.</Speak>
  <Hangup/>
</Response>`);
  }

  xml(res, `<Response>
  <Speak>Please wait while we connect you to an associate.</Speak>
  <Dial callerId="${escapeXml(normalizePhone(process.env.PLIVO_FROM_NUMBER))}">
    <Number>${escapeXml(associateNumber)}</Number>
  </Dial>
  <Speak>The associate was not available. Goodbye.</Speak>
  <Hangup/>
</Response>`);
});

app.listen(PORT, () => {
  console.log(`Plivo IVR demo running at http://localhost:${PORT}`);
});
