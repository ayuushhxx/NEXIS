/**
 * FILE: server/routes/otpAuth.js
 * PURPOSE: Endpoints for triggering and verifying SMS OTPs.
 */

import { Router } from 'express';
import { sendOtp, verifyOtp } from '../services/otpService.js';
import crypto from 'crypto';

const router = Router();

// A simple symmetric signature for OTP verification tokens so we don't need JWT
const OTP_TOKEN_SECRET = process.env.GITHUB_CLIENT_SECRET || 'dev_otp_fallback_secret_32bytes';

/**
 * Creates a signed token proving the phone number was verified. Valid for 15 mins.
 */
export function signOtpVerificationToken(phoneNumber) {
  const expiry = Date.now() + 15 * 60 * 1000; // 15 mins
  const payload = `${phoneNumber}:${expiry}`;
  const signature = crypto.createHmac('sha256', OTP_TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

/**
 * Validates the signed token and returns the phone number if valid.
 */
export function validateOtpVerificationToken(tokenBase64) {
  try {
    if (!tokenBase64) return null;
    const token = Buffer.from(tokenBase64, 'base64').toString('utf-8');
    const [phoneNumber, expiryStr, signature] = token.split(':');
    if (!phoneNumber || !expiryStr || !signature) return null;
    
    if (Date.now() > parseInt(expiryStr, 10)) {
      return null; // Expired
    }
    
    const expectedSignature = crypto.createHmac('sha256', OTP_TOKEN_SECRET).update(`${phoneNumber}:${expiryStr}`).digest('hex');
    if (signature !== expectedSignature) return null;
    
    return phoneNumber;
  } catch (err) {
    return null;
  }
}

// ── POST /api/otp/send ───────────────────────────────────────────────────────
router.post('/otp/send', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber is required' });
  }

  // Basic rate limiting could be added here (e.g., checking last OTP request time in DB)

  try {
    const result = await sendOtp(phoneNumber);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/otp/verify ─────────────────────────────────────────────────────
router.post('/otp/verify', async (req, res) => {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) {
    return res.status(400).json({ error: 'phoneNumber and code are required' });
  }

  try {
    await verifyOtp(phoneNumber, code);
    
    // Generate a short-lived token to prove verification
    const verificationToken = signOtpVerificationToken(phoneNumber);
    
    res.json({ 
      success: true, 
      message: 'Phone number verified',
      verificationToken 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
