import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { describePatientAuthError } from "@/lib/auth-errors";
import { getAppRoute } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control":"no-store", "Referrer-Policy":"no-referrer"}});
  if (process.env.PATIENT_INVITE_LINK_ONLY_ENABLED !== "true") return reply({error:"Clinician-assisted recovery is unavailable."},503);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret=process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !secret) return reply({error:"Account recovery is not configured."},503);
  try {
    if (Number(request.headers.get("content-length"))>16384) return reply({error:"Invalid request."},400);
    const raw=await request.text();
    if(raw.length>16384) return reply({error:"Invalid request."},400);
    const body=JSON.parse(raw);
    const options={auth:{persistSession:false,autoRefreshToken:false}};
    if (body.action === "issue" || body.action === "revoke") {
      const bearer=request.headers.get("authorization");
      if(!bearer?.startsWith("Bearer ")) return reply({error:"Sign in again."},401);
      if(!/^[0-9a-f-]{36}$/i.test(body.patientId??"")) return reply({error:"Invalid patient."},400);
      const client=createClient(url,key,{...options,global:{headers:{Authorization:bearer}}});
      const {data:user,error}=await client.auth.getUser(bearer.slice(7));
      if(error || !user.user) return reply({error:"Sign in again."},401);
      const base=getAppRoute("/recover");
      const {data,error:issueError}=await client.rpc("manage_patient_password_reset",{p_patient_id:body.patientId,p_action:body.action});
      if(issueError?.message === "Wait before generating another reset link") return reply({code:"reset_cooldown",error:"A reset link was recently generated. Wait at least 60 seconds before generating another."},429);
      if(issueError?.message === "Generate a current pilot invitation first") return reply({code:"pilot_invitation_required",error:"Generate a new private-pilot invitation for this patient first, then generate the password reset link."},409);
      if(issueError?.message === "Patient unavailable") return reply({code:"patient_access_denied",error:"Patient unavailable or access denied. Open a patient record you own and try again."},403);
      if(issueError?.message === "Account is not eligible for this patient") return reply({code:"account_not_eligible",error:"This account cannot be reset from this patient record. Check the patient email and account association; clinician and other patients' accounts cannot be reset here."},409);
      if(issueError || !data) return reply({error:"Reset unavailable. Generate a current pilot invitation for an unfinished signup, or check that the account belongs to this patient. Wait 60 seconds between links."},409);
      return reply(body.action==="revoke"?{status:"revoked"}:{status:"pending",link:`${base}#token=${encodeURIComponent(data.token)}`});
    }
    if(body.action!=="reset" || !/^[a-f0-9]{64}$/.test(body.token??"") || typeof body.email!=="string"
      || body.email.length>254 || typeof body.password!=="string" || body.password.length<12 || body.password.length>128)
      return reply({error:"Enter your email and a new password of 12–128 characters."},400);
    const admin=createClient(url,secret,options);
    const {data:target,error}=await admin.rpc("consume_patient_password_reset",{p_token:body.token,p_email:body.email.trim().toLowerCase()});
    if(error || !target?.userId) return reply({code:"reset_unavailable",error:"This reset link is expired, revoked, already used, or the email does not match. Check the account email. If it is correct, ask your clinician for a new reset link."},409);
    const {error:updateError}=await admin.auth.admin.updateUserById(target.userId,{
      password:body.password,
      ...(target.unconfirmed?{email_confirm:true,app_metadata:{signup_assurance:"clinician_recovery_link",email_ownership_verified:false}}:{}),
    });
    if(updateError) {
      const failure=describePatientAuthError(updateError);
      return reply({code:failure.code,linkUsed:true,error:`${failure.error} This reset link is now used. Ask your clinician for a new reset link before trying again.`},failure.status);
    }
    return reply({updated:true});
  } catch {
    // Never log passwords, reset tokens, request bodies or provider responses.
    return reply({error:"Account recovery could not be completed. Ask your clinician for a new link."},503);
  }
}
