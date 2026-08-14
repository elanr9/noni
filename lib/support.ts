import { Alert, Linking } from 'react-native';

/** Public support inbox for Noni. */
export const SUPPORT_EMAIL = 'founders@usenoni.app';

/** Public support SMS number for Noni (US). */
export const SUPPORT_PHONE = '5613995015';
export const SUPPORT_PHONE_E164 = '+15613995015';

export async function openSupportEmail(subject?: string): Promise<void> {
  const query = subject
    ? `?subject=${encodeURIComponent(subject)}`
    : '';
  await Linking.openURL(`mailto:${SUPPORT_EMAIL}${query}`);
}

export async function openSupportText(body?: string): Promise<void> {
  const query = body ? `?body=${encodeURIComponent(body)}` : '';
  await Linking.openURL(`sms:${SUPPORT_PHONE_E164}${query}`);
}

/** Email or text support. */
export function contactSupport(
  subject = 'Noni support',
  userName?: string | null,
): void {
  const name = userName?.trim() || 'a Noni user';
  Alert.alert('Contact support', 'Email or text the founders.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Email',
      onPress: () => {
        void openSupportEmail(subject);
      },
    },
    {
      text: 'Text',
      onPress: () => {
        void openSupportText(`Hi! I'm ${name}, I have a question about Noni`);
      },
    },
  ]);
}
