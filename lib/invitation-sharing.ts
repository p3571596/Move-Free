// Sharing is independent of invitation issuance and account onboarding.
export function invitationMessage(link: string) {
  const instruction = new URL(link).hash.includes("mode=pilot") ? "Create your account to continue." : "Verify your email to continue.";
  return `You have a secure Move Free invitation: ${link} ${instruction} This link expires in 7 days.`;
}

export function textInvitationHref(link: string) {
  // Empty recipient opens the native composer; never infer or expose patient contact.
  return `sms:?&body=${encodeURIComponent(invitationMessage(link))}`;
}
