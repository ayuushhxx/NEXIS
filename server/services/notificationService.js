/**
 * FILE: server/services/notificationService.js
 * PURPOSE: Provider-agnostic abstraction for sending check-in messages to trainees.
 *          Currently a STUB — logs structured messages to the console.
 * DEPENDENCIES: None
 * USED BY: server/routes/outcomes.js
 *
 * ── SWAPPABLE PROVIDER INTERFACE ──────────────────────────────────────────────
 * To connect a real WhatsApp Business API or SMS gateway (Twilio / Gupshup / MSG91):
 *   1. Create a new provider file, e.g. server/services/providers/gupshupProvider.js
 *   2. Export an object with a single async `send(trainee, checkin)` method that
 *      calls the gateway SDK/REST API and returns { messageId: string }.
 *   3. Replace the `activeProvider` assignment below with your new provider.
 *
 * Calling code (outcomes.js) only ever calls `sendCheckinMessage()` — it does NOT
 * need to change when the underlying provider is swapped.  This is intentional.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ── Message Templates ─────────────────────────────────────────────────────────
// Simple bilingual stubs.  A real integration would use approved WhatsApp
// template names registered with Meta Business Suite.

const TEMPLATES = {
  en: {
    '90_DAY': (name) =>
      `Hi ${name}! 👋 It's been 90 days since you completed your course. How is your job search going? Reply with your current status.`,
    '180_DAY': (name) =>
      `Hi ${name}! 6 months have passed since your training. We'd love to hear about your employment status — please share an update!`,
    '365_DAY': (name) =>
      `Hi ${name}! 🎉 It's been a year since you trained with us! How are things? Please let us know your current employment status.`,
    SELF_INITIATED: (name) =>
      `Hi ${name}! Your status update has been recorded. Thank you for keeping us informed.`,
  },
  hi: {
    '90_DAY': (name) =>
      `नमस्ते ${name}! 👋 आपके कोर्स को पूरे हुए 90 दिन हो गए हैं। आपकी नौकरी की तलाश कैसी चल रही है? कृपया अपना स्टेटस बताएं।`,
    '180_DAY': (name) =>
      `नमस्ते ${name}! आपकी ट्रेनिंग को 6 महीने हो गए हैं। हम आपकी रोजगार स्थिति जानना चाहेंगे — कृपया अपडेट दें!`,
    '365_DAY': (name) =>
      `नमस्ते ${name}! 🎉 आपकी ट्रेनिंग को एक साल हो गया! अब आप कैसे हैं? कृपया अपनी वर्तमान रोजगार स्थिति बताएं।`,
    SELF_INITIATED: (name) =>
      `नमस्ते ${name}! आपका स्टेटस अपडेट रिकॉर्ड किया गया है। हमें सूचित करने के लिए धन्यवाद।`,
  },
}

function getTemplate(lang, checkinType) {
  const langKey = TEMPLATES[lang] ? lang : 'en'
  const typeKey = checkinType in TEMPLATES.en ? checkinType : 'SELF_INITIATED'
  return TEMPLATES[langKey][typeKey]
}

// ── Stub Provider ─────────────────────────────────────────────────────────────
// Replace this object with a real provider when credentials are available.
// The interface contract: { send(trainee, checkin): Promise<{ messageId: string }> }

const stubProvider = {
  name: 'console-stub',

  async send(trainee, checkin) {
    const lang = trainee.preferredLanguage || 'en'
    const templateFn = getTemplate(lang, checkin.checkinType)
    const messageBody = templateFn(trainee.name)

    // Formatted like a real WhatsApp Business API log entry so it's easy to
    // recognise what a production message would look like.
    console.log(
      [
        `[notificationService:${this.name}] ── OUTBOUND MESSAGE ──────────────────`,
        `  Provider     : WhatsApp Business API (stub — not sent)`,
        `  To           : ${trainee.phoneNumber} (${trainee.name})`,
        `  Language     : ${lang}`,
        `  Template     : forge_checkin_${checkin.checkinType.toLowerCase()}`,
        `  CheckIn ID   : ${checkin.id}`,
        `  CheckIn Type : ${checkin.checkinType}`,
        `  Scheduled For: ${checkin.scheduledFor ?? 'immediate'}`,
        `  Message Body : ${messageBody}`,
        `─────────────────────────────────────────────────────────────────────────`,
      ].join('\n')
    )

    // Return a mock message ID shaped like Gupshup/MSG91 responses so
    // the calling code can store it for later real-provider compat.
    return {
      messageId: `stub_${Date.now()}_${checkin.id.slice(-6)}`,
      provider: this.name,
      simulated: true,
    }
  },

  async sendEmployerVerification(employerContact, verificationLink, details = {}) {
    const employerName = details.employerNameClaimed || 'Employer'
    const traineeName = details.traineeName || 'Trainee'
    const domainFlag = details.contactDomainFlag ? ' [LOWER CONFIDENCE: Free consumer domain]' : ''

    console.log(
      [
        `[notificationService:${this.name}] ── OUTBOUND EMPLOYER VERIFICATION ──`,
        `  Provider     : Email Service (stub — not sent)`,
        `  To           : ${employerContact}${domainFlag}`,
        `  Trainee      : ${traineeName}`,
        `  Employer     : ${employerName}`,
        `  Verify Link  : ${verificationLink}`,
        `  Expires      : 30 days`,
        `─────────────────────────────────────────────────────────────────────────`,
      ].join('\n')
    )

    return {
      messageId: `stub_emp_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.name,
      simulated: true,
    }
  },
}

// ── Active provider ───────────────────────────────────────────────────────────
// SWAP THIS to switch providers without touching any calling code.
const activeProvider = stubProvider

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends a check-in notification message to a trainee via the active provider.
 *
 * @param {object} trainee  - Prisma Trainee record ({ id, name, phoneNumber, preferredLanguage })
 * @param {object} checkin  - Prisma OutcomeCheckIn record ({ id, checkinType, scheduledFor, … })
 * @returns {Promise<{ messageId: string, provider: string, simulated?: boolean }>}
 */
export async function sendCheckinMessage(trainee, checkin) {
  return activeProvider.send(trainee, checkin)
}

/**
 * Sends an employer verification request link via email stub.
 *
 * @param {string} employerContact  - Recipient email address
 * @param {string} verificationLink - Verification URL with unique token
 * @param {object} [details]        - Additional metadata (traineeName, employerNameClaimed, contactDomainFlag)
 * @returns {Promise<{ messageId: string, provider: string, simulated?: boolean }>}
 */
export async function sendEmployerVerificationRequest(employerContact, verificationLink, details = {}) {
  return activeProvider.sendEmployerVerification(employerContact, verificationLink, details)
}

