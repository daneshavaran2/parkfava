// Server-only. Sends the OTP code through whichever Iranian SMS panel is
// configured via env vars:
//   SMS_PROVIDER=kavenegar|melipayamak|ghasedak
//   SMS_API_KEY=<panel api key>
//   SMS_SENDER_LINE=<panel sender line, if the provider needs one>
//
// No panel is wired up yet (no account/API key exists as of writing this),
// so none of these code paths have been exercised against a real provider —
// double-check the endpoint/payload shape against your panel's current docs
// once you have credentials, before flipping MFA_ENFORCED=true (see
// src/lib/auth/middleware.ts). Until SMS_PROVIDER/SMS_API_KEY are set, this
// throws instead of pretending a code was sent.
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER;
  const apiKey = process.env.SMS_API_KEY;
  const text = `کد تایید اطلس شرکت‌های پارک فاوا: ${code}`;

  if (!provider || !apiKey) {
    console.error(`[sms] SMS_PROVIDER/SMS_API_KEY not set — OTP for ${phone} was NOT sent (code: ${code})`);
    throw new Error("SMS_NOT_CONFIGURED");
  }

  switch (provider) {
    case "kavenegar": {
      const res = await fetch(`https://api.kavenegar.com/v1/${apiKey}/sms/send.json`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          receptor: phone,
          message: text,
          ...(process.env.SMS_SENDER_LINE ? { sender: process.env.SMS_SENDER_LINE } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Kavenegar SMS failed: ${res.status}`);
      return;
    }
    case "melipayamak": {
      const res = await fetch(`https://console.melipayamak.com/api/send/simple/${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.SMS_SENDER_LINE ?? "", to: phone, text }),
      });
      if (!res.ok) throw new Error(`Melipayamak SMS failed: ${res.status}`);
      return;
    }
    case "ghasedak": {
      const res = await fetch("https://api.ghasedak.me/v2/sms/send/simple", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", apikey: apiKey },
        body: new URLSearchParams({
          message: text,
          receptor: phone,
          linenumber: process.env.SMS_SENDER_LINE ?? "",
        }),
      });
      if (!res.ok) throw new Error(`Ghasedak SMS failed: ${res.status}`);
      return;
    }
    default:
      throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
  }
}
