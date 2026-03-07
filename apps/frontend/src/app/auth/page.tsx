'use client';

import Link from 'next/link';
import { SubmitButton } from '@/components/ui/submit-button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useState, useEffect, Suspense, lazy, useRef, useCallback, useActionState } from 'react';
import { signUp, verifyOtp, requestAccess } from './actions';
import { useSearchParams, useRouter } from 'next/navigation';
import { Mail, MailCheck, Clock, ExternalLink, ChevronRight } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { useAuth } from '@/components/AuthProvider';
import { useAuthMethodTracking } from '@/stores/auth-tracking';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { ReferralCodeDialog } from '@/components/referrals/referral-code-dialog';
import { isElectron, getAuthOrigin } from '@/lib/utils/is-electron';
import { trackSendAuthLink } from '@/lib/analytics/gtm';
import { backendApi } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperBackground } from '@/components/ui/wallpaper-background';
import { cn } from '@/lib/utils';

// Lazy load heavy components
const GoogleSignIn = lazy(() => import('@/components/GoogleSignIn'));

/* ─── Shared helpers ────────────────────────────────────────────────────── */

const SYMBOL = "M25.5614 24.916H29.8268C29.8268 19.6306 26.9378 15.0039 22.6171 12.4587C26.9377 9.91355 29.8267 5.28685 29.8267 0.00146484H25.5613C25.5613 5.00287 21.8906 9.18692 17.0654 10.1679V0.00146484H12.8005V10.1679C7.9526 9.20401 4.3046 5.0186 4.3046 0.00146484H0.0391572C0.0391572 5.28685 2.92822 9.91355 7.24884 12.4587C2.92818 15.0039 0.0390625 19.6306 0.0390625 24.916H4.30451C4.30451 19.8989 7.95259 15.7135 12.8005 14.7496V24.9206H17.0654V14.7496C21.9133 15.7134 25.5614 19.8989 25.5614 24.916Z";

/* ─── Live clock ────────────────────────────────────────────────────────── */

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const date = now.getDate();
  const h = now.getHours() % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, '0');
  return (
    <div className="flex flex-col items-center select-none pointer-events-none">
      <p className="text-foreground/35 text-[13px] font-light tracking-widest">
        {day} {month} {date}
      </p>
      <p
        className="text-foreground/80 text-[80px] sm:text-[104px] font-extralight leading-none -tracking-[0.02em]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {h}:{m}
      </p>
    </div>
  );
}

/* ─── Email provider helper ─────────────────────────────────────────────── */

function getEmailProviderInfo(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  const isMobileDevice = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const providers: { [key: string]: { name: string; webUrl: string; mobileUrl: string } } = {
    'gmail.com': { name: 'Gmail', webUrl: 'https://mail.google.com', mobileUrl: 'googlegmail://' },
    'googlemail.com': { name: 'Gmail', webUrl: 'https://mail.google.com', mobileUrl: 'googlegmail://' },
    'outlook.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
    'hotmail.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
    'live.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
    'msn.com': { name: 'Outlook', webUrl: 'https://outlook.live.com', mobileUrl: 'ms-outlook://' },
    'yahoo.com': { name: 'Yahoo Mail', webUrl: 'https://mail.yahoo.com', mobileUrl: 'ymail://' },
    'icloud.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
    'me.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
    'mac.com': { name: 'Mail', webUrl: 'https://www.icloud.com/mail', mobileUrl: 'message://' },
    'protonmail.com': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
    'proton.me': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
    'pm.me': { name: 'ProtonMail', webUrl: 'https://mail.proton.me', mobileUrl: 'protonmail://' },
  };
  const provider = providers[domain];
  if (!provider) return null;
  return { name: provider.name, url: isMobileDevice ? provider.mobileUrl : provider.webUrl };
}

/* ─── Cloud auth main content ───────────────────────────────────────────── */

type AuthPhase = 'lock' | 'form';

function AccessRequestForm({ email, onSubmitted, onBack }: { email: string; onSubmitted: () => void; onBack: () => void }) {
  const handleRequestAccess = async (_prev: any, formData: FormData) => {
    formData.set('email', email);
    const result = await requestAccess(_prev, formData);
    if (result && typeof result === 'object' && 'success' in result && result.success) {
      onSubmitted();
    }
    return result || {};
  };

  return (
    <div className="bg-background/75 dark:bg-background/70 backdrop-blur-2xl border border-foreground/[0.08] rounded-2xl p-7">
      <div className="flex flex-col items-center mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.06] border border-foreground/[0.08] mb-3">
          <Mail className="h-4.5 w-4.5 text-foreground/50" />
        </div>
        <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
          Join the waitlist
        </h1>
        <p className="text-[13px] text-foreground/40 mt-1 text-center">
          We&apos;re not accepting new signups right now.
        </p>
      </div>

      <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl px-3 py-2.5 mb-4">
        <p className="text-[11px] text-foreground/35 mb-0.5">Requesting for</p>
        <p className="text-[14px] text-foreground/80 font-medium">{email}</p>
      </div>

      <form className="space-y-3">
        <Input
          name="company"
          placeholder="Company (optional)"
          className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl"
        />
        <textarea
          name="useCase"
          placeholder="What will you build with Kortix?"
          rows={3}
          className="w-full rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] text-[15px] text-foreground/80 placeholder:text-foreground/30 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/15 transition-colors"
        />
        <SubmitButton formAction={handleRequestAccess} className="w-full h-11 text-sm rounded-xl shadow-none" pendingText="Submitting...">
          Request Access
        </SubmitButton>
      </form>

      <div className="flex justify-center mt-4">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-foreground/25 hover:text-foreground/45 transition-colors"
        >
          &larr; Back to sign in
        </button>
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const mode = searchParams.get('mode');
  const returnUrl = searchParams.get('returnUrl') || searchParams.get('redirect');
  const message = searchParams.get('message');
  const isExpired = searchParams.get('expired') === 'true';
  const expiredEmail = searchParams.get('email') || '';
  const referralCodeParam = searchParams.get('ref') || '';
  const t = useTranslations('auth');

  const [phase, setPhase] = useState<AuthPhase>('lock');
  const [referralCode, setReferralCode] = useState(referralCodeParam);
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { wasLastMethod: wasEmailLastMethod, markAsUsed: markEmailAsUsed } = useAuthMethodTracking('email');

  const isSuccessMessage =
    message &&
    (message.includes('Check your email') ||
      message.includes('Account created') ||
      message.includes('success'));

  const [registrationSuccess, setRegistrationSuccess] = useState(!!isSuccessMessage);
  const [registrationEmail, setRegistrationEmail] = useState('');

  const [signupClosed, setSignupClosed] = useState(false);
  const [signupClosedEmail, setSignupClosedEmail] = useState('');
  const [accessRequestSubmitted, setAccessRequestSubmitted] = useState(false);

  const [linkExpired, setLinkExpired] = useState(isExpired);
  const [expiredEmailState, setExpiredEmailState] = useState(expiredEmail);
  const [resendEmail, setResendEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newCodeSent, setNewCodeSent] = useState(false);
  const [autoSendingCode, setAutoSendingCode] = useState(false);
  const [autoSendError, setAutoSendError] = useState(false);
  const autoSendAttempted = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(returnUrl || '/dashboard');
    }
  }, [user, isLoading, router, returnUrl]);

  // If coming from an expired link, skip straight to form phase
  useEffect(() => {
    if (isExpired) {
      setLinkExpired(true);
      setPhase('form');
      if (expiredEmail) setExpiredEmailState(expiredEmail);
    }
  }, [isExpired, expiredEmail]);

  useEffect(() => {
    if (isSuccessMessage) setRegistrationSuccess(true);
  }, [isSuccessMessage]);

  // Auto-send new OTP code when link expires
  useEffect(() => {
    const autoSendNewCode = async () => {
      if (!isExpired || !expiredEmail || autoSendAttempted.current || isLoading || user) return;
      autoSendAttempted.current = true;
      setAutoSendingCode(true);
      try {
        const response = await backendApi.post('/auth/send-otp', { email: expiredEmail });
        if (response.success) {
          setNewCodeSent(true);
          setAutoSendError(false);
        } else {
          setAutoSendError(true);
        }
      } catch {
        setAutoSendError(true);
      } finally {
        setAutoSendingCode(false);
      }
    };
    autoSendNewCode();
  }, [isExpired, expiredEmail, isLoading, user]);

  // Keyboard controls: Enter/Space opens form, Escape closes it
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === 'lock' && (e.key === 'Enter' || e.key === ' ')) {
        setPhase('form');
      }
      if (phase === 'form' && e.key === 'Escape') {
        setPhase('lock');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  const handleAuth = async (prevState: unknown, formData: FormData) => {
    trackSendAuthLink();
    markEmailAsUsed();
    const email = formData.get('email') as string;
    setRegistrationEmail(email);
    const finalReturnUrl = returnUrl || '/dashboard';
    formData.append('returnUrl', finalReturnUrl);
    formData.append('origin', isElectron() ? getAuthOrigin() : window.location.origin);
    formData.append('acceptedTerms', acceptedTerms.toString());
    if (isElectron()) formData.append('isDesktopApp', 'true');
    const result = await signUp(prevState, formData);
    if (result && typeof result === 'object') {
      if ('signupClosed' in result && result.signupClosed) {
        const email = formData.get('email') as string;
        setSignupClosedEmail(email?.trim().toLowerCase() || '');
        setSignupClosed(true);
        return {};
      }
      if ('success' in result && result.success) {
        if ('email' in result && result.email) {
          setRegistrationEmail(result.email as string);
          setRegistrationSuccess(true);
          return result;
        }
      }
      if ('message' in result) {
        toast.error(t('signUpFailed'), { description: result.message as string, duration: 5000 });
        return {};
      }
    }
    return result;
  };

  const handleVerifyOtp = async (prevState: unknown, formData: FormData) => {
    const email = expiredEmailState || formData.get('email') as string;
    if (!email) { toast.error(t('pleaseEnterValidEmail')); return {}; }
    formData.set('email', email);
    formData.set('token', otpCode);
    formData.set('returnUrl', returnUrl || '/dashboard');
    const result = await verifyOtp(prevState, formData);
    if (result && typeof result === 'object') {
      if ('message' in result) {
        toast.error('Verification failed', { description: result.message as string, duration: 5000 });
        return {};
      }
      if ('success' in result && result.success) {
        const redirectTo = (result as { redirectTo?: string }).redirectTo || '/dashboard';
        const authEvent = (result as { authEvent?: string }).authEvent || 'login';
        const authMethod = (result as { authMethod?: string }).authMethod || 'email_otp';
        window.location.href = `${redirectTo}?auth_event=${authEvent}&auth_method=${authMethod}`;
        return result;
      }
    }
    return result;
  };

  const handleSendOtpCode = async (prevState: unknown, formData: FormData) => {
    trackSendAuthLink();
    markEmailAsUsed();
    const email = expiredEmailState || formData.get('email') as string;
    if (!email) { toast.error(t('pleaseEnterValidEmail')); return {}; }
    try {
      const response = await backendApi.post('/auth/send-otp', { email });
      if (response.success) {
        setRegistrationEmail(email);
        setExpiredEmailState(email);
        setNewCodeSent(true);
        setOtpCode('');
        setAutoSendError(false);
        return { success: true };
      } else {
        toast.error('Failed to send code', { description: response.error?.message || 'Failed to send verification code', duration: 5000 });
        return {};
      }
    } catch (error: unknown) {
      toast.error('Failed to send code', { description: error instanceof Error ? error.message : 'An error occurred', duration: 5000 });
      return {};
    }
  };

  if (isLoading || user) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <KortixLoader size="medium" />
      </div>
    );
  }

  /* ── Registration success ── */
  if (registrationSuccess) {
    const provider = registrationEmail ? getEmailProviderInfo(registrationEmail) : null;
    return (
      <div className="fixed inset-0">
        <WallpaperBackground />
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 gap-6">
          <KortixLogo size={28} />
          <h1 className="text-[36px] font-extralight tracking-tight text-foreground/80 leading-none">
            {t('checkYourEmail')}
          </h1>
          <p className="text-[15px] text-foreground/50 text-center">
            We sent a magic link to{' '}
            <span className="text-foreground/80 font-medium">{registrationEmail}</span>
          </p>
          <div className="flex flex-col gap-3 w-full max-w-[320px]">
            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-foreground/[0.08] hover:bg-foreground/[0.12] border border-foreground/10 text-sm text-foreground/70 hover:text-foreground/90 transition-colors backdrop-blur-sm"
              >
                <ExternalLink className="size-3.5" />
                Open {provider.name}
              </a>
            )}
            <button
              onClick={() => setRegistrationSuccess(false)}
              className="text-[12px] text-foreground/30 hover:text-foreground/50 transition-colors text-center"
            >
              {t('didntReceiveEmail')} <span className="underline underline-offset-2">{t('resend')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Signup closed — access request form ── */
  if (signupClosed) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <WallpaperBackground />

        <motion.div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]" />

          <motion.div
            className="relative z-10 w-full max-w-[360px] mx-4"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {accessRequestSubmitted ? (
              <div className="bg-background/75 dark:bg-background/70 backdrop-blur-2xl border border-foreground/[0.08] rounded-2xl p-7">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <MailCheck className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
                      You&apos;re on the list
                    </h1>
                    <p className="text-[13px] text-foreground/40 mt-1.5 max-w-[260px] mx-auto">
                      We&apos;ll email <span className="text-foreground/60 font-medium">{signupClosedEmail}</span> when your access is ready.
                    </p>
                  </div>
                  <button
                    onClick={() => { setSignupClosed(false); setAccessRequestSubmitted(false); }}
                    className="text-[11px] text-foreground/25 hover:text-foreground/45 transition-colors mt-1"
                  >
                    &larr; Back to sign in
                  </button>
                </div>
              </div>
            ) : (
              <AccessRequestForm
                email={signupClosedEmail}
                onSubmitted={() => setAccessRequestSubmitted(true)}
                onBack={() => setSignupClosed(false)}
              />
            )}
          </motion.div>
        </motion.div>
      </div>
    );
  }

  /* ── Expired link / OTP flow ── */
  if (linkExpired) {
    const emailForProvider = expiredEmailState || resendEmail;
    const provider = emailForProvider ? getEmailProviderInfo(emailForProvider) : null;
    const otpDigits = otpCode.padEnd(6, '').split('');

    return (
      <div className="fixed inset-0">
        <WallpaperBackground />
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 gap-6">
          {autoSendingCode ? (
            <div className="flex flex-col items-center gap-4">
              <KortixLogo size={28} />
              <KortixLoader size="medium" />
              <p className="text-[15px] text-foreground/50">Sending a fresh code…</p>
            </div>
          ) : newCodeSent ? (
            <div className="flex flex-col items-center gap-6 w-full max-w-[340px]">
              <KortixLogo size={28} />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <MailCheck className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-[28px] font-extralight tracking-tight text-foreground/80">Check your email</h1>
                <p className="text-[14px] text-foreground/50">We sent a 6-digit code to <span className="text-foreground/70">{expiredEmailState || resendEmail}</span></p>
              </div>
              <label htmlFor="otp-input" className="w-full cursor-text">
                <div className="flex justify-center gap-2">
                  {[0,1,2,3,4,5].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-11 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-medium font-mono transition-all duration-200 bg-background/60 backdrop-blur-sm",
                        otpDigits[i] ? 'border-foreground/20' : 'border-border',
                        i === otpCode.length && otpCode.length < 6 ? 'border-foreground/40 ring-2 ring-foreground/10' : ''
                      )}
                    >
                      {otpDigits[i] || <span className="text-foreground/20">·</span>}
                    </div>
                  ))}
                </div>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="sr-only" autoFocus id="otp-input"
                />
              </label>
              <form className="w-full space-y-3">
                <SubmitButton formAction={handleVerifyOtp} className="w-full h-11 text-sm" pendingText="Verifying…" disabled={otpCode.length !== 6}>
                  Verify code
                </SubmitButton>
                {provider && (
                  <Button asChild variant="outline" className="w-full h-11">
                    <a href={provider.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                      <ExternalLink className="size-4" />{t('openProvider', { provider: provider.name })}
                    </a>
                  </Button>
                )}
              </form>
              <button
                onClick={async () => {
                  setAutoSendingCode(true);
                  try {
                    const res = await backendApi.post('/auth/send-otp', { email: expiredEmailState || resendEmail });
                    if (res.success) { setOtpCode(''); toast.success('New code sent!'); }
                    else toast.error('Failed to send code');
                  } catch { toast.error('Failed to send code'); }
                  finally { setAutoSendingCode(false); }
                }}
                className="text-[12px] text-foreground/40 hover:text-foreground/60 transition-colors"
              >
                Didn&apos;t receive it? <span className="underline underline-offset-2">Send again</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 w-full max-w-[340px]">
              <KortixLogo size={28} />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-[28px] font-extralight tracking-tight text-foreground/80">{t('magicLinkExpired')}</h1>
                <p className="text-[14px] text-foreground/50 max-w-[260px]">
                  {autoSendError ? "We couldn't send a code automatically. Try again below." : t('magicLinkExpiredDescription')}
                </p>
              </div>
              <form className="w-full space-y-3">
                {!expiredEmailState && (
                  <Input name="email" type="email" placeholder={t('emailAddress')} required onChange={(e) => setResendEmail(e.target.value)} className="h-11" />
                )}
                <SubmitButton formAction={handleSendOtpCode} className="w-full h-11 text-sm" pendingText="Sending…" disabled={!expiredEmailState && !resendEmail}>
                  Send verification code
                </SubmitButton>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Lock screen + auth form ── */
  return (
    <div
      className="fixed inset-0 overflow-hidden cursor-pointer"
      onClick={() => phase === 'lock' && setPhase('form')}
    >
      {/* Wallpaper always visible */}
      <WallpaperBackground />

      {/* ── Lock phase: clock + hint ── */}
      <AnimatePresence>
        {phase === 'lock' && (
          <motion.div
            key="lock"
            className="absolute inset-0 z-10 flex flex-col pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Clock — upper area */}
            <motion.div
              className="flex justify-center pt-[12vh] sm:pt-[14vh]"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <LiveClock />
            </motion.div>

            {/* Profile icon — centered */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-foreground/[0.04] border border-foreground/[0.07] backdrop-blur-sm shadow-[0_2px_24px_rgba(0,0,0,0.08)]">
                <svg viewBox="0 0 30 25" className="h-7 sm:h-8 w-auto text-foreground/70">
                  <path d={SYMBOL} fill="currentColor" />
                </svg>
              </div>
            </motion.div>

            {/* Hint — bottom area */}
            <motion.div
              className="absolute bottom-[10vh] left-0 right-0 flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-foreground/50 text-[14px] font-medium tracking-wide">
                  Kortix
                </p>
                <p className="text-foreground/25 text-[12px] tracking-widest uppercase">
                  Click or press Enter to sign in
                </p>
              </div>
              {/* Scroll indicator */}
              <motion.div
                animate={{ y: [0, 5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChevronRight className="size-3.5 text-foreground/20 rotate-90" />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form phase: frosted glass card slides up ── */}
      <AnimatePresence>
        {phase === 'form' && (
          <motion.div
            key="form"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-default"
            onClick={() => setPhase('lock')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Soft blur overlay */}
            <motion.div
              className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />

            {/* Auth card — slides up from bottom */}
            <motion.div
              className="relative z-10 w-full max-w-[360px] mx-4"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="bg-background/75 dark:bg-background/70 backdrop-blur-2xl border border-foreground/[0.08] rounded-2xl p-7">
                {/* Header */}
                <div className="flex flex-col items-center mb-6">
                  <h1 className="text-[17px] font-medium text-foreground/90 tracking-tight">
                    Sign in to Kortix
                  </h1>
                  <p className="text-[13px] text-foreground/40 mt-0.5">
                    Your AI Computer
                  </p>
                </div>

                {/* Google OAuth */}
                <div className="space-y-3 mb-4">
                  <Suspense fallback={<div className="h-11 bg-foreground/[0.04] rounded-xl animate-pulse" />}>
                    <GoogleSignIn returnUrl={returnUrl || undefined} referralCode={referralCode} />
                  </Suspense>
                </div>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-foreground/[0.08]" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="px-2 bg-transparent text-foreground/30">or continue with email</span>
                  </div>
                </div>

                {/* Email form */}
                <form className="space-y-3">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Email address"
                    required
                    className="h-11 text-[15px] bg-foreground/[0.04] border-foreground/[0.08] rounded-xl"
                  />

                  {referralCodeParam && (
                    <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl p-2.5">
                      <p className="text-[11px] text-foreground/40 mb-0.5">Referral Code</p>
                      <p className="text-sm font-semibold">{referralCode}</p>
                    </div>
                  )}
                  {!referralCodeParam && <input type="hidden" name="referralCode" value={referralCode} />}

                  {/* GDPR */}
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="gdprConsent"
                      checked={acceptedTerms}
                      onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                      required
                      className="h-4 w-4 mt-0.5"
                    />
                    <label htmlFor="gdprConsent" className="text-[11px] text-foreground/40 leading-relaxed cursor-pointer select-none flex-1">
                      I accept the{' '}
                      <a href="https://www.kortix.com/legal?tab=privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground/60">
                        Privacy Policy
                      </a>{' '}
                      and{' '}
                      <a href="https://www.kortix.com/legal?tab=terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground/60">
                        Terms of Service
                      </a>
                    </label>
                  </div>

                  <div className="relative">
                    <SubmitButton
                      formAction={handleAuth}
                      className="w-full h-11 text-sm rounded-xl shadow-none"
                      pendingText="Sending…"
                      disabled={!acceptedTerms}
                    >
                      Send magic link
                    </SubmitButton>
                    {wasEmailLastMethod && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background shadow-sm">
                        <div className="w-full h-full bg-green-500 rounded-full animate-pulse" />
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-foreground/30 text-center">
                    We&apos;ll send a secure link — no password needed.
                  </p>
                </form>

                {/* Referral + back to lock */}
                <div className="flex items-center justify-between mt-4">
                  {!referralCodeParam ? (
                    <button
                      type="button"
                      onClick={() => setShowReferralDialog(true)}
                      className="text-[11px] text-foreground/30 hover:text-foreground/50 transition-colors"
                    >
                      Have a referral code?
                    </button>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={() => setPhase('lock')}
                    className="text-[11px] text-foreground/25 hover:text-foreground/45 transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReferralCodeDialog
        open={showReferralDialog}
        onOpenChange={setShowReferralDialog}
        referralCode={referralCode}
        onCodeChange={(code) => { setReferralCode(code); setShowReferralDialog(false); }}
      />
    </div>
  );
}

/* ─── Self-hosted check ─────────────────────────────────────────────────── */

import { isSelfHosted, isBillingEnabled } from '@/lib/config';
import { SelfHostedForm, useInstallStatus } from '@/components/auth/self-hosted-auth';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

function SelfHostedLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { installed, loading: statusLoading, sandboxProviders, defaultProvider } = useInstallStatus();
  const returnUrl = searchParams.get('returnUrl') || searchParams.get('redirect');
  const [phase, setPhase] = useState<'lock' | 'form'>('lock');
  const [wizardStepLoading, setWizardStepLoading] = useState(true);
  const wizardStepRef = useRef(1);
  const [wizardStep, setWizardStep] = useState(1);
  /** Whether sandbox status has been checked on page load (for authenticated returning users). */
  const [sandboxChecked, setSandboxChecked] = useState(false);

  // Fetch wizard step from the backend once the user is authenticated.
  // This replaces the old sessionStorage approach so the step survives
  // across login/logout cycles and browser tab closes.
  useEffect(() => {
    if (isLoading || !user) {
      // Not logged in yet — default to step 1, done loading
      setWizardStepLoading(false);
      return;
    }
    let cancelled = false;
    const fetchStep = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
        const supabaseClient = createBrowserSupabaseClient();
        const { data } = await supabaseClient.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) { if (!cancelled) setWizardStepLoading(false); return; }
        const res = await fetch(`${backendUrl}/setup/setup-wizard-step`, {
          headers: { 'Authorization': `Bearer ${jwt}` },
        });
        if (!cancelled && res.ok) {
          const { step } = await res.json();
          if (step > 0) {
            wizardStepRef.current = step;
            setWizardStep(step);
          }
        }
      } catch {
        // Failed to fetch — default to step 1
      }
      if (!cancelled) setWizardStepLoading(false);
    };
    fetchStep();
    return () => { cancelled = true; };
  }, [isLoading, user]);

  const handleWizardStepChange = useCallback((step: number) => {
    wizardStepRef.current = step;
    setWizardStep(step);
    // Persist step to backend (fire-and-forget)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
    const supabaseClient = createBrowserSupabaseClient();
    supabaseClient.auth.getSession().then(({ data }) => {
      const jwt = data.session?.access_token;
      if (!jwt) return;
      fetch(`${backendUrl}/setup/setup-wizard-step`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      }).catch(() => {});
    });
  }, []);

  // For authenticated users with an existing install, check if sandbox is
  // actually ready before redirecting. If not ready, drop them into wizard step 2.
  useEffect(() => {
    if (isLoading || wizardStepLoading || !user || installed !== true || sandboxChecked) return;
    if (wizardStepRef.current > 1) { setSandboxChecked(true); return; }

    const checkSandboxReady = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008/v1';
        const supabaseClient = createBrowserSupabaseClient();
        const { data } = await supabaseClient.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) { setSandboxChecked(true); return; }

        const res = await fetch(`${backendUrl}/platform/init/local/status`, {
          headers: { 'Authorization': `Bearer ${jwt}` },
        });
        if (!res.ok) { setSandboxChecked(true); return; }
        const statusData = await res.json();

        if (statusData.status === 'ready') {
          // Sandbox is provisioned — check if the user already completed
          // onboarding (existing users). If so, setup was implicitly done.
          try {
            const obRes = await fetch(`${backendUrl}/setup/onboarding-status`, {
              headers: { 'Authorization': `Bearer ${jwt}` },
            });
            if (obRes.ok) {
              const obData = await obRes.json();
              if (obData.complete) {
                // Already fully onboarded — skip setup check
                sessionStorage.setItem('setup_complete', 'true');
                sessionStorage.setItem('onboarding_complete', 'true');
                setSandboxChecked(true);
                return;
              }
            }
          } catch {
            // Onboarding check failed — fall through to setup check
          }

          // Not onboarded yet — check DB setup status.
          // If check fails for any reason, default to showing the wizard
          // (safer than redirecting to a broken dashboard).
          let setupComplete = false;
          try {
            const setupRes = await fetch(`${backendUrl}/setup/setup-status`, {
              headers: { 'Authorization': `Bearer ${jwt}` },
            });
            if (setupRes.ok) {
              const setupData = await setupRes.json();
              setupComplete = !!setupData.complete;
            }
          } catch {
            // Setup status check failed — treat as incomplete
          }

          if (!setupComplete) {
            // Setup wizard not complete — drop to step 2 (provider setup)
            handleWizardStepChange(2);
            setSandboxChecked(true);
            return;
          }
          sessionStorage.setItem('setup_complete', 'true');
          setSandboxChecked(true);
        } else {
          // Sandbox not ready (error, none, pulling, etc.) — go to wizard step 2
          handleWizardStepChange(2);
          setSandboxChecked(true);
        }
      } catch {
        // Network error — allow redirect, dashboard will handle it
        setSandboxChecked(true);
      }
    };
    checkSandboxReady();
  }, [isLoading, wizardStepLoading, user, installed, sandboxChecked, handleWizardStepChange]);

  useEffect(() => {
    if (isLoading || wizardStepLoading || !user || !sandboxChecked) return;
    // Fresh self-hosted install: do not auto-redirect to onboarding yet.
    // The installer wizard must complete provider + keys first.
    if (installed === false) return;
    if (wizardStepRef.current > 1) return;
    const defaultDest = isBillingEnabled() ? '/subscription' : '/onboarding';
    router.push(returnUrl || defaultDest);
  }, [user, isLoading, wizardStepLoading, installed, returnUrl, router, wizardStep, sandboxChecked]);

  // Keyboard controls: Enter/Space opens form, Escape closes it
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === 'lock' && (e.key === 'Enter' || e.key === ' ')) {
        setPhase('form');
      }
      if (phase === 'form' && e.key === 'Escape') {
        setPhase('lock');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  if (isLoading || wizardStepLoading || statusLoading || (!sandboxChecked && installed !== false && user) || (sandboxChecked && installed !== false && user && wizardStepRef.current <= 1)) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <KortixLoader size="medium" />
      </div>
    );
  }

  // Wizard steps 2+ (provider, tool keys): skip lock screen, show form directly over wallpaper
  if (wizardStep > 1) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <WallpaperBackground />
        <div className="relative z-10 flex h-full items-center justify-center px-4 py-16">
          <div className="w-full max-w-[400px] bg-background/75 dark:bg-background/70 backdrop-blur-2xl border border-foreground/[0.08] rounded-2xl p-7">
            <SelfHostedForm
              returnUrl={returnUrl}
              installed={installed}
              initialStep={(wizardStep as 1 | 2 | 3)}
              sandboxProviders={sandboxProviders}
              defaultProvider={defaultProvider}
              onWizardStepChange={handleWizardStepChange}
            />
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Lock screen → frosted glass auth form
  return (
    <div
      className="fixed inset-0 overflow-hidden cursor-pointer"
      onClick={() => phase === 'lock' && setPhase('form')}
    >
      <WallpaperBackground />

      {/* ── Lock phase: clock + hint ── */}
      <AnimatePresence>
        {phase === 'lock' && (
          <motion.div
            key="lock"
            className="absolute inset-0 z-10 flex flex-col pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="flex justify-center pt-[12vh] sm:pt-[14vh]"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <LiveClock />
            </motion.div>
            <motion.div
              className="absolute bottom-[10vh] left-0 right-0 flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-foreground/50 text-[14px] font-medium tracking-wide">Kortix</p>
                <p className="text-foreground/25 text-[12px] tracking-widest uppercase">Click or press Enter to sign in</p>
              </div>
              <motion.div
                animate={{ y: [0, 5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChevronRight className="size-3.5 text-foreground/20 rotate-90" />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form phase: frosted glass card with SelfHostedForm ── */}
      <AnimatePresence>
        {phase === 'form' && (
          <motion.div
            key="form"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-default"
            onClick={() => setPhase('lock')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
            <motion.div
              className="relative z-10 w-full max-w-[400px] mx-4"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="bg-background/75 dark:bg-background/70 backdrop-blur-2xl border border-foreground/[0.08] rounded-2xl p-7">

                <SelfHostedForm
                  returnUrl={returnUrl}
                  installed={installed}
                  initialStep={(wizardStep as 1 | 2 | 3)}
                  sandboxProviders={sandboxProviders}
                  defaultProvider={defaultProvider}
                  onWizardStepChange={handleWizardStepChange}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Default export ────────────────────────────────────────────────────── */

export default function Login() {
  if (isSelfHosted()) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-background flex items-center justify-center"><KortixLoader size="medium" /></div>}>
        <SelfHostedLoginContent />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-background flex items-center justify-center"><KortixLoader size="medium" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
