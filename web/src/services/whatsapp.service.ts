import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

interface ConnectResult {
  ok: true;
  displayPhone: string;
}

const connectWhatsappCallable = httpsCallable<
  { phoneNumberId: string; businessAccountId: string; accessToken: string },
  ConnectResult
>(functions, 'connectWhatsapp');

/** The manual form: a merchant pastes credentials they already have from Meta Business Suite. */
export async function connectWhatsapp(input: {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}): Promise<ConnectResult> {
  const result = await connectWhatsappCallable(input);
  return result.data;
}

const exchangeEmbeddedSignupCallable = httpsCallable<
  { code: string; phoneNumberId: string; businessAccountId: string },
  ConnectResult
>(functions, 'exchangeEmbeddedSignupCode');

/** The one-click flow: what Meta's Embedded Signup popup hands back gets exchanged for a real connection. */
export async function exchangeEmbeddedSignupCode(input: {
  code: string;
  phoneNumberId: string;
  businessAccountId: string;
}): Promise<ConnectResult> {
  const result = await exchangeEmbeddedSignupCallable(input);
  return result.data;
}

const disconnectWhatsappCallable = httpsCallable<void, { ok: true }>(functions, 'disconnectWhatsapp');

export async function disconnectWhatsapp(): Promise<void> {
  await disconnectWhatsappCallable();
}

const sendTestMessageCallable = httpsCallable<{ to: string }, { ok: true }>(functions, 'sendTestMessage');

export async function sendTestMessage(to: string): Promise<void> {
  await sendTestMessageCallable({ to });
}
