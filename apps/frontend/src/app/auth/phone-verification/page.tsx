import type { Metadata } from 'next';
import { PhoneVerificationPage } from "@/components/auth/phone-verification/phone-verification-page";

export const metadata: Metadata = {
  title: 'Phone Verification',
  description: 'Verify your phone number to complete your Kortix account setup.',
};

export default function PhoneVerificationRoute() {
  return <PhoneVerificationPage />;
}