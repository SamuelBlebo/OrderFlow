import { useEffect, useRef, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import { Badge, Button, Card, CardBody, Input } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import {
  connectWhatsapp,
  disconnectWhatsapp,
  exchangeEmbeddedSignupCode,
  sendTestMessage,
} from '@/services';
import { env } from '@/utils/env';
import { toMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';

const embeddedSignupConfigured = Boolean(env.meta.appId && env.meta.configId);

export function WhatsAppPage() {
  const { org } = useAuth();
  const whatsapp = org!.whatsapp;

  return (
    <>
      <PageHeader title="WhatsApp" description="The number this business takes orders on." />
      <Card>
        <CardBody className="space-y-5 p-5">
          {whatsapp.connected ? (
            <ConnectedState phone={whatsapp.displayPhoneNumber} verifiedName={whatsapp.verifiedName} connectedAt={whatsapp.connectedAt} />
          ) : (
            <ConnectFlow />
          )}
        </CardBody>
      </Card>
    </>
  );
}

function ConnectedState({
  phone,
  verifiedName,
  connectedAt,
}: {
  phone: string | null;
  verifiedName: string | null;
  connectedAt: Timestamp | null;
}) {
  const toast = useToast();
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const sendTest = async () => {
    if (!testPhone.trim()) return;
    setTesting(true);
    try {
      await sendTestMessage(testPhone.trim());
      toast.success('Test message sent.');
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectWhatsapp();
      toast.success('WhatsApp disconnected.');
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-brand/10 text-brand">Connected</Badge>
            {verifiedName && <span className="text-sm font-semibold text-ink">{verifiedName}</span>}
          </div>
          <p className="mt-1 text-lg font-bold text-ink">{phone}</p>
          <p className="text-xs text-muted">Connected {formatDate(connectedAt)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line p-3">
        <p className="text-xs font-semibold text-muted">Send a test message</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Test phone number"
            placeholder="+233 24 000 0000"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <Button type="button" loading={testing} disabled={!testPhone.trim()} onClick={sendTest}>
            Send
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger/5 p-3">
        <div>
          <p className="text-sm font-semibold text-ink">Disconnect this number</p>
          <p className="text-xs text-muted">Customers won't be able to order until you connect again.</p>
        </div>
        {confirmDisconnect ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="sm" loading={disconnecting} onClick={disconnect}>
              Confirm
            </Button>
          </div>
        ) : (
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDisconnect(true)}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectFlow() {
  const [manual, setManual] = useState(!embeddedSignupConfigured);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Connect the WhatsApp Business number your customers will message.</p>

      {embeddedSignupConfigured && !manual && (
        <div className="space-y-3">
          <EmbeddedSignupButton />
          <button type="button" onClick={() => setManual(true)} className="text-xs text-muted underline">
            I'll paste my credentials manually instead
          </button>
        </div>
      )}

      {manual && (
        <div className="space-y-3">
          <ManualConnectForm />
          {embeddedSignupConfigured && (
            <button type="button" onClick={() => setManual(false)} className="text-xs text-muted underline">
              Use one-click connect instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ManualConnectForm() {
  const toast = useToast();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phoneNumberId.trim() && businessAccountId.trim() && accessToken.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await connectWhatsapp({
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim(),
        accessToken: accessToken.trim(),
      });
      toast.success('WhatsApp connected.');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <p className="text-xs font-semibold text-muted">
        From Meta Business Suite &gt; WhatsApp Accounts, or your System User's API setup.
      </p>
      <Input label="Phone number ID" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
      <Input label="WhatsApp Business Account ID" value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)} />
      <Input
        label="Access token"
        type="password"
        hint="A permanent System User token, not the 24-hour temporary one."
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
      />
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      <Button type="button" fullWidth loading={busy} disabled={!canSubmit} onClick={submit}>
        Connect
      </Button>
    </div>
  );
}

/* ------------------------- Meta Embedded Signup SDK ------------------------ */

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
}

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: { config_id: string; response_type: string; override_default_response_type: boolean; extras: Record<string, unknown> },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/** Loads Meta's JS SDK exactly once, however many components ask for it. */
function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

interface EmbeddedSignupPayload {
  phoneNumberId: string;
  businessAccountId: string;
}

/**
 * Meta's flow hands back two things, from two different places: the login
 * `code` from FB.login's own callback, and the phone/WABA id the merchant
 * actually picked (or created) inside the popup, via a postMessage event.
 * The exchange can't run until both have arrived.
 */
function useEmbeddedSignupPayload(onReady: (code: string, payload: EmbeddedSignupPayload) => void) {
  const codeRef = useRef<string | null>(null);
  const payloadRef = useRef<EmbeddedSignupPayload | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          event?: string;
          data?: { phone_number_id?: string; waba_id?: string };
        };
        if (data.type !== 'WA_EMBEDDED_SIGNUP' || data.event !== 'FINISH') return;
        const phoneNumberId = data.data?.phone_number_id;
        const businessAccountId = data.data?.waba_id;
        if (!phoneNumberId || !businessAccountId) return;
        payloadRef.current = { phoneNumberId, businessAccountId };
        if (codeRef.current) onReady(codeRef.current, payloadRef.current);
      } catch {
        // Not JSON, or not the message we're listening for — ignore.
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onReady]);

  return (code: string) => {
    codeRef.current = code;
    if (payloadRef.current) onReady(code, payloadRef.current);
  };
}

function EmbeddedSignupButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const finish = async (code: string, payload: EmbeddedSignupPayload) => {
    setBusy(true);
    try {
      await exchangeEmbeddedSignupCode({ code, ...payload });
      toast.success('WhatsApp connected.');
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setCode = useEmbeddedSignupPayload(finish);

  const start = async () => {
    setBusy(true);
    try {
      await loadFacebookSdk(env.meta.appId);
      window.FB?.login(
        (response) => {
          const code = response.authResponse?.code;
          if (code) setCode(code);
          else setBusy(false);
        },
        {
          config_id: env.meta.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: '3' },
        },
      );
    } catch (err) {
      toast.error(toMessage(err));
      setBusy(false);
    }
  };

  return (
    <Button type="button" fullWidth loading={busy} onClick={start}>
      Connect with Facebook
    </Button>
  );
}
