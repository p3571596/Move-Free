// Sharing is independent of invitation issuance and account onboarding.
export function invitationMessage(link: string) {
  return `You have a secure Move Free invitation: ${link} Verify your email to continue. This link expires in 7 days.`;
}

export function textInvitationHref(link: string) {
  // Empty recipient opens the native composer; never infer or expose patient contact.
  return `sms:?&body=${encodeURIComponent(invitationMessage(link))}`;
}
