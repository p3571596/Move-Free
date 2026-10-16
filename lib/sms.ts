import twilio from "twilio";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export function normalizeMobile(value: string) {
  if (!value.trim().startsWith("+")) throw new Error("Include the international country code, for example +1.");
  const phone = parsePhoneNumberFromString(value);
  if (!phone?.isValid() || phone.ext) throw new Error("Enter a valid mobile number without an extension.");
  return phone.number;
}

export function smsBody(link: string) {
  return `Move Free invitation: ${link} Verify your email to continue. Expires in 7 days. Reply STOP to opt out.`;
}

export function smsConfiguration() {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_MESSAGING_SERVICE_SID: messagingServiceSid } = process.env;
  if (process.env.PATIENT_SMS_ENABLED !== "true" || !accountSid || !authToken || !messagingServiceSid) return null;
  return { accountSid, authToken, messagingServiceSid };
}

export async function sendSms(to: string, link: string, callback: string) {
  const config = smsConfiguration();
  if (!config) throw new Error("SMS delivery disabled");
  // Synthetic allowlist is mandatory until the separate real-patient release gate is approved.
  if (process.env.PATIENT_SMS_REAL_DELIVERY_APPROVED !== "true" &&
      !process.env.PATIENT_SMS_TEST_NUMBERS?.split(",").map(n => n.trim()).includes(to)) throw new Error("Test recipient required");
  return twilio(config.accountSid, config.authToken, { autoRetry: false, timeout: 10000 }).messages.create({
    to, messagingServiceSid: config.messagingServiceSid, body: smsBody(link), statusCallback: callback,
    provideFeedback: false,
  });
}
