import type { Metadata } from 'next';
import { PhoneVerificationPage } from "@/components/auth/phone-verification/phone-verification-page";

export const metadata: Metadata = {
  title: 'Verify Your Phone Number',
  description:
    'Verify your phone number to continue using your Kortix account.',
};

export default function PhoneVerificationRoute() {
  return <PhoneVerificationPage />;
}
