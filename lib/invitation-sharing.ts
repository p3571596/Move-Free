// Sharing is independent of invitation issuance and account onboarding.
export function invitationMessage(link: string) {
  if (new URL(link).pathname === "/recover") return `Use this private Move Free link to choose a new password: ${link} It expires in 30 minutes and works once. Do not forward it.`;
  const instruction = new URL(link).hash.includes("mode=pilot") ? "Create your account to continue." : "Verify your email to continue.";
  return `You have a secure Move Free invitation: ${link} ${instruction} This link expires in 7 days.`;
}

export function textInvitationHref(link: string) {
  // Empty recipient opens the native composer; never infer or expose patient contact.
  return `sms:?&body=${encodeURIComponent(invitationMessage(link))}`;
}
